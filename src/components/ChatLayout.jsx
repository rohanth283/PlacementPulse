import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, MessageSquare, Edit3, Trash2, Check, X, ArrowUp, ArrowDown, Send, 
  Sparkles, AlertCircle, Bookmark, ExternalLink 
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function ChatLayout({ token, hasKey }) {
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [companies, setCompanies] = useState([]);
  
  // UI States
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Inline edit states
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const messagesEndRef = useRef(null);

  const suggestionChips = [
    "What coding questions did Amazon ask?",
    "Tell me about Wells Fargo coding rounds",
    "What is the recruitment process at BNY Mellon?",
    "Give me interview tips for Appian SDE role"
  ];

  useEffect(() => {
    fetchConversations();
    fetchCompanies();
  }, []);

  useEffect(() => {
    if (activeConversationId) {
      fetchMessages(activeConversationId);
      // Find active conversation's filter
      const activeConv = conversations.find(c => c.id === activeConversationId);
      if (activeConv) {
        setCompanyFilter(activeConv.company_filter || '');
      }
    } else {
      setMessages([]);
    }
  }, [activeConversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchCompanies = async () => {
    try {
      const res = await fetch('/api/companies', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies);
      }
    } catch (err) {
      console.error('Failed to load companies:', err);
    }
  };

  const fetchConversations = async () => {
    setLoadingConvs(true);
    try {
      const res = await fetch('/api/conversations', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations);
        if (data.conversations.length > 0) {
          setActiveConversationId(data.conversations[0].id);
        } else {
          handleCreateNewChat();
        }
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoadingConvs(false);
    }
  };

  const fetchMessages = async (convId) => {
    setLoadingMessages(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/conversations/${convId}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleCreateNewChat = async (filter = null) => {
    setErrorMsg('');
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: "New Chat", company_filter: filter })
      });
      if (res.ok) {
        const newConv = await res.json();
        setConversations(prev => [newConv, ...prev]);
        setActiveConversationId(newConv.id);
        setCompanyFilter(filter || '');
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  const handleRenameChat = async (convId) => {
    if (!renameValue.trim()) return;
    try {
      const res = await fetch(`/api/conversations/${convId}/title`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: renameValue.trim() })
      });
      if (res.ok) {
        setConversations(prev => prev.map(c => c.id === convId ? { ...c, title: renameValue.trim() } : c));
        setRenamingId(null);
      }
    } catch (err) {
      console.error('Failed to rename conversation:', err);
    }
  };

  const handleDeleteChat = async (convId) => {
    try {
      const res = await fetch(`/api/conversations/${convId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setConversations(prev => prev.filter(c => c.id !== convId));
        setDeletingId(null);
        if (activeConversationId === convId) {
          const remaining = conversations.filter(c => c.id !== convId);
          if (remaining.length > 0) {
            setActiveConversationId(remaining[0].id);
          } else {
            setActiveConversationId(null);
          }
        }
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const handleReorder = async (direction, index) => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === conversations.length - 1) return;
    
    const newConvs = [...conversations];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    
    // Swap
    const temp = newConvs[index];
    newConvs[index] = newConvs[targetIdx];
    newConvs[targetIdx] = temp;
    
    setConversations(newConvs);

    try {
      await fetch('/api/conversations/reorder', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ order: newConvs.map(c => c.id) })
      });
    } catch (err) {
      console.error('Failed to reorder conversations:', err);
    }
  };

  const handleSendMessage = async (customText = null) => {
    const textToSend = customText || inputText;
    if (!textToSend.trim() || sending) return;

    if (!hasKey) {
      setErrorMsg("Gemini API Key is not set. Please set your API Key in the Settings tab to use the Chatbot.");
      return;
    }

    // Alphanumeric query check
    if (!/[a-zA-Z0-9]/.test(textToSend)) {
      setErrorMsg("⚠️ PlacementPulse Notice: Emojis and special characters alone are not supported. Please write a query containing letters or numbers.");
      return;
    }

    setErrorMsg('');
    if (!customText) setInputText('');
    setSending(true);

    // Append user message immediately
    const userMsg = { role: 'user', text: textToSend, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: textToSend,
          conversation_id: activeConversationId,
          company_filter: companyFilter || null
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to generate response');
      }

      setMessages(prev => [...prev, {
        role: 'model',
        text: data.response,
        citations: data.citations || [],
        created_at: new Date().toISOString()
      }]);

      if (data.title) {
        setConversations(prev => prev.map(c => c.id === activeConversationId ? { ...c, title: data.title } : c));
      }
    } catch (err) {
      setErrorMsg(err.message);
      // Remove last user message on failure so they can retry
      setMessages(prev => prev.slice(0, -1));
      if (!customText) setInputText(textToSend);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Sessions Left Sidebar */}
      <div className="w-64 bg-bg-secondary border-r border-border-color flex flex-col h-full flex-shrink-0">
        <div className="p-4 border-b border-border-color">
          <button
            onClick={() => handleCreateNewChat()}
            className="w-full flex items-center justify-center gap-2 bg-accent-primary hover:bg-[#b86745] text-white py-2.5 px-4 rounded-xl text-sm font-semibold cursor-pointer transition-all shadow-md active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2.5 py-4 space-y-1">
          {loadingConvs ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            conversations.map((conv, idx) => {
              const isActive = conv.id === activeConversationId;
              const isRenaming = conv.id === renamingId;
              const isDeleting = conv.id === deletingId;

              return (
                <div
                  key={conv.id}
                  className={`group relative flex items-center justify-between p-3 rounded-xl transition-all ${
                    isActive 
                      ? 'bg-bg-tertiary text-accent-primary shadow-sm border border-border-color' 
                      : 'text-text-secondary hover:bg-bg-tertiary/40 hover:text-text-primary'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer" onClick={() => !isRenaming && setActiveConversationId(conv.id)}>
                    <MessageSquare className="w-4.5 h-4.5 flex-shrink-0" />
                    {isRenaming ? (
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => handleRenameChat(conv.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameChat(conv.id);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        className="bg-bg-primary text-text-primary text-xs px-2 py-1 rounded border border-accent-primary w-full focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <span className="text-xs font-semibold truncate leading-none">{conv.title}</span>
                    )}
                  </div>

                  {/* Actions (Hidden on default, shown on hover/active) */}
                  {!isRenaming && !isDeleting && (
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 flex-shrink-0 bg-gradient-to-l from-bg-tertiary pl-4">
                      <button 
                        onClick={() => handleReorder('up', idx)}
                        disabled={idx === 0}
                        className="text-text-muted hover:text-text-primary disabled:opacity-30"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => handleReorder('down', idx)}
                        disabled={idx === conversations.length - 1}
                        className="text-text-muted hover:text-text-primary disabled:opacity-30"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingId(conv.id);
                          setRenameValue(conv.title);
                        }}
                        className="text-text-muted hover:text-accent-primary"
                        title="Rename"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingId(conv.id);
                        }}
                        className="text-text-muted hover:text-danger-primary"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Delete Confirmation */}
                  {isDeleting && (
                    <div className="flex items-center gap-1 flex-shrink-0 z-10 bg-bg-tertiary pl-2">
                      <button
                        onClick={() => handleDeleteChat(conv.id)}
                        className="text-danger-primary p-1 hover:bg-danger-primary/10 rounded"
                        title="Confirm Delete"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="text-text-muted p-1 hover:bg-bg-secondary rounded"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Chat Conversation view */}
      <div className="flex-1 flex flex-col h-full bg-[#0a0a09]">
        {/* Messages list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && !loadingMessages && (
            <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto text-center py-12">
              <div className="w-14 h-14 rounded-2xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center mb-6 animate-pulse">
                <Sparkles className="w-7 h-7 text-accent-primary" />
              </div>
              <h3 className="text-xl font-bold font-sans tracking-wide mb-2">Consult PlacementPulse AI</h3>
              <p className="text-sm text-text-secondary mb-8 max-w-md">
                I have access to real technical interview experiences of senior students across software roles. Ask me anything to get insights on coding questions and rounds.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                {suggestionChips.map((chip, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(chip)}
                    className="p-4 bg-bg-secondary hover:bg-bg-tertiary border border-border-color hover:border-accent-primary text-text-secondary hover:text-text-primary text-left text-xs font-semibold rounded-2xl transition-all cursor-pointer shadow-sm flex items-center justify-between"
                  >
                    <span>{chip}</span>
                    <Plus className="w-3.5 h-3.5 opacity-60" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {loadingMessages && (
            <div className="flex justify-center items-center h-full">
              <div className="w-8 h-8 border-3 border-accent-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}

          {!loadingMessages && messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-4 max-w-3xl mx-auto ${
              msg.role === 'user' ? 'flex-row-reverse' : ''
            }`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                msg.role === 'user'
                  ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30'
                  : 'bg-bg-tertiary text-text-secondary border border-border-color'
              }`}>
                {msg.role === 'user' ? 'U' : 'AI'}
              </div>

              <div className={`flex flex-col min-w-0 max-w-[85%] ${msg.role === 'user' ? 'items-end' : ''}`}>
                <div className={`rounded-2xl p-4.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-accent-primary text-white shadow-md'
                    : 'bg-bg-secondary border border-border-color shadow-sm'
                }`}>
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  ) : (
                    <div className="markdown-body">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  )}

                  {/* Citations Grid */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-5 border-t border-border-color pt-4">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-text-secondary flex items-center gap-1.5 mb-2.5">
                        <Bookmark className="w-3 h-3 text-accent-primary" />
                        Cited Placements
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {msg.citations.map((cit, cIdx) => (
                          <div
                            key={cIdx}
                            className="flex items-center gap-2 bg-bg-tertiary hover:bg-bg-card border border-border-color rounded-xl px-3 py-1.5 text-xs text-text-primary hover:text-accent-primary cursor-pointer transition-colors shadow-sm"
                            title={`Relevance score: ${cit.score}`}
                          >
                            <span className="w-1.5 h-1.5 bg-accent-primary rounded-full"></span>
                            <span className="font-semibold">{cit.candidate_name} ({cit.company})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <span className="text-[9px] text-text-muted mt-1.5 px-2">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex gap-4 max-w-3xl mx-auto">
              <div className="w-9 h-9 rounded-xl bg-bg-tertiary text-text-secondary border border-border-color flex items-center justify-center font-bold text-xs animate-pulse">
                AI
              </div>
              <div className="bg-bg-secondary border border-border-color rounded-2xl p-4.5 max-w-[85%] shadow-sm flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-accent-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1.5 h-1.5 bg-accent-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1.5 h-1.5 bg-accent-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Status Error Warning */}
        {errorMsg && (
          <div className="mx-6 p-3 bg-danger-primary/10 border border-danger-primary/20 text-danger-primary text-xs rounded-xl flex items-center gap-2 max-w-3xl md:mx-auto w-[calc(100%-3rem)]">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">{errorMsg}</span>
          </div>
        )}

        {/* Footer Chat Input controls */}
        <div className="p-6 border-t border-border-color">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 bg-bg-secondary border border-border-color rounded-2xl p-3 shadow-inner focus-within:border-accent-primary transition-all">
              {/* Optional Company Filter tag indicator */}
              <div className="relative">
                <select
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  className="bg-bg-tertiary hover:bg-bg-card border border-border-color rounded-xl px-3 py-2 text-xs font-semibold text-text-primary hover:text-accent-primary focus:outline-none cursor-pointer max-w-[140px]"
                >
                  <option value="">All Companies</option>
                  {companies.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask about rounds, coding questions, difficulty levels..."
                className="flex-1 bg-transparent border-none text-text-primary text-sm focus:outline-none placeholder-text-muted"
                disabled={sending}
              />

              <button
                onClick={() => handleSendMessage()}
                disabled={sending || !inputText.trim()}
                className="p-2.5 bg-accent-primary hover:bg-[#b86745] disabled:opacity-30 disabled:hover:bg-accent-primary text-white rounded-xl cursor-pointer transition-all active:scale-95 shadow-md flex items-center justify-center flex-shrink-0"
              >
                <Send className="w-4.5 h-4.5" />
              </button>
            </div>
            <p className="text-[10px] text-text-muted text-center mt-2.5">
              PlacementPulse AI makes retries dynamically and parses custom context vectors.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
