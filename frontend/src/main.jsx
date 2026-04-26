import React from 'react'
import ReactDOM from 'react-dom/client'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Analytics } from '@vercel/analytics/react'
import App from './App.jsx'
import './index.css'

gsap.registerPlugin(ScrollTrigger)

// Force scroll to top on every page load/refresh before React renders.
// This must happen synchronously before any ScrollTrigger calculations.
if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}
window.scrollTo(0, 0)

ReactDOM.createRoot(document.getElementById('root')).render(
  <>
    <App />
    <Analytics />
  </>
)
