import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import './styles/tokens.css'
import './styles/base.css'
import './styles/design.css'

const root = document.getElementById('root')
if (root === null) throw new Error('缺少 #root 挂载点')

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
