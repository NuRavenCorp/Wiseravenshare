import React, { useMemo, useState } from 'react';
import './App.css';

const initialLogin = { email: '', password: '' };
const initialSignup = {
  email: '',
  username: '',
  displayName: '',
  password: '',
};

export default function App() {
  const [mode, setMode] = useState('login');
  const [loginForm, setLoginForm] = useState(initialLogin);
  const [signupForm, setSignupForm] = useState(initialSignup);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isLogin = mode === 'login';

  const title = useMemo(() => {
    return isLogin ? 'Sign in to WiseravenShare' : 'Create your WiseravenShare account';
  }, [isLogin]);

  const extractError = async (response) => {
    try {
      const data = await response.json();
      return data?.message || data?.details || `Request failed (${response.status})`;
    } catch {
      const text = await response.text().catch(() => '');
      return text || `Request failed (${response.status})`;
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });

      if (!response.ok) {
        throw new Error(await extractError(response));
      }

      const data = await response.json();
      if (data?.accessToken) {
        localStorage.setItem('ws.accessToken', data.accessToken);
      }
      if (data?.refreshToken) {
        localStorage.setItem('ws.refreshToken', data.refreshToken);
      }
      setSuccess('Login successful. You are now signed in.');
    } catch (err) {
      setError(err.message || 'Unable to login');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const payload = {
        email: signupForm.email,
        username: signupForm.username,
        displayName: signupForm.displayName || signupForm.username,
        password: signupForm.password,
      };

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await extractError(response));
      }

      const data = await response.json();
      if (data?.accessToken) {
        localStorage.setItem('ws.accessToken', data.accessToken);
      }
      if (data?.refreshToken) {
        localStorage.setItem('ws.refreshToken', data.refreshToken);
      }
      setSuccess('Signup successful. Your account is ready.');
      setMode('login');
      setLoginForm({ email: signupForm.email, password: '' });
    } catch (err) {
      setError(err.message || 'Unable to signup');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <main className="auth-card">
        <header className="auth-header">
          <p className="brand">WiseravenShare</p>
          <h1>{title}</h1>
          <p className="subtext">
            Truth-powered social sharing with secure account access.
          </p>
        </header>

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={isLogin ? 'tab tab-active' : 'tab'}
            onClick={() => setMode('login')}
          >
            Login
          </button>
          <button
            type="button"
            className={!isLogin ? 'tab tab-active' : 'tab'}
            onClick={() => setMode('signup')}
          >
            Signup
          </button>
        </div>

        {error && <p className="notice notice-error">{error}</p>}
        {success && <p className="notice notice-success">{success}</p>}

        {isLogin ? (
          <form className="auth-form" onSubmit={handleLogin}>
            <label>
              Email
              <input
                type="email"
                value={loginForm.email}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, email: e.target.value }))}
                required
                autoComplete="email"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                required
                minLength={8}
                autoComplete="current-password"
              />
            </label>
            <button className="submit" type="submit" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Login'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleSignup}>
            <label>
              Email
              <input
                type="email"
                value={signupForm.email}
                onChange={(e) => setSignupForm((prev) => ({ ...prev, email: e.target.value }))}
                required
                autoComplete="email"
              />
            </label>
            <label>
              Username
              <input
                type="text"
                value={signupForm.username}
                onChange={(e) => setSignupForm((prev) => ({ ...prev, username: e.target.value }))}
                required
                minLength={3}
                autoComplete="username"
              />
            </label>
            <label>
              Display name
              <input
                type="text"
                value={signupForm.displayName}
                onChange={(e) => setSignupForm((prev) => ({ ...prev, displayName: e.target.value }))}
                autoComplete="name"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={signupForm.password}
                onChange={(e) => setSignupForm((prev) => ({ ...prev, password: e.target.value }))}
                required
                minLength={8}
                pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^\\da-zA-Z]).{8,}"
                title="Use at least 8 characters with uppercase, lowercase, number, and special character."
                autoComplete="new-password"
              />
            </label>
            <p className="password-hint">
              Password must include uppercase, lowercase, number, and special character.
            </p>
            <button className="submit" type="submit" disabled={isLoading}>
              {isLoading ? 'Creating account...' : 'Signup'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
