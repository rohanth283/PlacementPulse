import React, { useState, useEffect } from 'react';
import { Search, Briefcase, Banknote, Calendar, Shield, X, AlertCircle } from 'lucide-react';
import ExperienceDrawer from './ExperienceDrawer';

export default function Explorer({ token }) {
  const [experiences, setExperiences] = useState([]);
  const [companies, setCompanies] = useState([]);
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedRoleType, setSelectedRoleType] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  
  // Drawer state
  const [activeExperienceId, setActiveExperienceId] = useState(null);
  
  const [loading, setLoading] = useState(true);

  const difficulties = ['Easy', 'Medium', 'Hard'];
  const years = ['2023', '2024', '2025'];
  const roleTypes = ['Placement', 'Internship'];
  const departments = ['CSE', 'ECE', 'EEE', 'IT'];

  useEffect(() => {
    fetchCompanies();
    fetchExperiences();
  }, [
    selectedCompany, 
    selectedDifficulty, 
    selectedYear, 
    selectedRoleType, 
    selectedDepartment
  ]);

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

  const fetchExperiences = async () => {
    setLoading(true);
    try {
      // Build query string
      const params = new URLSearchParams();
      if (selectedCompany) params.append('company', selectedCompany);
      if (selectedDifficulty) params.append('difficulty', selectedDifficulty);
      if (selectedYear) params.append('year', selectedYear);
      if (selectedRoleType) params.append('role_type', selectedRoleType);
      if (selectedDepartment) params.append('department', selectedDepartment);
      if (searchQuery.trim()) params.append('q', searchQuery.trim());

      const res = await fetch(`/api/experiences?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setExperiences(data.experiences);
      }
    } catch (err) {
      console.error('Failed to fetch experiences:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      fetchExperiences();
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCompany('');
    setSelectedDifficulty('');
    setSelectedYear('');
    setSelectedRoleType('');
    setSelectedDepartment('');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Filters Panel */}
      <div className="glass-card rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Text Search Bar */}
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-text-muted" />
            <input
              type="text"
              placeholder="Search candidate name, questions or text (Press Enter to query)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full glass-input pl-11 pr-4 py-3 rounded-xl text-sm"
            />
          </div>
          
          <button
            onClick={fetchExperiences}
            className="bg-accent-primary hover:bg-[#b86745] text-white px-6 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-all shadow-md active:scale-95 flex-shrink-0"
          >
            Search
          </button>
          
          <button
            onClick={clearFilters}
            className="bg-bg-secondary hover:bg-bg-tertiary border border-border-color hover:border-text-secondary text-text-secondary hover:text-text-primary px-5 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-all active:scale-95 flex-shrink-0"
          >
            Reset Filters
          </button>
        </div>

        {/* Dropdowns Filters grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-2">
          {/* Company dropdown */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Company</label>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="bg-bg-secondary border border-border-color rounded-xl px-3 py-2.5 text-xs text-text-primary focus:outline-none cursor-pointer w-full"
            >
              <option value="">All Companies</option>
              {companies.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Difficulty dropdown */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Difficulty</label>
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="bg-bg-secondary border border-border-color rounded-xl px-3 py-2.5 text-xs text-text-primary focus:outline-none cursor-pointer w-full"
            >
              <option value="">All Difficulties</option>
              {difficulties.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Year dropdown */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-bg-secondary border border-border-color rounded-xl px-3 py-2.5 text-xs text-text-primary focus:outline-none cursor-pointer w-full"
            >
              <option value="">All Years</option>
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Role Type dropdown */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Type</label>
            <select
              value={selectedRoleType}
              onChange={(e) => setSelectedRoleType(e.target.value)}
              className="bg-bg-secondary border border-border-color rounded-xl px-3 py-2.5 text-xs text-text-primary focus:outline-none cursor-pointer w-full"
            >
              <option value="">All Types</option>
              {roleTypes.map(rt => (
                <option key={rt} value={rt}>{rt}</option>
              ))}
            </select>
          </div>

          {/* Department dropdown */}
          <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
            <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Department</label>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="bg-bg-secondary border border-border-color rounded-xl px-3 py-2.5 text-xs text-text-primary focus:outline-none cursor-pointer w-full"
            >
              <option value="">All Departments</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Grid of Results */}
      {loading ? (
        <div className="flex justify-center items-center py-24">
          <div className="w-8 h-8 border-3 border-accent-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : experiences.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center glass-card rounded-2xl">
          <AlertCircle className="w-10 h-10 text-text-muted mb-3" />
          <h4 className="text-base font-bold text-text-primary mb-1">No placement experiences found</h4>
          <p className="text-xs text-text-secondary">Try adjusting your filters or search queries.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {experiences.map((exp) => {
            const showPackage = exp.package && 
              exp.package.toLowerCase() !== 'not specified' && 
              exp.package.toLowerCase() !== 'null' && 
              exp.package.trim() !== '';

            return (
              <div
                key={exp.id}
                onClick={() => setActiveExperienceId(exp.id)}
                className="glass-card rounded-2xl p-5 hover:border-accent-primary transition-all duration-300 shadow-sm cursor-pointer hover:shadow-lg hover:-translate-y-0.5 flex flex-col justify-between min-h-[180px]"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <span className="text-base font-extrabold text-text-primary truncate">{exp.company}</span>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        exp.department === 'IT' ? 'bg-[#73aeef]/10 text-[#73aeef]' : 'bg-[#6ba87d]/10 text-[#6ba87d]'
                      }`}>
                        {exp.department || 'CSE'}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        exp.difficulty === 'Easy' 
                          ? 'bg-success-primary/10 text-success-primary' 
                          : exp.difficulty === 'Medium'
                          ? 'bg-warning-primary/10 text-warning-primary'
                          : 'bg-danger-primary/10 text-danger-primary'
                      }`}>
                        {exp.difficulty}
                      </span>
                    </div>
                  </div>

                  <h4 className="text-sm font-bold font-sans text-text-primary mb-4">{exp.candidate_name}</h4>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-color pt-3 text-xs text-text-secondary">
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-text-muted" />
                    <span className="font-medium truncate max-w-[120px]">{exp.role || 'Software Engineer'}</span>
                  </div>
                  {showPackage && (
                    <div className="flex items-center gap-1.5">
                      <Banknote className="w-3.5 h-3.5 text-text-muted" />
                      <span className="font-semibold text-text-primary">{exp.package}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 ml-auto">
                    <Calendar className="w-3.5 h-3.5 text-text-muted" />
                    <span>{exp.year || '2025'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Slide-out details drawer overlay */}
      {activeExperienceId && (
        <ExperienceDrawer 
          token={token}
          experienceId={activeExperienceId} 
          onClose={() => setActiveExperienceId(null)} 
        />
      )}
    </div>
  );
}
