import React from 'react';
import { MessageSquare, Library, BarChart3, Settings, LogOut, ChevronLeft, ChevronRight, Shield } from 'lucide-react';

export default function Sidebar({ 
  username, 
  isAdmin, 
  activeTab, 
  setActiveTab, 
  sidebarCollapsed, 
  toggleSidebar, 
  handleLogout 
}) {
  
  const navItems = [
    { id: 'chat', label: 'AI Advisor', icon: MessageSquare },
    { id: 'explorer', label: 'Experiences Explorer', icon: Library },
    { id: 'insights', label: 'Insights & Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <aside className={`flex flex-col h-full bg-[#141413] border-r border-border-color z-20 transition-all duration-300 relative ${
      sidebarCollapsed ? 'w-20' : 'w-64'
    }`}>
      {/* Collapse Trigger Button */}
      <button 
        onClick={toggleSidebar}
        className="absolute top-5 -right-3.5 w-7 h-7 bg-bg-card border border-border-color rounded-full flex items-center justify-center cursor-pointer hover:border-accent-primary transition-colors text-text-primary z-30 shadow-md"
      >
        {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* Brand Logo */}
      <div className="flex h-16 items-center px-5 border-b border-border-color">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-accent-primary flex items-center justify-center flex-shrink-0 text-white font-bold text-base shadow-md">
            P
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-wide font-sans text-text-primary">PlacementPulse</span>
              <span className="text-[10px] text-text-secondary leading-none">CSEA PORTAL</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation items */}
      <nav className="flex-1 px-3 py-4 space-y-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                isActive 
                  ? 'bg-accent-primary/10 text-accent-primary shadow-inner border-l-2 border-accent-primary'
                  : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
              } ${sidebarCollapsed ? 'justify-center' : ''}`}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* User profile footer */}
      <div className="p-3 border-t border-border-color bg-bg-secondary/40">
        <div className={`flex items-center justify-between gap-3 ${sidebarCollapsed ? 'flex-col' : ''}`}>
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center text-accent-primary font-bold text-sm flex-shrink-0">
              {getInitials(username)}
            </div>
            {!sidebarCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-text-primary truncate">{username}</span>
                <div className="flex items-center gap-1 mt-0.5">
                  {isAdmin ? (
                    <>
                      <Shield className="w-3 h-3 text-accent-primary" />
                      <span className="text-[10px] text-accent-primary font-bold">Admin</span>
                    </>
                  ) : (
                    <span className="text-[10px] text-text-muted">Candidate</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleLogout}
            className={`text-text-muted hover:text-danger-primary transition-colors cursor-pointer p-2 rounded-lg hover:bg-bg-tertiary ${
              sidebarCollapsed ? 'w-full flex justify-center' : ''
            }`}
            title="Log Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
