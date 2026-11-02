import { NavLink, Link } from 'react-router-dom'
import { useAir } from '../state/AirData.jsx'
import { Icon } from './Icon.jsx'
import { timeAgo } from './ui.jsx'

const LINKS = [
  { to: '/', label: 'Overview', icon: Icon.pulse, end: true },
  { to: '/compare', label: 'Compare', icon: Icon.compare },
  { to: '/insights', label: 'Insights', icon: Icon.insight },
  { to: '/alerts', label: 'Alerts', icon: Icon.bell },
  { to: '/model', label: 'Forecast model', short: 'Model', icon: Icon.model },
]

export function Header() {
  const { fetchedAt, status, refreshing, refresh, now } = useAir()
  const dotClass = status === 'stale' || status === 'snapshot' ? 'stale' : status === 'error' ? 'off' : ''
  const text =
    status === 'loading' ? 'Connecting…' : status === 'error' ? 'Offline' : status === 'snapshot' ? 'Saved snapshot' : `Updated ${timeAgo(fetchedAt, now)}`
  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="brand" aria-label="AirPulse home">
          <span className="brand-mark">
            <Icon.pulse width={18} height={18} stroke="#fff" strokeWidth={2.6} />
          </span>
          AirPulse <small>India</small>
        </Link>
        <nav className="nav" aria-label="Main">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="live" aria-live="polite">
          <span className={`live-dot ${dotClass}`} aria-hidden="true" />
          <span>
            <span className="live-text-long">{status === 'stale' ? 'Last data ' : status === 'snapshot' ? 'Offline · ' : 'Live · '}</span>
            {text}
          </span>
          <button
            className={`icon-btn ${refreshing ? 'spin' : ''}`}
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh data now"
            title="Refresh now"
          >
            <Icon.refresh width={16} height={16} />
          </button>
        </div>
      </div>
    </header>
  )
}

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main (mobile)">
      {LINKS.map((l) => (
        <NavLink key={l.to} to={l.to} end={l.end}>
          <l.icon width={20} height={20} />
          {l.short || l.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div>
          <p>
            <strong style={{ color: 'var(--ink)' }}>AirPulse India</strong> · built by{' '}
            <a href="https://github.com/Tejdeep-67">Tejdeep Kellampalli</a> ·{' '}
            <a href="https://github.com/Tejdeep-67/airpulse-india">source on GitHub</a>
          </p>
          <p>
            Air quality and weather data by <a href="https://open-meteo.com/">Open-Meteo.com</a>, licensed under{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Air quality values come from the
            Copernicus Atmosphere Monitoring Service (CAMS) global model. Map tiles © Esri (Esri, HERE, Garmin, © OpenStreetMap contributors).
          </p>
        </div>
        <div>
          <p>
            Values are modelled estimates on a ~40 km grid, not readings from CPCB monitoring stations. AQI is
            calculated here with the CPCB method. Not for medical decisions.
          </p>
        </div>
      </div>
    </footer>
  )
}
