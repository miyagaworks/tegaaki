/**
 * モデル量子化スクリプト（float16 → uint8）
 *
 * 現行モデル（デフォルト: public/model/、weightsManifest が float16 量子化）を
 * 読み込み、tf.io.decodeWeights で float32 に復元した上で、
 * テンソルごとの min/max アフィン量子化により uint8 に変換する。
 * tfjs のローダーは manifest の quantization: {dtype:'uint8', scale, min} を
 * ネイティブに復元できるため、モデルトポロジー（modelTopology）はそのまま流用する。
 *
 * int32 の重み（学習対象外の定数、reshape の形状など）は量子化せずそのままコピーする。
 *
 * depthwise conv の重みはチャンネルごとに独立したフィルタが1テンソルに同居して
 * おり、チャンネル間で重みのスケールが大きく異なる（実測で平均絶対値の100倍を
 * 超える外れ値を確認）。1つの scale/min しか持てない per-tensor 量子化とは
 * 根本的に相性が悪く、素朴な min/max はもちろん、外れ値を除くパーセンタイル
 * クリッピングを適用しても改善しなかった（実測: Top-1 が 0〜68% まで悪化）。
 * 該当テンソルは全体の重みの約1.6%に過ぎないため、uint8化せず元の
 * float16 量子化のバイト列をそのまま温存する（KEEP_ORIGINAL_PATTERN）。
 * この除外だけで、残りのテンソルは素朴な min/max 量子化で
 * Top-1 97.3% / Top-10 100%（現行 float16 モデル比で同等以上）を達成した。
 *
 * Usage: npx tsx scripts/quantize-model.ts [srcDir] [outDir]
 *   srcDir: 変換元モデルディレクトリ（デフォルト: public/model、リポジトリルート起点の相対パス可）
 *   outDir: 出力先ディレクトリ（デフォルト: public/model/v2）
 */

import * as tf from '@tensorflow/tfjs'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SRC_DIR = resolve(__dirname, '..', process.argv[2] ?? 'public/model')
const OUT_DIR = resolve(__dirname, '..', process.argv[3] ?? 'public/model/v2')
const SHARD_BYTES = 4 * 1024 * 1024 // 4MiB。元モデルと同じシャードサイズに揃える
// per-tensor 量子化と相性が悪いテンソル（depthwise conv）は uint8化せず温存する
const KEEP_ORIGINAL_PATTERN = /depthwise/i

const DTYPE_BYTES: Record<string, number> = {
  float32: 4,
  float16: 2,
  int32: 4,
  uint16: 2,
  uint8: 1,
  bool: 1,
}

interface WeightSpec {
  name: string
  shape: number[]
  dtype: string
  quantization?: {
    dtype: string
    scale?: number
    min?: number
    original_dtype?: string
  }
}

interface ModelJSON {
  modelTopology: unknown
  format?: string
  generatedBy?: string
  convertedBy?: string
  weightsManifest: { paths: string[]; weights: WeightSpec[] }[]
}

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  // Buffer は共有プールを参照している場合があるため、必ず範囲を明示して切り出す
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

function loadModel(dir: string): {
  modelJSON: ModelJSON
  weightData: ArrayBuffer
  specs: WeightSpec[]
} {
  const modelJSON: ModelJSON = JSON.parse(readFileSync(resolve(dir, 'model.json'), 'utf-8'))
  const specs = modelJSON.weightsManifest.flatMap((g) => g.weights)
  const buffers: Buffer[] = []
  for (const group of modelJSON.weightsManifest) {
    for (const path of group.paths) {
      buffers.push(readFileSync(resolve(dir, path)))
    }
  }
  const weightData = bufferToArrayBuffer(Buffer.concat(buffers))
  return { modelJSON, weightData, specs }
}

function concatToUint8(chunks: ArrayBuffer[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(new Uint8Array(c), offset)
    offset += c.byteLength
  }
  return out
}

