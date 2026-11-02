import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const INDIA_CENTER = [22.6, 80.2]

function markerHtml(c, highlight) {
  const color = c.category?.color || '#b8c2cf'
  const text = c.category?.text || '#fff'
  const pulse = c.aqi != null && c.aqi > 200 ? ' pulse' : ''
  return `<div class="aq-marker${pulse}${highlight ? ' mine' : ''}" style="--c:${color};--t:${text}"><span>${c.aqi ?? '–'}</span></div>`
}

export default function MapView({ cities, myCityId, height = 520, onSelect }) {
  const el = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const map = L.map(el.current, {
      center: INDIA_CENTER,
      zoom: 5,
      minZoom: 4,
      maxZoom: 10,
      zoomControl: true,
      zoomSnap: 0.25,
      scrollWheelZoom: false,
      attributionControl: true,
    })
    // Esri light gray canvas: free to use with attribution, no key needed, and the
    // plain gray look lets the AQI colours stand out
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
      maxZoom: 16,
    }).addTo(map)
    // place names only from zoom 6, at India level the markers say enough
    const labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16,
      minZoom: 6,
      pane: 'shadowPane',
    })
    labels.addTo(map)
    // fit India nicely on any screen size
    map.fitBounds([[7.5, 68.5], [35.5, 94.5]], { padding: [10, 10] })
    layerRef.current = L.layerGroup().addTo(map)
    // smaller markers when zoomed out so north India isn't one big blob
    const setZoomClass = () => el.current?.classList.toggle('zoomed-out', map.getZoom() < 5.5)
    map.on('zoomend', setZoomClass)
    setZoomClass()
    mapRef.current = map
    // the container can change size after first paint (fonts, grid), fix tiles
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el.current)
    return () => {
      ro.disconnect()
      map.remove()
    }
  }, [])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    layer.clearLayers()
    // draw the worst ones last so they sit on top where markers overlap
    const sorted = [...cities].sort((a, b) => (a.aqi ?? 0) - (b.aqi ?? 0))
    for (const c of sorted) {
      const icon = L.divIcon({ className: 'aq-icon', html: markerHtml(c, c.id === myCityId), iconSize: [38, 38], iconAnchor: [19, 19] })
      const m = L.marker([c.lat, c.lon], { icon, title: `${c.name}: AQI ${c.aqi ?? 'n/a'}`, keyboard: true, riseOnHover: true })
      const cat = c.category
      m.bindTooltip(
        `<strong>${c.name}</strong><br/>AQI ${c.aqi ?? '–'} · ${cat ? cat.name : 'no data'}<br/><span style="color:#627389">PM2.5 ${c.pm25Now != null ? Math.round(c.pm25Now) : '–'} µg/m³ · ${c.weather.temp != null ? Math.round(c.weather.temp) + '°C' : ''}</span>`,
        { direction: 'top', offset: [0, -16], className: 'aq-tip' }
      )
      m.on('click', () => (onSelect ? onSelect(c) : navigate(`/city/${c.id}`)))
      m.addTo(layer)
    }
  }, [cities, myCityId, navigate, onSelect])

  return <div ref={el} className="map" style={{ height }} role="region" aria-label="Map of Indian cities coloured by current AQI" />
}
