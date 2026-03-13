/**
 * 手書き認識精度テスト
 *
 * Node.js 環境で DaKanji モデルの認識精度を検証する。
 * node-canvas でフォント描画した漢字画像をモデルに入力し、
 * Top-1 / Top-5 / Top-10 正解率を計測する。
 *
 * Usage: npx tsx scripts/test-accuracy.ts
 */

import * as tf from '@tensorflow/tfjs'
import { createCanvas } from 'canvas'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ── Config ──────────────────────────────────────────────

const MODEL_DIR = resolve(__dirname, '../public/model')
const LABELS_PATH = resolve(MODEL_DIR, 'labels.txt')
const KANJIDIC_PATH = resolve(__dirname, '../src/data/kanjidic.json')
const REPORT_PATH = resolve(__dirname, '../docs/accuracy-report.md')
const INPUT_SIZE = 64

// 画数の異なる50字（簡単→複雑を均等に選定）
const TEST_KANJI = [
  // 1-2画
  '一', '二', '七', '九', '人',
  // 3-4画
  '大', '山', '川', '木', '火',
  // 5-6画
  '花', '休', '白', '目', '字',
  // 7-8画
  '男', '足', '雨', '学', '国',
  // 9-10画
  '食', '海', '思', '風', '秋',
  // 11-12画
  '魚', '鳥', '黄', '道', '森',
  // 13-14画
  '漢', '数', '歌', '算', '聞',
  // 15-16画
  '線', '親', '頭', '橋', '器',
  // 17-18画
  '顔', '曜', '鍵', '題', '職',
  // 19画以上
  '鏡', '類', '願', '議', '驚',
]

// macOS で利用可能な明朝体フォント
const FONT_FAMILY = 'Hiragino Mincho ProN'

// ── Model Loading ───────────────────────────────────────

function fileIOHandler(): tf.io.IOHandler {
  return {
    async load() {
      const modelJSON = JSON.parse(
        readFileSync(resolve(MODEL_DIR, 'model.json'), 'utf-8'),
      )
      const weightSpecs = modelJSON.weightsManifest.flatMap(
        (g: { weights: tf.io.WeightsManifestEntry[] }) => g.weights,
      )
      const buffers: Buffer[] = []
      for (const group of modelJSON.weightsManifest) {
        for (const path of group.paths as string[]) {
          buffers.push(readFileSync(resolve(MODEL_DIR, path)))
        }
      }
      const weightData = Buffer.concat(buffers).buffer
      return {
        modelTopology: modelJSON.modelTopology,
        format: modelJSON.format,
        generatedBy: modelJSON.generatedBy,
        convertedBy: modelJSON.convertedBy,
        weightSpecs,
        weightData,
      }
    },
  }
}

async function loadModel() {
  const model = await tf.loadGraphModel(fileIOHandler())
  return model
}

function loadLabels(): string[] {
  const text = readFileSync(LABELS_PATH, 'utf-8')
  return [...text]
}

function loadJoyoSet(): Set<string> {
  const data = JSON.parse(readFileSync(KANJIDIC_PATH, 'utf-8'))
  return new Set(data.map((e: { kanji: string }) => e.kanji))
}

// ── Canvas Drawing ──────────────────────────────────────

