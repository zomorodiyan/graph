import { Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { NavigationHistoryProvider } from './context/NavigationHistoryContext'
import { usePinchZoom } from './hooks/usePinchZoom'
import GraphView from './pages/GraphView'
import StructuresView from './pages/StructuresView'
import ZoomNotification from './components/ZoomNotification'
import './App.css'

function AppContent() {
  const { notification } = usePinchZoom()
  
  return (
    <>
      <div className="app">
        <Routes>
          {/* Root: list of all graphs */}
          <Route path="/" element={<StructuresView />} />
          
          {/* Graph view: /g/{graphName}/* */}
          <Route path="/g/:graphName/*" element={<GraphView />} />
          
          {/* Backwards compatibility: old routes without graph prefix (uses default) */}
          <Route path="/*" element={<GraphView />} />
        </Routes>
      </div>
      {notification && (
        <ZoomNotification message={notification.message} type={notification.type} />
      )}
    </>
  )
}

function App() {
  return (
    <ThemeProvider>
      <NavigationHistoryProvider>
        <AppContent />
      </NavigationHistoryProvider>
    </ThemeProvider>
  )
}

export default App
