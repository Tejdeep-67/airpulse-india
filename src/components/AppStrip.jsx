// Phones only (CSS hides it on bigger screens): a small "get the Android app" strip on the
// overview page. Hidden inside the app, when installed as a PWA, or after you close it once.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon.jsx'
import { isApp } from '../lib/app.js'
import { isStandalone } from '../lib/install.js'

const KEY = 'airpulse:appStrip'

export default function AppStrip() {
  const [show, setShow] = useState(() => !isApp && !isStandalone() && localStorage.getItem(KEY) !== 'hidden')
  if (!show) return null
  return (
    <div className="app-strip">
      <img src="/icon-192.png" alt="" width="34" height="34" />
      <p><b>AirPulse for Android</b>Daily AQI notification for your city</p>
      <Link className="btn accent" to="/app">Get app</Link>
      <button
        className="icon-btn"
        aria-label="Hide"
        onClick={() => {
          localStorage.setItem(KEY, 'hidden')
          setShow(false)
        }}
      >
        <Icon.close width={16} height={16} />
      </button>
    </div>
  )
}
