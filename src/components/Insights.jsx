import React, { useState, useEffect } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { TrendingUp, Briefcase, Award, Users, MessageSquare, KeyRound, Activity, Shield } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

export default function Insights({ token }) {
  const [experiences, setExperiences] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch experiences for charts
      const resExp = await fetch('/api/experiences', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      let fetchedExperiences = [];
      if (resExp.ok) {
        const data = await resExp.json();
        setExperiences(data.experiences);
        fetchedExperiences = data.experiences;
      }

      // 2. Check admin status & stats
      const resMe = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resMe.ok) {
        const dataMe = await resMe.json();
        setIsAdmin(dataMe.is_admin);
        if (dataMe.is_admin) {
          const resAdmin = await fetch('/api/admin/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (resAdmin.ok) {
            const dataAdmin = await resAdmin.json();
            setAdminStats(dataAdmin);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load insights data:', err);
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // Statistics Calculations
  // ----------------------------------------------------
  const totalExperiences = experiences.length;
  
  const uniqueCompanies = new Set(experiences.map(e => e.company)).size;

  // Calculate highest package
  let maxLpa = 0;
  let maxPackageStr = "Not Specified";
  experiences.forEach(exp => {
    if (exp.package) {
      const clean = exp.package.toLowerCase();
      const match = clean.match(/(\d+(?:\.\d+)?)\s*(lpa|lakhs|lakh)/);
      if (match) {
        const lpaVal = parseFloat(match[1]);
        if (lpaVal > maxLpa) {
          maxLpa = lpaVal;
          maxPackageStr = exp.package;
        }
      }
    }
  });

  // Calculate top companies counts
  const companyCounts = {};
  experiences.forEach(e => {
    companyCounts[e.company] = (companyCounts[e.company] || 0) + 1;
  });
  const sortedCompanies = Object.entries(companyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const companyLabels = sortedCompanies.map(item => item[0]);
  const companyDataValues = sortedCompanies.map(item => item[1]);

  // Calculate difficulty counts
  const difficultyCounts = { Easy: 0, Medium: 0, Hard: 0 };
  experiences.forEach(e => {
    if (difficultyCounts[e.difficulty] !== undefined) {
      difficultyCounts[e.difficulty]++;
    }
  });

  // ----------------------------------------------------
  // Charts Configurations
  // ----------------------------------------------------
  const barChartData = {
    labels: companyLabels,
    datasets: [{
      label: 'Experiences Shared',
      data: companyDataValues,
      backgroundColor: 'rgba(210, 125, 89, 0.75)',
      borderColor: '#d27d59',
      borderWidth: 1.5,
      borderRadius: 6
    }]
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#222220',
        titleColor: '#ece8e1',
        bodyColor: '#ece8e1',
        borderColor: 'rgba(240, 238, 233, 0.07)',
        borderWidth: 1
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#a39f98', font: { family: 'Plus Jakarta Sans', size: 10 } }
      },
      y: {
        grid: { color: 'rgba(240, 238, 233, 0.05)' },
        ticks: { color: '#a39f98', font: { family: 'Plus Jakarta Sans', size: 10 } }
      }
    }
  };

  const doughnutChartData = {
    labels: ['Easy', 'Medium', 'Hard'],
    datasets: [{
      data: [difficultyCounts.Easy, difficultyCounts.Medium, difficultyCounts.Hard],
      backgroundColor: [
        'rgba(107, 168, 125, 0.75)',  // Sage Green
        'rgba(227, 174, 115, 0.75)',  // Sand Yellow
        'rgba(224, 92, 74, 0.75)'     // Warm Red
      ],
      borderColor: [
        '#6ba87d',
        '#e3ae73',
        '#e05c4a'
      ],
      borderWidth: 1.5
    }]
  };

  const doughnutChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#ece8e1',
          font: { family: 'Plus Jakarta Sans', size: 11 },
          boxWidth: 12
        }
      },
      tooltip: {
        backgroundColor: '#222220',
        borderColor: 'rgba(240, 238, 233, 0.07)',
        borderWidth: 1
      }
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-8 h-8 border-3 border-accent-primary border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-xs text-text-secondary">Loading statistics...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Counters Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* Total Experiences */}
        <div className="glass-card rounded-2xl p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center text-accent-primary flex-shrink-0">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest block">Total Placements</span>
            <span className="text-2xl font-bold font-sans mt-0.5 block">{totalExperiences}</span>
          </div>
        </div>

        {/* Unique Companies */}
        <div className="glass-card rounded-2xl p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-success-primary/10 border border-success-primary/20 flex items-center justify-center text-success-primary flex-shrink-0">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest block">Unique Companies</span>
            <span className="text-2xl font-bold font-sans mt-0.5 block">{uniqueCompanies}</span>
          </div>
        </div>

        {/* Highest Package */}
        <div className="glass-card rounded-2xl p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-warning-primary/10 border border-warning-primary/20 flex items-center justify-center text-warning-primary flex-shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest block">Top Package</span>
            <span className="text-2xl font-bold font-sans mt-0.5 block truncate max-w-[180px]">{maxPackageStr}</span>
          </div>
        </div>
      </div>

      {/* Graphical Charts Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Companies Bar chart */}
        <div className="glass-card rounded-2xl p-5 lg:col-span-2 flex flex-col h-[320px] shadow-sm">
          <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-4">Top Recruiters Breakdown</h3>
          <div className="flex-1 relative">
            <Bar data={barChartData} options={barChartOptions} />
          </div>
        </div>

        {/* Difficulty Breakdown chart */}
        <div className="glass-card rounded-2xl p-5 flex flex-col h-[320px] shadow-sm">
          <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-4">Interview Difficulty Mix</h3>
          <div className="flex-1 relative">
            <Doughnut data={doughnutChartData} options={doughnutChartOptions} />
          </div>
        </div>
      </div>

      {/* Admin Panel Analytics metrics */}
      {isAdmin && adminStats && (
        <div className="glass-card rounded-2xl p-6 space-y-6 shadow-sm border border-accent-primary/20">
          <div className="flex items-center gap-3 border-b border-border-color pb-4">
            <Shield className="w-6 h-6 text-accent-primary" />
            <div>
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest">Admin Control & Metrics Console</h3>
              <p className="text-[10px] text-text-secondary">Global token metrics and registered candidate access levels.</p>
            </div>
          </div>

          {/* Admin Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-bg-tertiary/40 border border-border-color p-4 rounded-xl">
              <span className="text-[9px] uppercase tracking-wider font-bold text-text-muted">Total Users</span>
              <p className="text-lg font-bold text-text-primary mt-1 flex items-center gap-2">
                <Users className="w-4.5 h-4.5 text-accent-primary" />
                {adminStats.stats.total_users}
              </p>
            </div>
            <div className="bg-bg-tertiary/40 border border-border-color p-4 rounded-xl">
              <span className="text-[9px] uppercase tracking-wider font-bold text-text-muted">Total Chats</span>
              <p className="text-lg font-bold text-text-primary mt-1 flex items-center gap-2">
                <MessageSquare className="w-4.5 h-4.5 text-accent-primary" />
                {adminStats.stats.total_conversations}
              </p>
            </div>
            <div className="bg-bg-tertiary/40 border border-border-color p-4 rounded-xl">
              <span className="text-[9px] uppercase tracking-wider font-bold text-text-muted">Total Messages</span>
              <p className="text-lg font-bold text-text-primary mt-1 flex items-center gap-2">
                <Activity className="w-4.5 h-4.5 text-accent-primary" />
                {adminStats.stats.total_messages}
              </p>
            </div>
            <div className="bg-bg-tertiary/40 border border-border-color p-4 rounded-xl">
              <span className="text-[9px] uppercase tracking-wider font-bold text-text-muted">Total Tokens Usage</span>
              <p className="text-lg font-bold text-text-primary mt-1 flex items-center gap-2">
                <KeyRound className="w-4.5 h-4.5 text-accent-primary" />
                {adminStats.stats.total_tokens.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Admin Users Table */}
          <div className="border border-border-color rounded-xl overflow-hidden bg-bg-secondary/20">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-bg-tertiary/75 border-b border-border-color text-text-secondary uppercase tracking-widest text-[9px] font-bold">
                  <th className="p-3">User ID</th>
                  <th className="p-3">Username</th>
                  <th className="p-3">Role</th>
                  <th className="p-3 text-center">Chats Created</th>
                  <th className="p-3 text-center">Messages Sent</th>
                  <th className="p-3 text-right">Tokens Used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color text-text-primary">
                {adminStats.users.map((user) => (
                  <tr key={user.id} className="hover:bg-bg-tertiary/30">
                    <td className="p-3 font-semibold text-text-muted">#{user.id}</td>
                    <td className="p-3 font-bold">{user.username}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        user.is_admin ? 'bg-accent-primary/10 text-accent-primary border border-accent-primary/20' : 'bg-bg-tertiary text-text-secondary'
                      }`}>
                        {user.is_admin ? 'Admin' : 'Candidate'}
                      </span>
                    </td>
                    <td className="p-3 text-center font-semibold">{user.chat_count}</td>
                    <td className="p-3 text-center font-semibold">{user.message_count}</td>
                    <td className="p-3 text-right font-bold">{user.token_count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
