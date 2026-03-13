import { useState } from 'react'
import { findByKanji } from './lib/kanjidb'
import type { KanjiEntry } from './lib/kanjidb'
import { DrawTab } from './components/DrawTab'
import { KeyboardTab } from './components/KeyboardTab'
import { CandidateList } from './components/CandidateList'
import { KanjiDetail } from './components/KanjiDetail'

function App() {
  const [activeTab, setActiveTab] = useState<'draw' | 'keyboard'>('draw')
  const [selectedKanji, setSelectedKanji] = useState<KanjiEntry | null>(null)
  const [candidates, setCandidates] = useState<string[]>([])

  const handleSelectCandidate = (kanji: string) => {
    const entry = findByKanji(kanji)
    if (entry) {
      setSelectedKanji(entry)
    }
  }

  const handleSelectVariant = (kanji: string) => {
    handleSelectCandidate(kanji)
  }

  const handleBack = () => {
    setSelectedKanji(null)
  }

  // Detail page
  if (selectedKanji) {
    return (
      <KanjiDetail
        entry={selectedKanji}
        onSelectVariant={handleSelectVariant}
        onBack={handleBack}
      />
    )
  }

  // Main page
  return (
    <div className="main-screen">
      <header className="title-bar">
        <img src="/images/logo.svg" alt="Tegaaki" className="title-logo" />
        <div className="tab-bar" role="tablist">
          <button
            className="tab-button"
            role="tab"
            aria-selected={activeTab === 'draw'}
            onClick={() => setActiveTab('draw')}
          >
            手書き
          </button>
          <button
            className="tab-button"
            role="tab"
            aria-selected={activeTab === 'keyboard'}
            onClick={() => setActiveTab('keyboard')}
          >
            キーボード
          </button>
        </div>
      </header>

      <div
        className="tab-panel"
        role="tabpanel"
        data-active={activeTab === 'draw'}
      >
        <div className="draw-screen">
          <DrawTab setCandidates={setCandidates} />
        </div>
        {candidates.length > 0 && (
          <div className="candidates-bar">
            <CandidateList
              candidates={candidates}
              selected={null}
              onSelect={handleSelectCandidate}
            />
          </div>
        )}
      </div>

      <div
        className="tab-panel"
        role="tabpanel"
        data-active={activeTab === 'keyboard'}
      >
        <KeyboardTab
          setCandidates={setCandidates}
          setSelectedKanji={setSelectedKanji}
        />
        {candidates.length > 0 && (
          <div style={{ padding: '0 16px' }}>
            <CandidateList
              candidates={candidates}
              selected={null}
              onSelect={handleSelectCandidate}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default App
