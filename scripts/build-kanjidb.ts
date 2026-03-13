import { readFileSync, writeFileSync, existsSync } from 'fs'
import { XMLParser } from 'fast-xml-parser'

const XML_PATH = 'data/kanjidic2.xml'
const OUTPUT_PATH = 'src/data/kanjidic.json'

if (!existsSync(XML_PATH)) {
  console.error(`Error: ${XML_PATH} not found.`)
  console.error('Download from: http://www.edrdg.org/kanjidic/kanjidic2.xml.gz')
  process.exit(1)
}

console.log('Parsing KANJIDIC2 XML...')
const xml = readFileSync(XML_PATH, 'utf-8')

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) =>
    ['character', 'stroke_count', 'variant', 'reading', 'rmgroup', 'cp_value'].includes(name),
})

const doc = parser.parse(xml)
const characters = doc.kanjidic2.character as Record<string, unknown>[]

interface KanjiEntry {
  kanji: string
  on: string[]
  kun: string[]
  strokes: number
  variants?: string[]
}

// Jouyou kanji: grade 1-8 (1-6 = elementary, 8 = junior high)
const jouyouGrades = new Set([1, 2, 3, 4, 5, 6, 8])

const entries: KanjiEntry[] = []

for (const char of characters) {
  const misc = char.misc as Record<string, unknown>
  const grade = misc.grade as number | undefined

  if (grade === undefined || !jouyouGrades.has(grade)) continue

  const kanji = char.literal as string

  // Stroke count - take first value
  const strokeCounts = misc.stroke_count as (number | string)[]
  const strokes = Number(strokeCounts[0])

  // Variants (UCS type only)
  const rawVariants = (misc.variant ?? []) as Record<string, unknown>[]
  const variants: string[] = []
  for (const v of rawVariants) {
    if (v['@_var_type'] === 'ucs') {
      const code = parseInt(v['#text'] as string, 16)
      if (!isNaN(code)) {
        variants.push(String.fromCodePoint(code))
      }
    }
  }

  // Readings
  const on: string[] = []
  const kun: string[] = []

  const readingMeaning = char.reading_meaning as Record<string, unknown> | undefined
  if (readingMeaning) {
    const rmgroups = (readingMeaning.rmgroup ?? []) as Record<string, unknown>[]
    for (const rmgroup of rmgroups) {
      const readings = (rmgroup.reading ?? []) as Record<string, unknown>[]
      for (const r of readings) {
        const type = r['@_r_type'] as string
        const text = String(r['#text'] ?? '')
        if (type === 'ja_on') on.push(text)
        else if (type === 'ja_kun') kun.push(text)
      }
    }
  }

  const entry: KanjiEntry = { kanji, on, kun, strokes }
  if (variants.length > 0) entry.variants = variants
  entries.push(entry)
}

// Sort by strokes then code point for consistency
entries.sort((a, b) => a.strokes - b.strokes || a.kanji.codePointAt(0)! - b.kanji.codePointAt(0)!)

writeFileSync(OUTPUT_PATH, JSON.stringify(entries))
console.log(`Generated ${OUTPUT_PATH}: ${entries.length} entries`)
