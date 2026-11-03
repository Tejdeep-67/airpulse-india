import { lazy, Suspense } from 'react'
import { BrowserRouter, HashRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AirDataProvider } from './state/AirData.jsx'
import { ToastProvider } from './components/Toasts.jsx'
import { Header, Footer, TabBar } from './components/Layout.jsx'
import { Skeleton } from './components/ui.jsx'
import AlertWatcher from './components/AlertWatcher.jsx'
import Home from './pages/Home.jsx'
import { useEffect } from 'react'

const CityPage = lazy(() => import('./pages/City.jsx'))
const Compare = lazy(() => import('./pages/Compare.jsx'))
const Alerts = lazy(() => import('./pages/Alerts.jsx'))
const Insights = lazy(() => import('./pages/Insights.jsx'))
const Model = lazy(() => import('./pages/Model.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))
const GetApp = lazy(() => import('./pages/GetApp.jsx'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function PageFallback() {
  return (
    <div className="page container">
      <div className="card"><Skeleton h={28} w="35%" /><Skeleton h={260} style={{ marginTop: 18 }} /></div>
    </div>
  )
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <Suspense fallback={<PageFallback />}>
      {/* key on the path so every page plays its enter animation */}
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Home />} />
        <Route path="/city/:id" element={<CityPage />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/model" element={<Model />} />
        <Route path="/app" element={<GetApp />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

// Netlify rewrites every path to index.html so normal URLs work there. For plain
// static hosting without rewrites, build with VITE_HASH_ROUTER=1 to get #/ URLs.
const Router = import.meta.env.VITE_HASH_ROUTER ? HashRouter : BrowserRouter

export default function App() {
  return (
    <Router>
      <AirDataProvider>
        <ToastProvider>
          <a href="#main" className="skip-link">Skip to content</a>
          <div className="sky" aria-hidden="true"><span /><span /><span /></div>
          <ScrollToTop />
          <Header />
          <main id="main">
            <AnimatedRoutes />
          </main>
          <Footer />
          <TabBar />
          <AlertWatcher />
        </ToastProvider>
      </AirDataProvider>
    </Router>
  )
}
