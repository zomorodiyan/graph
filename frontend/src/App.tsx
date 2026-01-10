import { Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import GraphView from './pages/GraphView'
import './App.css'

function App() {
  return (
    <ThemeProvider>
      <div className="app">
        <Routes>
          <Route path="/" element={<GraphView />} />
          <Route path="/*" element={<GraphView />} />
        </Routes>
      </div>
    </ThemeProvider>
  )
}

export default App
