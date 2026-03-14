import { Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { NavigationHistoryProvider } from './context/NavigationHistoryContext'
import GraphView from './pages/GraphView'
import StructuresView from './pages/StructuresView'
import './App.css'

function App() {
  return (
    <ThemeProvider>
      <NavigationHistoryProvider>
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
      </NavigationHistoryProvider>
    </ThemeProvider>
  )
}

export default App
