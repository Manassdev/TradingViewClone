import { useState } from 'react';
import { Activity, Eye, EyeOff } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';

function AuthSplitLayout({ title, children, footer }) {
  return <main className="auth-signin-page">
    <section className="auth-signin-promo" aria-label="TradingView Clone market insights">
      <div className="auth-signin-promo-copy"><h2>Look first.<br />Then leap.</h2></div>
      <span className="auth-signin-promo-caption">A clearer view of the markets.</span>
    </section>
    <section className="auth-signin-panel" aria-labelledby="auth-split-title">
      <Link className="auth-signin-brand" to="/" aria-label="TradingView Clone home"><Activity size={22} strokeWidth={2.2} /><span>TradingView <small>Clone</small></span></Link>
      <div className="auth-signin-content">
        <header className="auth-signin-heading"><h1 id="auth-split-title">{title}</h1></header>
        {children}
      </div>
      <footer className="auth-signin-footer">{footer}</footer>
    </section>
  </main>;
}

export function SignIn() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [visible, setVisible] = useState(false);
  const returnTo = location.state?.from || '/';
  if (user) return <Navigate to={returnTo} replace />;
  async function submit(event) { event.preventDefault(); setBusy(true); setError(''); try { await login(email.trim(), password); navigate(returnTo, { replace: true }); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } }
  return <AuthSplitLayout title="Log in with email" footer={<><span>Don’t have an account?</span><Link to="/signup">Sign up</Link></>}>
    <form className="auth-form auth-signin-form" onSubmit={submit}>
      {error && <div className="form-error" role="alert">{error}</div>}
      <label>Email or username<input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required placeholder="Email or username" /></label>
      <label>Password<span className="password-field"><input type={visible ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required placeholder="Password" /><button type="button" className="password-toggle" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
      <button className="button button-primary auth-submit auth-signin-submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
    </form>
  </AuthSplitLayout>;
}

export function SignUp() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [visible, setVisible] = useState(false);
  if (user) return <Navigate to="/paper-trading" replace />;
  async function submit(event) { event.preventDefault(); setBusy(true); setError(''); try { await register(name.trim(), email.trim(), password); navigate('/paper-trading', { replace: true }); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } }
  return <AuthSplitLayout title="Create an account" footer={<><span>Already have an account?</span><Link to="/signin">Log in</Link></>}>
    <form className="auth-form auth-signin-form" onSubmit={submit}>
      {error && <div className="form-error" role="alert">{error}</div>}
      <label>Name or username<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required minLength={3} maxLength={30} placeholder="Your name" /></label>
      <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required maxLength={254} placeholder="you@example.com" /></label>
      <label>Password<span className="password-field"><input type={visible ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required minLength={6} placeholder="At least 6 characters" /><button type="button" className="password-toggle" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
      <button className="button button-primary auth-submit auth-signin-submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
    </form>
  </AuthSplitLayout>;
}
