import React, { useState, useEffect } from 'react';
import AuthCard from './components/AuthCard';
import Sidebar from './components/Sidebar';
import ChatLayout from './components/ChatLayout';
import Explorer from './components/Explorer';
import Insights from './components/Insights';
import Settings from './components/Settings';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [username, setUsername] = useState(localStorage.getItem('username') || null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    localStorage.getItem('sidebarCollapsed') === 'true'
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    verifySession();
  }, [token]);

  const verifySession = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsername(data.username);
        setIsAdmin(data.is_admin);
        setHasKey(data.has_key);
        localStorage.setItem('username', data.username);
      } else {
        handleLogout();
      }
    } catch (err) {
      console.error('Session verification failed:', err);
      handleLogout();
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (userToken, name) => {
    localStorage.setItem('token', userToken);
    localStorage.setItem('username', name);
    setToken(userToken);
    setUsername(name);
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (err) {
        console.error('Logout request failed:', err);
      }
    }
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setToken(null);
    setUsername(null);
    setIsAdmin(false);
    setHasKey(false);
    setActiveTab('chat');
  };

  const toggleSidebar = () => {
    const nextState = !sidebarCollapsed;
    setSidebarCollapsed(nextState);
    localStorage.setItem('sidebarCollapsed', String(nextState));
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg-primary z-50">
        <div className="w-12 h-12 border-4 border-accent-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-text-secondary text-sm">Initializing PlacementPulse...</p>
      </div>
    );
  }

  if (!token) {
    return <AuthCard onLoginSuccess={handleLogin} />;
  }

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'chat':
        return <ChatLayout token={token} hasKey={hasKey} />;
      case 'explorer':
        return <Explorer token={token} />;
      case 'insights':
        return <Insights token={token} />;
      case 'settings':
        return <Settings token={token} hasKey={hasKey} onKeyUpdate={verifySession} />;
      default:
        return <ChatLayout token={token} hasKey={hasKey} />;
    }
  };

  const tabTitles = {
    chat: { title: "PlacementPulse", desc: "" },
    explorer: { title: "Experiences Explorer", desc: "Search and filter placement experiences from 250+ candidates." },
    insights: { title: "PlacementPulse Insights", desc: "Insights, Trends, and Placement Analytics." },
    settings: { title: "Settings", desc: "Configure your API credentials and preferences." }
  };

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-bg-primary text-text-primary">
      <Sidebar 
        username={username}
        isAdmin={isAdmin}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        sidebarCollapsed={sidebarCollapsed}
        toggleSidebar={toggleSidebar}
        handleLogout={handleLogout}
      />
      
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
        {/* Top Navbar */}
        <header className="flex h-16 items-center justify-between border-b border-border-color px-6 z-10 glass-card">
          <div className="flex flex-col">
            <h2 className="text-lg font-bold font-sans tracking-wide">{tabTitles[activeTab].title}</h2>
            {tabTitles[activeTab].desc && (
              <p className="text-xs text-text-secondary">{tabTitles[activeTab].desc}</p>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 border border-border-color bg-bg-secondary/40 rounded-full px-3 py-1.5 text-xs">
              <span className={`w-2.5 h-2.5 rounded-full ${hasKey ? 'bg-success-primary animate-pulse' : 'bg-danger-primary'}`}></span>
              <span className="text-text-secondary font-medium">
                {hasKey ? 'RAG Active' : 'Gemini Key Missing'}
              </span>
            </div>
          </div>
        </header>

        {/* Content Panel */}
        <main className="flex-1 overflow-y-auto bg-bg-primary/20 relative">
          {renderActivePanel()}
        </main>
      </div>
    </div>
  );
}
