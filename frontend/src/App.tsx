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

  // Whether the docked agent panel (>=32rem, see .app-body/.agent-chat-shell
  // in App.css) is open — lifted up here rather than kept local to
  // AgentChat because .app-body itself needs it: it only forces a
  // 100vh/overflow:hidden split-view shell while something is actually
  // docked in it, so a closed panel leaves main content free to size to its
  // natural height exactly like before this feature existed.
  const [panelOpen, setPanelOpen] = useState(() => localStorage.getItem('agent-panel-open') !== 'false')
  useEffect(() => {
    localStorage.setItem('agent-panel-open', String(panelOpen))
  }, [panelOpen])

  return (
    <div className="app">
      <IosInstallBanner />
      {/* .app-body is the split-view container (desktop/tablet, >=32rem) —
          .app-main scrolls independently on its own side of the grabber
          from the docked AgentChat panel. Below 32rem this is inert (mobile
          keeps document-level scrolling, AgentChat stays a fixed overlay —
          see App.css). */}
      <div className={`app-body${panelOpen ? ' panel-open' : ''}`}>
        <div className="app-main">
          <Routes>
            {/* Root: list of all graphs */}
            <Route path="/" element={<StructuresView />} />

            {/* Graph view: /g/{graphName}/* */}
            <Route path="/g/:graphName/*" element={<GraphView />} />

            {/* Unmatched routes go home */}
            <Route path="/*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        {/* Mounted outside <Routes> (but still inside the Router from
            main.tsx) so it persists across navigation instead of resetting
            per view. */}
        <AgentChat panelOpen={panelOpen} setPanelOpen={setPanelOpen} />
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