async function main() {
  console.log(`Source: ${SRC_DIR}`)
  console.log(`Output: ${OUT_DIR}`)
  mkdirSync(OUT_DIR, { recursive: true })

  const { modelJSON, weightData, specs } = loadModel(SRC_DIR)
  console.log(
    `Decoding ${specs.length} weight tensors (${(weightData.byteLength / 1024 / 1024).toFixed(2)}MB)...`,
  )
  const decoded = tf.io.decodeWeights(weightData, specs)

  const newSpecs: WeightSpec[] = []
  const newChunks: ArrayBuffer[] = []
  // 精度検証用に、量子化前の float32 値をテンソル名ごとに保持しておく
  const originalFloat32 = new Map<string, Float32Array>()
  let quantizedCount = 0
  let keptOriginalCount = 0
  let passthroughCount = 0
  let oldWeightBytes = 0
  let srcOffset = 0

  for (const spec of specs) {
    const t = decoded[spec.name]
    const bytesPerEl = spec.quantization
      ? DTYPE_BYTES[spec.quantization.dtype]
      : DTYPE_BYTES[spec.dtype]
    const byteLen = t.size * bytesPerEl
    oldWeightBytes += byteLen

    if (spec.quantization && KEEP_ORIGINAL_PATTERN.test(spec.name)) {
      // depthwise 等、per-tensor 量子化と相性が悪いテンソルは元のバイト列を
      // そのまま温存する（manifest の quantization もそのまま引き継ぐ）
      const raw = weightData.slice(srcOffset, srcOffset + byteLen)
      newSpecs.push({ name: spec.name, shape: spec.shape, dtype: spec.dtype, quantization: spec.quantization })
      newChunks.push(raw)
      keptOriginalCount++
    } else if (spec.quantization) {
      const data = t.dataSync() as Float32Array
      originalFloat32.set(spec.name, Float32Array.from(data))

      let min = Infinity
      let max = -Infinity
      for (let i = 0; i < data.length; i++) {
        const v = data[i]
        if (v < min) min = v
        if (v > max) max = v
      }
      const range = max - min
      const scale = range > 0 ? range / 255 : 0
      const q = new Uint8Array(data.length)
      for (let i = 0; i < data.length; i++) {
        const v = range > 0 ? Math.round((data[i] - min) / scale) : 0
        q[i] = Math.min(255, Math.max(0, v))
      }
      newSpecs.push({
        name: spec.name,
        shape: spec.shape,
        dtype: 'float32',
        quantization: { dtype: 'uint8', scale, min, original_dtype: 'float32' },
      })
      newChunks.push(q.buffer)
      quantizedCount++
    } else if (spec.dtype === 'int32') {
      const typed = Int32Array.from(t.dataSync() as Int32Array)
      newSpecs.push({ name: spec.name, shape: spec.shape, dtype: spec.dtype })
      newChunks.push(typed.buffer)
      passthroughCount++
    } else {
      throw new Error(`Unexpected unquantized dtype for weight '${spec.name}': ${spec.dtype}`)
    }
    srcOffset += byteLen
    t.dispose()
  }

  console.log(
    `Quantized tensors: ${quantizedCount}, Kept original (float16): ${keptOriginalCount}, Passthrough (int32): ${passthroughCount}`,
  )

  const allBytes = concatToUint8(newChunks)
  const shardCount = Math.max(1, Math.ceil(allBytes.byteLength / SHARD_BYTES))
  const shardPaths: string[] = []
  for (let i = 0; i < shardCount; i++) {
    const start = i * SHARD_BYTES
    const end = Math.min(start + SHARD_BYTES, allBytes.byteLength)
    const name = `group1-shard${i + 1}of${shardCount}.bin`
    writeFileSync(resolve(OUT_DIR, name), Buffer.from(allBytes.buffer, start, end - start))
    shardPaths.push(name)
  }

  const newModelJSON: ModelJSON = {
    modelTopology: modelJSON.modelTopology,
    format: modelJSON.format,
    generatedBy: modelJSON.generatedBy,
    convertedBy: modelJSON.convertedBy,
    weightsManifest: [{ paths: shardPaths, weights: newSpecs }],
  }
  writeFileSync(resolve(OUT_DIR, 'model.json'), JSON.stringify(newModelJSON))

  const labelsSrc = resolve(SRC_DIR, 'labels.txt')
  const labelsData = readFileSync(labelsSrc)
  writeFileSync(resolve(OUT_DIR, 'labels.txt'), labelsData)

  // ── サイズ比較 ────────────────────────────────────────
  const modelJsonBytes = Buffer.byteLength(JSON.stringify(newModelJSON))
  console.log('\n=== サイズ比較 ===')
  console.log(`旧 weight bytes: ${(oldWeightBytes / 1024 / 1024).toFixed(2)}MB`)
  console.log(`新 weight bytes: ${(allBytes.byteLength / 1024 / 1024).toFixed(2)}MB`)
  console.log(`新 shard数: ${shardCount}`)
  console.log(`新 model.json: ${(modelJsonBytes / 1024).toFixed(1)}KB`)
  console.log(`新 labels.txt: ${(labelsData.length / 1024).toFixed(1)}KB`)
  const newTotal = allBytes.byteLength + modelJsonBytes + labelsData.length
  console.log(`新 合計: ${(newTotal / 1024 / 1024).toFixed(2)}MB`)

  // ── 内部整合性チェック: 書き出したファイルを再ロードし復元誤差を確認 ──
  console.log('\n=== 再構成誤差チェック ===')
  const reloaded = loadModel(OUT_DIR)
  const reDecoded = tf.io.decodeWeights(reloaded.weightData, reloaded.specs)
  let maxAbsErr = 0
  let maxRelRange = 0
  for (const [name, original] of originalFloat32) {
    const recon = reDecoded[name].dataSync() as Float32Array
    let localMaxErr = 0
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < original.length; i++) {
      if (original[i] < min) min = original[i]
      if (original[i] > max) max = original[i]
      const err = Math.abs(original[i] - recon[i])
      if (err > localMaxErr) localMaxErr = err
    }
    if (localMaxErr > maxAbsErr) maxAbsErr = localMaxErr
    const range = max - min
    if (range > 0) maxRelRange = Math.max(maxRelRange, localMaxErr / range)
  }
  for (const t of Object.values(reDecoded)) t.dispose()
  console.log(`最大絶対誤差: ${maxAbsErr.toExponential(3)}`)
  console.log(`テンソルレンジに対する最大相対誤差: ${(maxRelRange * 100).toFixed(2)}%`)

  console.log(`\nDone. Output written to ${OUT_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
