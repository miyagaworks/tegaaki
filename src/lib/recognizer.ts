export interface RecognizeResult {
  candidates: string[]
}

type TF = typeof import('@tensorflow/tfjs')

let tf: TF | null = null
let model: import('@tensorflow/tfjs').GraphModel | null = null
let labels: string[] = []
let joyoSet: Set<string> | null = null
let initPromise: Promise<void> | null = null

async function loadLabels(): Promise<string[]> {
  const res = await fetch('/model/labels.txt')
  const text = await res.text()
  return [...text]
}

async function loadJoyoSet(): Promise<Set<string>> {
  const { default: data } = await import('../data/kanjidic.json')
  return new Set((data as { kanji: string }[]).map((e) => e.kanji))
}

async function ensureModel(): Promise<void> {
  if (model) return
  if (initPromise) return initPromise
  initPromise = (async () => {
    tf = await import('@tensorflow/tfjs')
    const [m, l, j] = await Promise.all([
      tf.loadGraphModel('/model/model.json'),
      loadLabels(),
      loadJoyoSet(),
    ])
    model = m
    labels = l
    joyoSet = j
  })()
  return initPromise
}

export async function recognize(
  canvas: HTMLCanvasElement,
): Promise<RecognizeResult> {
  await ensureModel()

  const input = preprocessCanvas(canvas)
  const tensor = tf!.tensor4d(input, [1, 64, 64, 1])

  const output = model!.predict(tensor) as import('@tensorflow/tfjs').Tensor
  const probs = await output.data()

  tensor.dispose()
  output.dispose()

  const scored: { char: string; score: number }[] = []
  for (let i = 0; i < probs.length; i++) {
    const char = labels[i]
    if (joyoSet!.has(char)) {
      scored.push({ char, score: probs[i] })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  const candidates = scored.slice(0, 10).map((s) => s.char)

  return { candidates }
}

export function preprocessCanvas(canvas: HTMLCanvasElement): Float32Array {
  const size = 64
  const padding = 4 // px padding around the character

  // Find bounding box of drawn strokes
  const srcCtx = canvas.getContext('2d')!
  const srcData = srcCtx.getImageData(0, 0, canvas.width, canvas.height)
  let minX = canvas.width,
    minY = canvas.height,
    maxX = 0,
    maxY = 0
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const a = srcData.data[(y * canvas.width + x) * 4 + 3]
      if (a > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  // Fallback if nothing drawn
  if (maxX <= minX || maxY <= minY) {
    return new Float32Array(size * size)
  }

  // Make the crop region square (centered on the strokes)
  const bw = maxX - minX
  const bh = maxY - minY
  const side = Math.max(bw, bh)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const cropX = cx - side / 2
  const cropY = cy - side / 2

  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = size
  tempCanvas.height = size
  const tempCtx = tempCanvas.getContext('2d')!

  // Fill with white background first
  tempCtx.fillStyle = '#ffffff'
  tempCtx.fillRect(0, 0, size, size)

  // Draw the cropped square region into 64x64 with padding
  const drawSize = size - padding * 2
  tempCtx.drawImage(canvas, cropX, cropY, side, side, padding, padding, drawSize, drawSize)

  const imageData = tempCtx.getImageData(0, 0, size, size)
  const float32 = new Float32Array(size * size)
  for (let i = 0; i < size * size; i++) {
    const r = imageData.data[i * 4]
    const g = imageData.data[i * 4 + 1]
    const b = imageData.data[i * 4 + 2]
    float32[i] = 1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255
  }
  return float32
}
