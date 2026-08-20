import React, { useState, useEffect } from 'react';
import { Shield, Users, MessageSquare, KeyRound, Activity, Trash2, ArrowLeft, Search, AlertTriangle, Check, X } from 'lucide-react';

export default function AdminPanel({ token, onBack }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [deletingUser, setDeletingUser] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchAdminStats();
  }, []);

  const fetchAdminStats = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setUsers(data.users);
      } else {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to load admin logs.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setErrorMsg('');
    setSuccessMsg('');
    
    try {
      const res = await fetch(`/api/admin/users/${deletingUser.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`User "${deletingUser.username}" was deleted successfully.`);
        setUsers(prev => prev.filter(u => u.id !== deletingUser.id));
        setStats(prev => prev ? {
          ...prev,
          total_users: prev.total_users - 1
        } : null);
        setDeletingUser(null);
      } else {
        throw new Error(data.detail || 'User deletion failed.');
      }
    } catch (err) {
      setErrorMsg(err.message);
      setDeletingUser(null);
    }
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0a0a09] text-text-primary p-6 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border-color pb-5">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-2 bg-bg-secondary border border-border-color rounded-xl hover:border-accent-primary transition-colors cursor-pointer text-text-secondary hover:text-text-primary"
            title="Return to Main Application"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-accent-primary" />
              <h1 className="text-xl font-bold font-sans tracking-wide text-text-primary">Admin Control Center</h1>
            </div>
            <p className="text-xs text-text-secondary mt-1">Manage registration levels, delete profiles, and review token limits.</p>
          </div>
        </div>
      </div>

      {/* Status Alerts */}
      {errorMsg && (
        <div className="bg-danger-primary/10 border border-danger-primary/30 text-danger-primary text-xs rounded-xl p-4 font-semibold leading-relaxed">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="bg-success-primary/10 border border-success-primary/30 text-success-primary text-xs rounded-xl p-4 font-semibold leading-relaxed">
          {successMsg}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-8 h-8 border-3 border-accent-primary border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-xs text-text-secondary">Loading statistics console...</p>
        </div>
      ) : (
        <>
          {/* Metrics Row */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="glass-card rounded-2xl p-5 shadow-sm">
                <span className="text-[9px] uppercase tracking-wider font-bold text-text-muted">Total Users</span>
                <p className="text-xl font-bold text-text-primary mt-1.5 flex items-center gap-2">
                  <Users className="w-5 h-5 text-accent-primary" />
                  {stats.total_users}
                </p>
              </div>
              <div className="glass-card rounded-2xl p-5 shadow-sm">
                <span className="text-[9px] uppercase tracking-wider font-bold text-text-muted">Total Chats</span>
                <p className="text-xl font-bold text-text-primary mt-1.5 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-accent-primary" />
                  {stats.total_conversations}
                </p>
              </div>
              <div className="glass-card rounded-2xl p-5 shadow-sm">
                <span className="text-[9px] uppercase tracking-wider font-bold text-text-muted">Total Messages</span>
                <p className="text-xl font-bold text-text-primary mt-1.5 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-accent-primary" />
                  {stats.total_messages}
                </p>
              </div>
              <div className="glass-card rounded-2xl p-5 shadow-sm">
                <span className="text-[9px] uppercase tracking-wider font-bold text-text-muted">Tokens Consumed</span>
                <p className="text-xl font-bold text-text-primary mt-1.5 flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-accent-primary" />
                  {stats.total_tokens.toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {/* User Management Section */}
          <div className="glass-card rounded-2xl p-6 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest">Candidate Database Profiles</h3>
              
              {/* User search bar */}
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search user profile..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#191917] border border-border-color focus:border-accent-primary pl-9 pr-4 py-2 rounded-xl text-xs text-text-primary placeholder-text-muted focus:outline-none"
                />
              </div>
            </div>

            {/* Users Table */}
            <div className="border border-border-color rounded-xl overflow-hidden bg-bg-secondary/20">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#191917]/85 border-b border-border-color text-text-secondary uppercase tracking-widest text-[9px] font-bold">
                    <th className="p-3">ID</th>
                    <th className="p-3">Username</th>
                    <th className="p-3">Role</th>
                    <th className="p-3 text-center">Chats Created</th>
                    <th className="p-3 text-center">Messages Sent</th>
                    <th className="p-3 text-right">Tokens Used</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-color text-text-primary">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-text-muted">
                        No candidate profiles match the search query.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-[#191917]/35 transition-colors">
                        <td className="p-3 font-semibold text-text-muted">#{user.id}</td>
                        <td className="p-3 font-bold">{user.username}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            user.is_admin 
                              ? 'bg-accent-primary/10 text-accent-primary border border-accent-primary/20' 
                              : 'bg-bg-tertiary text-text-secondary'
                          }`}>
                            {user.is_admin ? 'Admin' : 'Candidate'}
                          </span>
                        </td>
                        <td className="p-3 text-center font-semibold">{user.chat_count}</td>
                        <td className="p-3 text-center font-semibold">{user.message_count}</td>
                        <td className="p-3 text-right font-bold">{user.token_count.toLocaleString()}</td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => setDeletingUser(user)}
                            disabled={user.is_admin}
                            className={`p-1.5 rounded-lg transition-colors inline-flex items-center justify-center cursor-pointer ${
                              user.is_admin 
                                ? 'opacity-20 cursor-not-allowed text-text-muted' 
                                : 'text-text-muted hover:text-danger-primary hover:bg-danger-primary/10'
                            }`}
                            title={user.is_admin ? "Cannot delete admin profile" : "Delete Candidate Profile"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Delete User Warning overlay */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md glass-card rounded-2xl p-6 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center gap-3 border-b border-border-color pb-3 text-danger-primary">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-sm font-bold uppercase tracking-wider">Confirm Profile Deletion</h3>
            </div>
            
            <p className="text-xs text-text-secondary leading-relaxed">
              Are you absolutely sure you want to delete the user profile <strong className="text-text-primary">"{deletingUser.username}"</strong>?
            </p>
            
            <div className="bg-danger-primary/10 border border-danger-primary/20 text-danger-primary rounded-xl p-3.5 text-[10px] leading-relaxed font-semibold">
              ⚠️ Warning: This action will permanently purge their registration logs, active JWT sessions, chat history, messages, and token usage records from the database.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingUser(null)}
                className="px-4.5 py-2.5 bg-bg-secondary hover:bg-bg-tertiary border border-border-color rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                className="px-4.5 py-2.5 bg-danger-primary hover:bg-[#c84d3b] text-white rounded-xl text-xs font-semibold cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Purge Profile</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
