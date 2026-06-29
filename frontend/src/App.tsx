import { Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { ColorSchemeProvider } from './context/ColorSchemeContext'
import { ZoomProvider } from './context/ZoomContext'
import { usePinchZoom } from './hooks/usePinchZoom'
import GraphView from './pages/GraphView'
import StructuresView from './pages/StructuresView'
import IosInstallBanner from './components/IosInstallBanner'
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

        {/* Backwards compatibility: old routes without graph prefix (uses default) */}
        <Route path="/*" element={<GraphView />} />
      </Routes>
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
