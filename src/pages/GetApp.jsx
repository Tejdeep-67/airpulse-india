import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Reveal } from '../components/ui.jsx'
import { Icon } from '../components/Icon.jsx'
import { isApp, APK_URL, APK_SIZE } from '../lib/app.js'
import { canPromptInstall, isIOS, isStandalone, onInstallChange, promptInstall } from '../lib/install.js'

export default function GetApp() {
  const [canInstall, setCanInstall] = useState(canPromptInstall)
  useEffect(() => {
    document.title = 'Get the app · AirPulse India'
    return onInstallChange(() => setCanInstall(canPromptInstall()))
  }, [])

  if (isApp) {
    return (
      <div className="page container">
        <p className="eyebrow">App</p>
        <h1 className="section-title">You're using the app</h1>
        <p className="muted">Turn on the daily AQI notification on the <Link to="/alerts">Alerts</Link> page.</p>
      </div>
    )
  }

  return (
    <div className="page container">
      <p className="eyebrow">Get the app</p>
      <h1 className="section-title">AirPulse on your phone</h1>
      <p className="muted" style={{ marginTop: 0, maxWidth: 640 }}>
        Same live AQI, forecast and alerts, plus a daily notification with your city's AQI that comes even when the app is closed.
      </p>

      <div className="grid g-2" style={{ marginTop: 18 }}>
        <Reveal className="card">
          <div className="daily-head">
            <span className="daily-icon"><Icon.phone width={22} height={22} /></span>
            <div>
              <h2>Android</h2>
              <p className="card-sub">Version 1.0.0 · APK · {APK_SIZE}</p>
            </div>
          </div>
          <a className="btn accent get-btn" href={APK_URL}>
            <Icon.download width={18} height={18} /> Download Android app ({APK_SIZE})
          </a>
          <p className="small muted" style={{ marginTop: 12 }}>
            It's not on the Play Store, so when you open the file Android asks to allow installing from this source (your browser or Files app). Allow it once, then install.
          </p>
          <p className="small muted">
            Source and release notes on <a href="https://github.com/Tejdeep-67/airpulse-india/releases/latest">GitHub</a>.
          </p>
        </Reveal>

        <Reveal className="card" delay={60}>
          <div className="daily-head">
            <span className="daily-icon"><Icon.plus width={22} height={22} /></span>
            <div>
              <h2>iPhone and computer</h2>
              <p className="card-sub">Install the website as an app, no download needed</p>
            </div>
          </div>
          {isStandalone() ? (
            <p style={{ marginTop: 16 }}><b>Already installed.</b> You're using it as an app right now.</p>
          ) : canInstall ? (
            <button className="btn accent get-btn" onClick={promptInstall}><Icon.plus width={18} height={18} /> Install AirPulse</button>
          ) : null}
          <ul className="install-steps small">
            <li><b>iPhone / iPad (Safari):</b> tap Share <span aria-hidden="true">⎙</span>, then <i>Add to Home Screen</i>.</li>
            <li><b>Chrome or Edge on a computer:</b> click the install icon at the right end of the address bar.</li>
            <li><b>Android without the APK:</b> Chrome menu ⋮ → <i>Add to Home screen</i> / <i>Install app</i>.</li>
          </ul>
          {isIOS() && <p className="small muted">Daily notifications are only in the Android app for now.</p>}
        </Reveal>
      </div>
    </div>
  )
}