function drawKanji(
  char: string,
  offsetX = 0,
  offsetY = 0,
  noise = false,
): Float32Array {
  const canvas = createCanvas(INPUT_SIZE, INPUT_SIZE)
  const ctx = canvas.getContext('2d')

  // 黒背景・白文字（モデルの学習データと同じ）
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE)

  ctx.fillStyle = '#ffffff'
  ctx.font = `50px "${FONT_FAMILY}"`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(char, INPUT_SIZE / 2 + offsetX, INPUT_SIZE / 2 + offsetY)

  // 軽微なノイズ
  if (noise) {
    const imageData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE)
    for (let i = 0; i < imageData.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 6
      imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + n))
      imageData.data[i + 1] = Math.max(
        0,
        Math.min(255, imageData.data[i + 1] + n),
      )
      imageData.data[i + 2] = Math.max(
        0,
        Math.min(255, imageData.data[i + 2] + n),
      )
    }
    ctx.putImageData(imageData, 0, 0)
  }

  // Grayscale → 0〜1正規化（モデル学習時と同じ: 白=1, 黒=0）
  const imageData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE)
  const float32 = new Float32Array(INPUT_SIZE * INPUT_SIZE)
  for (let i = 0; i < INPUT_SIZE * INPUT_SIZE; i++) {
    const r = imageData.data[i * 4]
    const g = imageData.data[i * 4 + 1]
    const b = imageData.data[i * 4 + 2]
    float32[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  }
  return float32
}

// ── Recognition ─────────────────────────────────────────

