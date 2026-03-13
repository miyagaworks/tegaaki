import data from '../data/kanjidic.json'

export type KanjiEntry = {
  kanji: string
  on: string[]
  kun: string[]
  strokes: number
  variants?: string[]
}

const entries: KanjiEntry[] = data as KanjiEntry[]
const kanjiMap = new Map<string, KanjiEntry>()
for (const e of entries) {
  kanjiMap.set(e.kanji, e)
}

export function findByKanji(char: string): KanjiEntry | undefined {
  return kanjiMap.get(char)
}

function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  )
}

function isHiragana(str: string): boolean {
  return /^[\u3040-\u309F]+$/.test(str)
}

export function findByReading(input: string): KanjiEntry[] {
  const query = katakanaToHiragana(input)
  if (!isHiragana(query)) return []

  return entries
    .filter((e) => {
      for (const k of e.kun) {
        const base = katakanaToHiragana(k.split('.')[0])
        if (base.startsWith(query)) return true
      }
      for (const o of e.on) {
        if (katakanaToHiragana(o).startsWith(query)) return true
      }
      return false
    })
    .sort((a, b) => a.strokes - b.strokes)
    .slice(0, 50)
}

export function isKanji(char: string): boolean {
  const code = char.codePointAt(0)
  if (code === undefined) return false
  return code >= 0x4e00 && code <= 0x9fff
}
