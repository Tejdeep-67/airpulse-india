// small inline icons (drawn by hand, stroke style)
const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

export const Icon = {
  pulse: (p) => <svg {...base} {...p}><path d="M3 12h4l3-7 4 14 3-7h4" /></svg>,
  map: (p) => <svg {...base} {...p}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></svg>,
  compare: (p) => <svg {...base} {...p}><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></svg>,
  bell: (p) => <svg {...base} {...p}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>,
  insight: (p) => <svg {...base} {...p}><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z" /></svg>,
  model: (p) => <svg {...base} {...p}><circle cx="5" cy="6" r="2" /><circle cx="5" cy="18" r="2" /><circle cx="19" cy="12" r="2" /><path d="M7 6.5 17 11.5M7 17.5l10-5" /></svg>,
  refresh: (p) => <svg {...base} {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>,
  locate: (p) => <svg {...base} {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="7" /></svg>,
  wind: (p) => <svg {...base} {...p}><path d="M3 8h11a3 3 0 1 0-3-3M3 16h15a3 3 0 1 1-3 3M3 12h18" /></svg>,
  drop: (p) => <svg {...base} {...p}><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" /></svg>,
  thermo: (p) => <svg {...base} {...p}><path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0z" /></svg>,
  rain: (p) => <svg {...base} {...p}><path d="M7 15a5 5 0 1 1 1.4-9.8A6 6 0 0 1 20 9a4 4 0 0 1-2 6" /><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2" /></svg>,
  arrow: (p) => <svg {...base} {...p}><path d="M12 19V5M5 12l7-7 7 7" /></svg>,
  close: (p) => <svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>,
  plus: (p) => <svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>,
  download: (p) => <svg {...base} {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>,
  phone: (p) => <svg {...base} {...p}><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M11 18h2" /></svg>,
  star: (p) => <svg {...base} {...p}><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>,
}
