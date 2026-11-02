import { useEffect } from 'react'

const BASE = 'AirPulse India'

// sets the tab title for a page, e.g. useTitle('Compare cities')
export default function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${BASE}` : `${BASE} - live air quality for Indian cities`
  }, [title])
}
