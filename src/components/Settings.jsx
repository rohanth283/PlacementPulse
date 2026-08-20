import React, { useState } from 'react';
import { KeyRound, CheckCircle2, ShieldAlert, Sparkles, Save } from 'lucide-react';

export default function Settings({ token, hasKey, onKeyUpdate }) {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const res = await fetch('/api/user/key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ gemini_api_key: apiKey.trim() || null })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to update key');
      }

      setSuccessMsg(apiKey.trim() ? 'Gemini API Key saved successfully!' : 'Gemini API Key cleared successfully.');
      setApiKey('');
      onKeyUpdate(); // Trigger parent App profile reload
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Configure Key card */}
      <div className="glass-card rounded-2xl p-6 space-y-5 shadow-sm">
        <div className="flex items-center gap-3 border-b border-border-color pb-4">
          <KeyRound className="w-5.5 h-5.5 text-accent-primary" />
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest">Gemini API Key Configuration</h3>
        </div>

        {/* Current status banner */}
        {hasKey ? (
          <div className="flex items-center gap-3 bg-success-primary/10 border border-success-primary/20 text-success-primary p-4 rounded-xl text-xs font-semibold leading-relaxed">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-bold text-text-primary">Gemini API Key Connected</p>
              <p className="text-[10px] text-text-secondary mt-0.5 font-normal">A custom Gemini API key is configured. Chat completions and vector index search embeddings will use your personal quota limit.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 bg-warning-primary/10 border border-warning-primary/20 text-warning-primary p-4 rounded-xl text-xs font-semibold leading-relaxed">
            <ShieldAlert className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-bold text-text-primary">API Key Required</p>
              <p className="text-[10px] text-text-secondary mt-0.5 font-normal">Please configure a Gemini API key. Without a key, the AI chat capability will remain disabled.</p>
            </div>
          </div>
        )}

        {/* Alerts */}
        {errorMsg && (
          <div className="bg-danger-primary/10 border border-danger-primary/20 text-danger-primary text-xs rounded-xl p-3.5 font-medium">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="bg-success-primary/10 border border-success-primary/20 text-success-primary text-xs rounded-xl p-3.5 font-medium">
            {successMsg}
          </div>
        )}

        {/* Configuration input form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Configure API Key</label>
            <input
              type="password"
              placeholder={hasKey ? "••••••••••••••••••••••••••••••••••••" : "AIzaSy..."}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full glass-input px-4 py-3 rounded-xl text-sm"
              disabled={loading}
            />
            <p className="text-[10px] text-text-muted">
              Entering an empty input and clicking save will clear the configured key from the database.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-accent-primary hover:bg-[#b86745] disabled:opacity-50 text-white font-medium text-sm px-6 py-3 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Key</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Guide details card */}
      <div className="glass-card rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-5 h-5 text-accent-primary" />
          <h4 className="text-xs font-bold text-text-primary uppercase tracking-widest">How to obtain a free Gemini API Key</h4>
        </div>
        <ol className="list-decimal pl-5 space-y-2 text-xs text-text-secondary leading-relaxed">
          <li>Go to the official <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-accent-primary hover:underline font-bold inline-flex items-center gap-0.5">Google AI Studio <span className="text-[10px] font-normal font-sans">↗</span></a> portal.</li>
          <li>Log in with any personal Google account.</li>
          <li>Click the prominent **"Get API Key"** button in the sidebar panel.</li>
          <li>Click **"Create API Key"**, select or create a project, and copy the generated token (starts with `AIzaSy...`).</li>
          <li>Paste the key into the input field above and click **"Save Key"**.</li>
        </ol>
      </div>
    </div>
  );
}
