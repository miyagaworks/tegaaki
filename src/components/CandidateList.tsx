interface CandidateListProps {
  candidates: string[]
  selected: string | null
  onSelect: (kanji: string) => void
}

export function CandidateList({
  candidates,
  selected,
  onSelect,
}: CandidateListProps) {
  return (
    <div className="candidate-list">
      {candidates.map((kanji) => (
        <button
          key={kanji}
          className="candidate-button"
          type="button"
          aria-selected={kanji === selected}
          onClick={() => onSelect(kanji)}
        >
          {kanji}
        </button>
      ))}
    </div>
  )
}
