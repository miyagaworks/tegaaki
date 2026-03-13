import { IoChevronBack } from 'react-icons/io5'
import type { KanjiEntry } from '../lib/kanjidb'

interface KanjiDetailProps {
  entry: KanjiEntry
  onSelectVariant: (kanji: string) => void
  onBack: () => void
}

function formatKun(kun: string): string {
  const parts = kun.split('.')
  if (parts.length === 2) return `${parts[0]}(${parts[1]})`
  return kun
}

export function KanjiDetail({ entry, onSelectVariant, onBack }: KanjiDetailProps) {
  return (
    <div className="detail-screen">
      <header className="detail-header">
        <button className="back-button" type="button" onClick={onBack}>
          <IoChevronBack /> 戻る
        </button>
      </header>

      <div className="detail-body">
        <div className="detail-kanji-display">
          {entry.kanji}
        </div>

        <div className="detail-info">
          <span className="kanji-strokes">{entry.strokes}画</span>

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
      </div>
    </div>
  )
}