function recognizeFromTensor(
  model: tf.GraphModel,
  input: Float32Array,
  labels: string[],
  joyoSet: Set<string>,
): string[] {
  const tensor = tf.tensor4d(input, [1, INPUT_SIZE, INPUT_SIZE, 1])
  const output = model.predict(tensor) as tf.Tensor
  const probs = output.dataSync()
  tensor.dispose()
  output.dispose()

  const scored: { char: string; score: number }[] = []
  for (let i = 0; i < probs.length; i++) {
    const char = labels[i]
    if (joyoSet.has(char)) {
      scored.push({ char, score: probs[i] })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 10).map((s) => s.char)
}

// ── Test Variations ─────────────────────────────────────

interface TestCase {
  name: string
  offsetX: number
  offsetY: number
  noise: boolean
}

const TEST_VARIATIONS: TestCase[] = [
  { name: 'clean', offsetX: 0, offsetY: 0, noise: false },
  { name: 'offset', offsetX: 3, offsetY: -2, noise: false },
  { name: 'noisy', offsetX: 0, offsetY: 0, noise: true },
]

// ── Main ────────────────────────────────────────────────

async function main() {
  console.log('Loading model...')
  const model = await loadModel()
  const labels = loadLabels()
  const joyoSet = loadJoyoSet()
  console.log(`Model loaded. Labels: ${labels.length}, Joyo: ${joyoSet.size}`)

  const results: {
    char: string
    variation: string
    top10: string[]
    rank: number | null
  }[] = []

  console.log(`\nTesting ${TEST_KANJI.length} characters × ${TEST_VARIATIONS.length} variations...\n`)

  for (const char of TEST_KANJI) {
    for (const v of TEST_VARIATIONS) {
      const input = drawKanji(char, v.offsetX, v.offsetY, v.noise)
      const top10 = recognizeFromTensor(model, input, labels, joyoSet)
      const rank = top10.indexOf(char)
      results.push({
        char,
        variation: v.name,
        top10,
        rank: rank >= 0 ? rank + 1 : null,
      })
    }
  }

  // ── Aggregate ───────────────────────────────────────

  const total = results.length
  const top1 = results.filter((r) => r.rank === 1).length
  const top5 = results.filter((r) => r.rank !== null && r.rank <= 5).length
  const top10 = results.filter((r) => r.rank !== null).length
  const failed = results.filter((r) => r.rank === null)

  const top1Rate = ((top1 / total) * 100).toFixed(1)
  const top5Rate = ((top5 / total) * 100).toFixed(1)
  const top10Rate = ((top10 / total) * 100).toFixed(1)

  console.log('=== Accuracy Summary ===')
  console.log(`Total tests: ${total}`)
  console.log(`Top-1:  ${top1}/${total} (${top1Rate}%)`)
  console.log(`Top-5:  ${top5}/${total} (${top5Rate}%)`)
  console.log(`Top-10: ${top10}/${total} (${top10Rate}%)`)

  // Per-character summary (aggregate across variations)
  const perChar = new Map<
    string,
    { top1: number; top5: number; top10: number; total: number }
  >()
  for (const r of results) {
    if (!perChar.has(r.char)) {
      perChar.set(r.char, { top1: 0, top5: 0, top10: 0, total: 0 })
    }
    const s = perChar.get(r.char)!
    s.total++
    if (r.rank === 1) s.top1++
    if (r.rank !== null && r.rank <= 5) s.top5++
    if (r.rank !== null) s.top10++
  }

  // ── Misrecognitions ─────────────────────────────────

  const misrecognitions = results.filter((r) => r.rank !== 1)

  // ── Generate Report ─────────────────────────────────

  const now = new Date().toISOString().slice(0, 10)
  let report = `# 手書き認識精度レポート\n\n`
  report += `生成日: ${now}\n\n`
  report += `## テスト条件\n\n`
  report += `| 項目 | 値 |\n|------|-----|\n`
  report += `| モデル | DaKanji EfficientNet-Lite0 (float16量子化) |\n`
  report += `| 入力サイズ | ${INPUT_SIZE}×${INPUT_SIZE} grayscale |\n`
  report += `| テスト文字数 | ${TEST_KANJI.length}字 |\n`
  report += `| バリエーション | ${TEST_VARIATIONS.map((v) => v.name).join(', ')} |\n`
  report += `| 総テスト数 | ${total} |\n`
  report += `| フォント | ${FONT_FAMILY} |\n`
  report += `| フィルタ | 常用漢字2,136字のみ |\n\n`

  report += `## 正解率サマリー\n\n`
  report += `| 指標 | 正解数 | 正解率 | 目標 | 判定 |\n`
  report += `|------|--------|--------|------|------|\n`
  report += `| Top-1 | ${top1}/${total} | ${top1Rate}% | 70% | ${parseFloat(top1Rate) >= 70 ? 'PASS' : 'FAIL'} |\n`
  report += `| Top-5 | ${top5}/${total} | ${top5Rate}% | — | — |\n`
  report += `| Top-10 | ${top10}/${total} | ${top10Rate}% | 90% | ${parseFloat(top10Rate) >= 90 ? 'PASS' : 'FAIL'} |\n\n`

  report += `## 文字別結果\n\n`
  report += `| 文字 | Top-1 | Top-5 | Top-10 |\n`
  report += `|------|-------|-------|--------|\n`
  for (const char of TEST_KANJI) {
    const s = perChar.get(char)!
    const v = TEST_VARIATIONS.length
    report += `| ${char} | ${s.top1}/${v} | ${s.top5}/${v} | ${s.top10}/${v} |\n`
  }

  report += `\n## 誤認識パターン\n\n`
  if (misrecognitions.length === 0) {
    report += `全テストで Top-1 正解。\n`
  } else {
    report += `| 正解 | 条件 | 1位 | 2位 | 3位 | 正解順位 |\n`
    report += `|------|------|-----|-----|-----|----------|\n`
    for (const r of misrecognitions) {
      const rankStr = r.rank !== null ? `${r.rank}位` : '圏外'
      report += `| ${r.char} | ${r.variation} | ${r.top10[0]} | ${r.top10[1]} | ${r.top10[2]} | ${rankStr} |\n`
    }
  }

  report += `\n## 認識失敗（Top-10圏外）\n\n`
  const failedChars = [
    ...new Set(failed.filter((r) => r.rank === null).map((r) => r.char)),
  ]
  if (failedChars.length === 0) {
    report += `なし。全文字が Top-10 以内に入っている。\n`
  } else {
    report += `以下の文字は一部または全てのバリエーションで Top-10 圏外:\n\n`
    for (const char of failedChars) {
      const failedVariations = failed
        .filter((r) => r.char === char)
        .map((r) => r.variation)
      report += `- **${char}**: ${failedVariations.join(', ')}\n`
    }
  }

  writeFileSync(REPORT_PATH, report, 'utf-8')
  console.log(`\nReport saved to: ${REPORT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
