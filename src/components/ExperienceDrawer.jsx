import React, { useState, useEffect } from 'react';
import { X, Briefcase, Banknote, Calendar, Shield, Printer, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function ExperienceDrawer({ token, experienceId, onClose }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchExperienceDetails();
  }, [experienceId]);

  const fetchExperienceDetails = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/experience/${experienceId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDoc(data);
      } else {
        throw new Error('Failed to load candidate experience details.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!doc) return;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>${doc.company} Placement Experience - ${doc.candidate_name}</title>
          <style>
            body { font-family: -apple-system, sans-serif; line-height: 1.6; padding: 2rem; color: #111; }
            h1, h2 { font-weight: 700; }
            h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
            .meta { font-size: 0.9rem; color: #555; margin-bottom: 2rem; border-bottom: 1px solid #ddd; padding-bottom: 1rem; }
            .content { font-size: 1rem; white-space: pre-wrap; }
          </style>
        </head>
        <body>
          <h1>${doc.company} Placement Experience</h1>
          <div class="meta">
            <strong>Candidate:</strong> ${doc.candidate_name}<br/>
            <strong>Role:</strong> ${doc.role || 'Software Engineer'}<br/>
            <strong>Package:</strong> ${doc.package || 'Not Specified'}<br/>
            <strong>Difficulty:</strong> ${doc.difficulty}<br/>
            <strong>Year:</strong> ${doc.year || '2025'}<br/>
            <strong>Department:</strong> ${doc.department || 'CSE'}<br/>
            <strong>Type:</strong> ${doc.role_type || 'Placement'}
          </div>
          <div class="content">${doc.text}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
      ></div>

      {/* Drawer Body Panel (Slides from right) */}
      <div className="relative w-full max-w-2xl h-full bg-bg-secondary border-l border-border-color shadow-2xl z-10 flex flex-col transition-transform duration-300 transform translate-x-0 animate-in slide-in-from-right">
        {/* Header toolbar */}
        <div className="flex h-16 items-center justify-between border-b border-border-color px-6 flex-shrink-0">
          <span className="text-xs font-bold text-text-secondary uppercase tracking-widest">Candidate Experience Details</span>
          <div className="flex items-center gap-3">
            {doc && (
              <button
                onClick={handlePrint}
                className="text-text-secondary hover:text-text-primary p-2 hover:bg-bg-tertiary rounded-xl cursor-pointer transition-colors"
                title="Print Placement Experience"
              >
                <Printer className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-text-primary p-2 hover:bg-bg-tertiary rounded-xl cursor-pointer transition-colors"
              title="Close Details"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content body wrapper */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-8 h-8 border-3 border-accent-primary border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-xs text-text-secondary">Loading details...</p>
            </div>
          )}

          {errorMsg && (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <AlertTriangle className="w-10 h-10 text-danger-primary mb-3" />
              <h4 className="text-base font-bold text-text-primary mb-1">Failed to load details</h4>
              <p className="text-xs text-text-secondary max-w-xs">{errorMsg}</p>
            </div>
          )}

          {!loading && doc && (
            <>
              {/* Doc Title card */}
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="text-2xl font-bold font-sans text-text-primary tracking-wide">{doc.company}</h1>
                    <p className="text-sm text-accent-primary font-medium mt-1">{doc.role || 'Software Engineer'}</p>
                  </div>
                  
                  <div className="flex gap-2">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                      doc.department === 'IT' ? 'bg-[#73aeef]/10 text-[#73aeef]' : 'bg-[#6ba87d]/10 text-[#6ba87d]'
                    }`}>
                      {doc.department || 'CSE'}
                    </span>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                      doc.difficulty === 'Easy' 
                        ? 'bg-success-primary/10 text-success-primary' 
                        : doc.difficulty === 'Medium'
                        ? 'bg-warning-primary/10 text-warning-primary'
                        : 'bg-danger-primary/10 text-danger-primary'
                    }`}>
                      {doc.difficulty}
                    </span>
                  </div>
                </div>

                {/* Grid Metadata */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-bg-tertiary/40 border border-border-color text-xs text-text-secondary">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-text-muted">Candidate</span>
                    <p className="font-bold text-text-primary truncate">{doc.candidate_name}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-text-muted">Year</span>
                    <p className="font-bold text-text-primary">{doc.year || '2025'}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-text-muted">Package</span>
                    <p className="font-bold text-text-primary">{doc.package || 'Not Specified'}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-text-muted">Type</span>
                    <p className="font-bold text-text-primary">{doc.role_type || 'Placement'}</p>
                  </div>
                </div>
              </div>

              {/* Full Text Markdown rendering */}
              <div className="border-t border-border-color pt-6">
                <h3 className="text-sm font-bold uppercase text-text-secondary tracking-widest mb-4">Placement Interview Experience</h3>
                <div className="markdown-body bg-bg-tertiary/20 p-5 rounded-2xl border border-border-color leading-relaxed text-sm">
                  <ReactMarkdown>{doc.text}</ReactMarkdown>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
