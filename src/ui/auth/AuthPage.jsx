/**
 * AuthPage.jsx — Login / Signup screen.
 * Minimal, matches the app's dark precision aesthetic.
 */
import { useState } from 'react';

export function AuthPage({ onSignIn, onSignUp }) {
  const [mode,     setMode]     = useState('login'); // 'login' | 'signup'
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [name,     setName]     = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [done,     setDone]     = useState(false); // signup confirmation

  const isLogin  = mode === 'login';
  const canSubmit = email.includes('@') && password.length >= 6 && (isLogin || name.length > 1);

  const handleSubmit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true); setError('');
    try {
      if (isLogin) {
        await onSignIn(email, password);
      } else {
        await onSignUp(email, password, name);
        setDone(true);
      }
    } catch (e) {
      setError(e.message ?? 'Error');
    } finally {
      setLoading(false);
    }
  };
 
  const input = (props) => ({
    style: {
      width: '100%', background: 'var(--bg-raised)',
      border: '1px solid var(--border-mid)',
      borderRadius: '8px', padding: '11px 14px',
      color: 'var(--text-primary)', fontSize: 14,
      outline: 'none', fontFamily: 'var(--font-body)',
      boxSizing: 'border-box',
    },
    ...props,
  });

  if (done) return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 16 }}>📬</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center', marginBottom: 8 }}>
          Check your email
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
          Sent an email to <b>{email}</b> — confirm your account, then log in.
        </div>
        <button onClick={() => { setMode('login'); setDone(false); }} style={btnStyle(true)}>
          Log in
        </button>
      </div>
    </div>
  );

  return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: '0.14em', marginBottom: 6 }}>
            ◈ FIT ANALYZER
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' }}>
            {isLogin ? 'Log in' : 'Create account'}
          </div>
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!isLogin && (
            <input {...input({
              type: 'text', value: name, placeholder: 'Name',
              onChange: e => setName(e.target.value),
            })} />
          )}
          <input {...input({
            type: 'email', value: email, placeholder: 'Email',
            onChange: e => setEmail(e.target.value),
          })} />
          <input {...input({
            type: 'password', value: password,
            placeholder: 'Password (min. 6 characters)',
            onChange: e => setPassword(e.target.value),
            onKeyDown: e => e.key === 'Enter' && handleSubmit(),
          })} />
        </div>

        {error && (
          <div style={{ fontSize: 12, color: '#f87171', fontFamily: 'var(--font-mono)', marginTop: 10 }}>
            ⚠ {error}
          </div>
        )}
  
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          style={btnStyle(canSubmit && !loading)}
        >
          {loading ? '…' : isLogin ? 'Log in' : 'Create account'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            onClick={() => { setMode(isLogin ? 'signup' : 'login'); setError(''); }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
          >
            {isLogin ? 'No account? Sign up' : 'Already have an account? Log in'}
          </button>
        </div>

        {/* GDPR notice */}
        {!isLogin && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', marginTop: 12, lineHeight: 1.5, fontFamily: 'var(--font-mono)' }}>
            Data stored in EU (Frankfurt) · GDPR compliant
          </div>
        )}
      </div>
    </div>
  );
}

const wrapStyle = {
  minHeight: '100vh', background: 'var(--bg-base)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '24px',
};

const cardStyle = {
  width: '100%', maxWidth: 380,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '16px',
  padding: '36px 32px',
  display: 'flex', flexDirection: 'column', gap: 0,
};

const btnStyle = (active) => ({
  marginTop: 16, width: '100%',
  background: active ? 'rgba(232,168,50,0.15)' : 'var(--bg-raised)',
  border: `1px solid ${active ? 'rgba(232,168,50,0.4)' : 'var(--border-mid)'}`,
  borderRadius: '8px', padding: '12px',
  color: active ? 'var(--accent)' : 'var(--text-muted)',
  fontSize: 14, fontWeight: 600,
  cursor: active ? 'pointer' : 'not-allowed',
  fontFamily: 'var(--font-body)',
  transition: 'all 0.15s ease',
});