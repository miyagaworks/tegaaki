import { useState } from 'react'
import { findByKanji, findByReading, isKanji } from '../lib/kanjidb'
import type { KanjiEntry } from '../lib/kanjidb'

interface KeyboardTabProps {
  setCandidates: (candidates: string[]) => void
  setSelectedKanji: (entry: KanjiEntry | null) => void
}

function isHiragana(str: string): boolean {
  return /^[\u3040-\u309F]+$/.test(str)
}

export function KeyboardTab({
  setCandidates,
  setSelectedKanji,
}: KeyboardTabProps) {
  const [query, setQuery] = useState('')
  const [noResults, setNoResults] = useState(false)

  const handleInput = (value: string) => {
    setQuery(value)
    setNoResults(false)

    if (!value) {
      setCandidates([])
      setSelectedKanji(null)
      return
    }

    // Single kanji -> direct detail
    if (value.length === 1 && isKanji(value)) {
      const entry = findByKanji(value)
      if (entry) {
        setCandidates([])
        setSelectedKanji(entry)
      } else {
        setCandidates([])
        setSelectedKanji(null)
        setNoResults(true)
      }
      return
    }

    // Hiragana -> reading search
    if (isHiragana(value)) {
      const results = findByReading(value)
      if (results.length > 0) {
        setCandidates(results.map((e) => e.kanji))
        setSelectedKanji(null)
      } else {
        setCandidates([])
        setSelectedKanji(null)
        setNoResults(true)
      }
      return
    }

    // Katakana, multi-kanji, etc -> show nothing
    setCandidates([])
    setSelectedKanji(null)
  }

  const handleClear = () => {
    setQuery('')
    setNoResults(false)
    setCandidates([])
    setSelectedKanji(null)
  }

  return (
    <div className="keyboard-tab">
      <div className="search-input-wrapper">
        <input
          className="search-input"
          type="text"
          placeholder="漢字またはひらがなで検索"
          value={query}
          onInput={(e) => handleInput((e.target as HTMLInputElement).value)}
        />
        {query && (
          <button
            className="search-clear-button"
            type="button"
            onClick={handleClear}
          >
            ✕
          </button>
        )}
      </div>
      {noResults && (
        <p className="empty-message">該当する漢字が見つかりません</p>
      )}
    </div>
  )
}
