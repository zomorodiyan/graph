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

  return (
    <div className="app">
      <IosInstallBanner />
      <Routes>
        {/* Root: list of all graphs */}
        <Route path="/" element={<StructuresView />} />

        {/* Graph view: /g/{graphName}/* */}
        <Route path="/g/:graphName/*" element={<GraphView />} />

        {/* Unmatched routes go home */}
        <Route path="/*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* Mounted outside <Routes> (but still inside the Router from main.tsx)
          so it persists across navigation instead of resetting per view. */}
      <AgentChat />
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
