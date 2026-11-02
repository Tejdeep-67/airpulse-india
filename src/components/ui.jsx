import { useEffect, useRef, useState } from 'react'
import { categoryFor } from '../lib/aqi.js'

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// counts from the previous value to the new one
export function AnimatedNumber({ value, decimals = 0, duration = 900, className }) {
  const [shown, setShown] = useState(value ?? 0)
  const from = useRef(value ?? 0)
  useEffect(() => {
    if (value == null) return
    if (prefersReducedMotion()) {
      setShown(value)
      from.current = value
      return
    }
    const start = performance.now()
    const a = from.current
    let raf
    const step = (t) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(a + (value - a) * eased)
      if (p < 1) raf = requestAnimationFrame(step)
      else from.current = value
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  if (value == null) return <span className={className}>–</span>
  return <span className={className}>{shown.toFixed(decimals)}</span>
}

export function Reveal({ children, as: Tag = 'div', className = '', delay = 0, ...rest }) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!('IntersectionObserver' in window)) {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setInView(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <Tag ref={ref} className={`reveal ${inView ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  )
}

export function Skeleton({ h = 16, w = '100%', r, style }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r, ...style }} aria-hidden="true" />
}

export function AqiBadge({ aqi, size = 'md' }) {
  const cat = categoryFor(aqi)
  if (!cat) return <span className="badge" style={{ background: '#eef1f5', color: '#627389' }}>No data</span>
  return (
    <span className="badge" style={{ background: cat.color, color: cat.text, fontSize: size === 'sm' ? '0.72rem' : undefined }}>
      {cat.name}
    </span>
  )
}

export function AqiRing({ aqi, size = 180, stroke = 12, label = 'AQI' }) {
  const cat = categoryFor(aqi)
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = aqi == null ? 0 : Math.min(1, aqi / 500)
  const color = cat?.color || '#c8d0da'
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={aqi == null ? 'AQI not available' : `AQI ${aqi}, ${cat.name}`}>
      <div className="glow" style={{ background: color }} />
      <svg width={size} height={size}>
        <circle className="track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="bar"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
        />
      </svg>
      <div className="center">
        <div className="value" style={{ fontSize: size * 0.27 }}>
          <AnimatedNumber value={aqi} />
        </div>
        <div className="label">{label}</div>
      </div>
    </div>
  )
}

export function timeAgo(ts, now = Date.now()) {
  if (!ts) return ''
  const mins = Math.round((now - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 min ago'
  if (mins < 60) return `${mins} min ago`
  const h = Math.floor(mins / 60)
  return h === 1 ? '1 hour ago' : `${h} hours ago`
}

export function hourLabel(t) {
  // "2026-11-02T21:00" -> "9 PM"
  const h = +t.slice(11, 13)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh} ${suffix}`
}

export function dayHourLabel(t) {
  const d = new Date(t.slice(0, 10) + 'T00:00:00Z')
  const day = d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })
  return `${day} ${hourLabel(t)}`
}

const WIND_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
export const windDir = (deg) => (deg == null ? '' : WIND_DIRS[Math.round(deg / 45) % 8])
