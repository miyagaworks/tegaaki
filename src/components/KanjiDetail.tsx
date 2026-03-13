import type { KanjiEntry } from '../lib/kanjidb'

interface KanjiDetailProps {
  entry: KanjiEntry
  onSelectVariant: (kanji: string) => void
}

function formatKun(kun: string): string {
  const parts = kun.split('.')
  if (parts.length === 2) return `${parts[0]}(${parts[1]})`
  return kun
}

export function KanjiDetail({ entry, onSelectVariant }: KanjiDetailProps) {
  return (
    <div className="kanji-detail">
      <div className="kanji-display">
        <div className="kanji-display-char">{entry.kanji}</div>
      </div>

      <div className="kanji-readings">
        {entry.on.length > 0 && (
          <div className="kanji-reading-row">
            <span className="kanji-reading-label">音読み</span>
            <span className="kanji-reading-value">{entry.on.join('・')}</span>
          </div>
        )}
        {entry.kun.length > 0 && (
          <div className="kanji-reading-row">
            <span className="kanji-reading-label">訓読み</span>
            <span className="kanji-reading-value">{entry.kun.map(formatKun).join('・')}</span>
          </div>
        )}
      </div>

      <span className="kanji-strokes">{entry.strokes}画</span>

      {entry.variants && entry.variants.length > 0 && (
        <div className="kanji-variants">
          <div className="kanji-variants-label">異体字・旧字体</div>
          <div className="kanji-variants-list">
            {entry.variants.map((v) => (
              <button
                key={v}
                className="variant-button"
                type="button"
                onClick={() => onSelectVariant(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
