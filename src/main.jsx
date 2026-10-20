import React from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/figtree'
import './index.css'
import { applyTheme, loadTheme } from './theme'

// Apply the saved theme before first paint so there is no colour flash.
const saved = loadTheme()
if (saved) applyTheme(saved)

registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(<App />)
