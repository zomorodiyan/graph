import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { ColorSchemeProvider } from './context/ColorSchemeContext'
import { ZoomProvider } from './context/ZoomContext'
import { usePinchZoom } from './hooks/usePinchZoom'
import GraphView from './pages/GraphView'
import StructuresView from './pages/StructuresView'
import IosInstallBanner from './components/IosInstallBanner'
import AgentChat from './components/AgentChat'
import './App.css'

function AppContent() {
  usePinchZoom()

  // Whether the docked agent panel and .app-main are each open — lifted up
  // here rather than kept local to AgentChat because .app-body/.app-main
  // both need them: dragging the splitter (>=32rem, see .agent-chat-splitter
  // in App.css) all the way to either edge snaps that side fully closed
  // instead of just stopping at its minimum size, and each side needs a
  // reopen affordance while the other is maximized. Exactly one of these is
  // ever false at a time in practice (see AgentChat.tsx's handleSplitterMove)
  // — both true is the normal split view.
  const [panelOpen, setPanelOpen] = useState(() => localStorage.getItem('agent-panel-open') !== 'false')
  const [mainOpen, setMainOpen] = useState(() => localStorage.getItem('app-main-open') !== 'false')
  useEffect(() => {
    localStorage.setItem('agent-panel-open', String(panelOpen))
  }, [panelOpen])
  useEffect(() => {
    localStorage.setItem('app-main-open', String(mainOpen))
  }, [mainOpen])

  return (
    <div className="app">
      <IosInstallBanner />
      {/* .app-body is the split-view container (desktop/tablet, >=32rem) —
          .app-main scrolls independently on its own side of the grabber
          from the docked AgentChat panel. Below 32rem this is inert (mobile
          keeps document-level scrolling, AgentChat stays a fixed overlay —
          see App.css). */}
      <div className={`app-body${panelOpen ? ' panel-open' : ''}${mainOpen ? '' : ' main-collapsed'}`}>
        <div className={`app-main${mainOpen ? '' : ' app-main-collapsed'}`}>
          <Routes>
            {/* Root: list of all graphs */}
            <Route path="/" element={<StructuresView />} />

            {/* Graph view: /g/{graphName}/* */}
            <Route path="/g/:graphName/*" element={<GraphView />} />

            {/* Unmatched routes go home */}
            <Route path="/*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        {/* Replaces .app-main when the splitter's been dragged all the way
            to its edge (see AgentChat.tsx) — mirrors .agent-panel-reopen on
            the opposite side. */}
        {!mainOpen && (
          <button className="app-main-reopen" onClick={() => setMainOpen(true)} title="Show main content">
            Content
          </button>
        )}
        {/* Mounted outside <Routes> (but still inside the Router from
            main.tsx) so it persists across navigation instead of resetting
            per view. */}
        <AgentChat panelOpen={panelOpen} setPanelOpen={setPanelOpen} mainOpen={mainOpen} setMainOpen={setMainOpen} />
      </div>
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <ColorSchemeProvider>
        <ZoomProvider>
          <AppContent />
        </ZoomProvider>
      </ColorSchemeProvider>
    </ThemeProvider>
  )
}

export default App
