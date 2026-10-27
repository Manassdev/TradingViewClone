import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { AuthProvider } from './context/AuthContext';
import { Footer, Navbar, ProtectedRoute } from './components/Shared';
const Chart = lazy(() => import('./pages/ChartWorkspace'));
const SignIn = lazy(() => import('./pages/AuthPages').then((module) => ({ default: module.SignIn })));
const SignUp = lazy(() => import('./pages/AuthPages').then((module) => ({ default: module.SignUp })));
const Home = lazy(() => import('./pages/Home'));
const IdeaDetail = lazy(() => import('./pages/IdeaDetail'));
const Features = lazy(() => import('./pages/Marketing').then((module) => ({ default: module.Features })));
const Pricing = lazy(() => import('./pages/Marketing').then((module) => ({ default: module.Pricing })));
const Markets = lazy(() => import('./pages/Markets'));
const PaperTrading = lazy(() => import('./pages/PaperTrading'));

function RouteFrame() {
  const location = useLocation();
  const isAuthPage = ['/signin', '/signup'].includes(location.pathname);
  const isChartWorkspace = location.pathname.startsWith('/chart/');
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [location.pathname]);
  return <div className="app-frame"><Navbar /><Suspense fallback={<main className="page-wrap page-content"><div className="state-card"><span className="spinner" />Loading page…</div></main>}><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/markets/crypto" element={<Markets />} />
    <Route path="/chart" element={<Navigate to="/chart/BTCUSDT" replace />} />
    <Route path="/chart/:symbol" element={<Chart />} />
    <Route path="/ideas/:id" element={<IdeaDetail />} />
    <Route path="/signin" element={<SignIn />} />
    <Route path="/signup" element={<SignUp />} />
    <Route path="/features" element={<Features />} />
    <Route path="/pricing" element={<Pricing />} />
    <Route path="/paper-trading" element={<ProtectedRoute><PaperTrading /></ProtectedRoute>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense>{!isAuthPage && !isChartWorkspace && <Footer />}</div>;
}

export default function App() {
  return <BrowserRouter><AuthProvider><RouteFrame /></AuthProvider></BrowserRouter>;
}
