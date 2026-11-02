import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="page container">
      <div className="card" style={{ textAlign: 'center', padding: '56px 22px' }}>
        <p className="eyebrow">404</p>
        <h1 className="section-title">This page went up in smoke</h1>
        <p className="muted">The link might be old. The air data is still live on the overview.</p>
        <Link to="/" className="btn primary" style={{ marginTop: 10 }}>Back to the overview</Link>
      </div>
    </div>
  )
}
