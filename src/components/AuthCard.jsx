import React, { useState } from 'react';
import { Eye, EyeOff, Lock, User, Terminal } from 'lucide-react';

export default function AuthCard({ onLoginSuccess }) {
  const [isSignup, setIsSignup] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    
    const userVal = username.trim();
    const passVal = password.trim();
    if (!userVal || !passVal) {
      setErrorMsg('Username and password cannot be empty.');
      return;
    }

    if (isSignup && passVal.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userVal, password: passVal })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Request failed');
      }

      if (isSignup) {
        setIsSignup(false);
        setInfoMsg('Signup successful! Please log in with your credentials.');
        setPassword('');
      } else {
        onLoginSuccess(data.token, data.username);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a09] px-4 relative overflow-hidden">
      {/* Background ambient glows */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full bg-accent-primary/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-accent-primary/5 blur-[150px] pointer-events-none"></div>

      <div className="w-full max-w-md glass-card rounded-2xl p-8 relative z-10 shadow-2xl">
        {/* Header Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-accent-primary/10 border border-accent-primary/30 rounded-xl flex items-center justify-center mb-3">
            <Terminal className="w-6 h-6 text-accent-primary" />
          </div>
          <h1 className="text-2xl font-bold font-sans tracking-wide text-text-primary">PlacementPulse</h1>
          <p className="text-xs text-text-secondary mt-1">CSEA Interview Prep AI Dashboard</p>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-border-color mb-6">
          <button
            onClick={() => { setIsSignup(false); setErrorMsg(''); setInfoMsg(''); }}
            className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition-all ${
              !isSignup 
                ? 'border-accent-primary text-accent-primary' 
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            Log In
          </button>
          <button
            onClick={() => { setIsSignup(true); setErrorMsg(''); setInfoMsg(''); }}
            className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition-all ${
              isSignup 
                ? 'border-accent-primary text-accent-primary' 
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Status Alerts */}
        {errorMsg && (
          <div className="bg-danger-primary/10 border border-danger-primary/30 text-danger-primary text-xs rounded-lg p-3.5 mb-5 font-medium leading-relaxed">
            {errorMsg}
          </div>
        )}
        {infoMsg && (
          <div className="bg-success-primary/10 border border-success-primary/30 text-success-primary text-xs rounded-lg p-3.5 mb-5 font-medium leading-relaxed">
            {infoMsg}
          </div>
        )}

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full glass-input pl-11 pr-4 py-3 rounded-xl text-sm"
              disabled={loading}
              required
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full glass-input pl-11 pr-11 py-3 rounded-xl text-sm"
              disabled={loading}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <button
            type="submit"
            className="w-full bg-accent-primary hover:bg-[#b86745] text-white font-medium text-sm py-3.5 rounded-xl transition-all shadow-lg shadow-accent-primary/20 hover:shadow-accent-primary/30 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none mt-6"
            disabled={loading}
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : isSignup ? (
              'Create Account'
            ) : (
              'Enter Dashboard'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
