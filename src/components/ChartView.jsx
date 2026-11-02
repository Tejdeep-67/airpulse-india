import { useEffect, useRef } from 'react'
import {
  Chart, LineController, BarController, ScatterController, LineElement, BarElement, PointElement,
  LinearScale, CategoryScale, Filler, Tooltip, Legend,
} from 'chart.js'
import { prefersReducedMotion } from './ui.jsx'

Chart.register(LineController, BarController, ScatterController, LineElement, BarElement, PointElement,
  LinearScale, CategoryScale, Filler, Tooltip, Legend)

Chart.defaults.font.family = "'Manrope Variable', Manrope, system-ui, sans-serif"
Chart.defaults.color = '#627389'
Chart.defaults.borderColor = 'rgba(14, 26, 43, 0.06)'

// draws a dashed vertical "now" line at options.plugins.nowLine.index
const nowLine = {
  id: 'nowLine',
  afterDatasetsDraw(chart, _args, opts) {
    if (opts == null || opts.index == null) return
    const x = chart.scales.x.getPixelForValue(opts.index)
    const { top, bottom } = chart.chartArea
    const ctx = chart.ctx
    ctx.save()
    ctx.strokeStyle = 'rgba(14, 26, 43, 0.45)'
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, bottom)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#0e1a2b'
    ctx.font = "700 11px 'Manrope Variable', sans-serif"
    ctx.fillText(opts.label || 'now', x + 5, top + 12)
    ctx.restore()
  },
}
Chart.register(nowLine)

const baseOptions = () => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: prefersReducedMotion() ? false : { duration: 800, easing: 'easeOutQuart' },
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', padding: 14 } },
    tooltip: {
      backgroundColor: '#0e1a2b',
      padding: 10,
      cornerRadius: 10,
      titleFont: { weight: '700' },
      boxPadding: 4,
    },
  },
})

function merge(a, b) {
  if (!b) return a
  const out = { ...a }
  for (const k of Object.keys(b)) {
    out[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' ? merge(a[k], b[k]) : b[k]
  }
  return out
}

// small wrapper: creates the chart once, then updates data in place so it animates
export default function ChartView({ type = 'line', data, options, height = 280, label }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    const chart = new Chart(canvasRef.current, { type, data, options: merge(baseOptions(), options) })
    chartRef.current = chart
    return () => chart.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.data = data
    chart.options = merge(baseOptions(), options)
    chart.update()
  }, [data, options])

  return (
    <div className="chart-box" style={{ height }}>
      <canvas ref={canvasRef} role="img" aria-label={label} />
    </div>
  )
}
