import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { AuthProvider } from './context/AuthContext';
import { Footer, Navbar, ProtectedRoute } from './components/Shared';
const Chart = lazy(() => import('./pages/ChartWorkspace'));
const SignIn = lazy(() => import('./pages/AuthPages').then((module) => ({ default: module.SignIn })));
const SignUp = lazy(() => import('./pages/AuthPages').then((module) => ({ default: module.SignUp })));
const Home = lazy(() => import('./pages/Home'));
const IdeaDetail = lazy(() => import('./pages/IdeaDetail'));
const Features = lazy(() => import('./pages/Features'));
const Pricing = lazy(() => import('./pages/Marketing').then((module) => ({ default: module.Pricing })));
const Markets = lazy(() => import('./pages/Markets'));
const ForexMarket = lazy(() => import('./pages/ForexMarket'));
const ForexChart = lazy(() => import('./pages/ForexChart'));
const IndiaMarket = lazy(() => import('./pages/IndiaMarket'));
const IndiaChart = lazy(() => import('./pages/IndiaChart'));
const PaperTrading = lazy(() => import('./pages/PaperTrading'));

function NotFound() {
  const location = useLocation();
  return <main className="page-wrap page-content"><section className="state-card" aria-labelledby="not-found-title">
    <p className="eyebrow">404 · PAGE NOT FOUND</p>
    <h1 id="not-found-title">That page isn’t here</h1>
    <p>No route matches <code>{location.pathname}</code>. Use one of the links below to continue.</p>
    <div className="not-found-actions"><Link className="button button-primary" to="/">Go to home</Link><Link className="button button-secondary" to="/markets/crypto">Explore markets</Link></div>
  </section></main>;
}

function RouteFrame() {
  const location = useLocation();
  const isAuthPage = ['/signin', '/signup'].includes(location.pathname);
  const isChartWorkspace = location.pathname.startsWith('/chart/') || location.pathname.startsWith('/forex/') || location.pathname.startsWith('/india/');
  const isFeaturePage = location.pathname === '/features';
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [location.pathname]);
  return <div className="app-frame"><Navbar /><Suspense fallback={<main className="page-wrap page-content"><div className="state-card"><span className="spinner" />Loading page…</div></main>}><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/markets/crypto" element={<Markets />} />
    <Route path="/markets/forex" element={<ForexMarket />} />
    <Route path="/markets/india" element={<IndiaMarket />} />
    <Route path="/markets/india/:exchange" element={<IndiaMarket />} />
    <Route path="/chart" element={<Navigate to="/chart/BTCUSDT" replace />} />
    <Route path="/chart/:symbol" element={<Chart />} />
    <Route path="/forex/:symbol" element={<ForexChart />} />
    <Route path="/india/:exchange/:symbol" element={<IndiaChart />} />
    <Route path="/india/:symbol" element={<IndiaChart />} />
    <Route path="/ideas/:id" element={<IdeaDetail />} />
    <Route path="/signin" element={<SignIn />} />
    <Route path="/signup" element={<SignUp />} />
    <Route path="/features" element={<Features />} />
    <Route path="/pricing" element={<Pricing />} />
    <Route path="/paper-trading" element={<ProtectedRoute><PaperTrading /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes></Suspense>{!isAuthPage && !isChartWorkspace && !isFeaturePage && <Footer />}</div>;
}

export default function App() {
  return <BrowserRouter><AuthProvider><RouteFrame /></AuthProvider></BrowserRouter>;
}
