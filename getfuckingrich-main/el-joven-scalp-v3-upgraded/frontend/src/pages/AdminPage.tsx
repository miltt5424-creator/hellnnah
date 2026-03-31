import React, { useEffect, useState } from 'react';

const API = '';

const PLAN_COLORS: Record<string, string> = {
  admin: '#ff4444',
  elite: '#a78bfa',
  pro:   '#d4af37',
  free:  '#6b7280',
};

const PLAN_ICONS: Record<string, string> = {
  admin: '🛡️',
  elite: '👑',
  pro:   '⚡',
  free:  '🌱',
};

interface User {
  id: number;
  username: string;
  email: string;
  plan: string;
  login_count: number;
  last_seen: string | null;
  created_at: string;
}

interface Stats {
  totalUsers: number;
  activeToday: number;
  newThisWeek: number;
  byPlan: Record<string, number>;
  estimatedMRR: number;
  totalSignals: number;
  totalTrades: number;
}

function timeAgo(date: string | null) {
  if (!date) return 'Jamais';
  const diff = Date.now() - new Date(date).getTime();
  const min  = Math.floor(diff / 60000);
  const h    = Math.floor(diff / 3600000);
  const d    = Math.floor(diff / 86400000);
  if (min < 1)  return 'À l\'instant';
  if (min < 60) return `Il y a ${min}min`;
  if (h < 24)   return `Il y a ${h}h`;
  return `Il y a ${d}j`;
}

export default function AdminPage() {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [users,   setUsers]   = useState<User[]>([]);
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [updating, setUpdating] = useState<number | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [sRes, uRes] = await Promise.all([
        fetch(`${API}/api/admin/stats`, { credentials: 'include' }),
        fetch(`${API}/api/admin/users?limit=200`, { credentials: 'include' }),
      ]);
      const sData = await sRes.json();
      const uData = await uRes.json();
      if (sData.success) setStats(sData.stats);
      if (uData.success) setUsers(uData.users);
      if (!sData.success) setError(sData.error || 'Accès refusé');
    } catch {
      setError('Erreur réseau');
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const changePlan = async (userId: number, plan: string) => {
    setUpdating(userId);
    try {
      const res  = await fetch(`${API}/api/admin/users/${userId}/plan`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan } : u));
      }
    } catch {}
    setUpdating(null);
  };

  const deleteUser = async (userId: number, username: string) => {
    if (!confirm(`Supprimer ${username} ?`)) return;
    try {
      await fetch(`${API}/api/admin/users/${userId}`, { method: 'DELETE', credentials: 'include' });
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch {}
  };

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const card = (label: string, value: string | number, icon: string, color = '#d4af37') => (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '20px 24px', flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color, fontFamily: 'Space Mono, monospace' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.45)', marginTop: 4 }}>{label}</div>
    </div>
  );

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#d4af37', fontSize: 16 }}>
      Chargement...
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 48 }}>🚫</div>
      <div style={{ color: '#ff4444', fontSize: 16, fontWeight: 700 }}>{error}</div>
      <div style={{ color: 'rgba(245,240,232,0.4)', fontSize: 12 }}>Connectez-vous avec un compte admin</div>
    </div>
  );

  return (
    <div style={{ padding: 28, overflow: 'auto', flex: 1 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#d4af37', letterSpacing: '0.05em' }}>🛡️ ADMIN PANEL</div>
          <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)', marginTop: 4 }}>El Joven Scalp PRO — Gestion utilisateurs</div>
        </div>
        <button onClick={fetchAll} style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', color: '#d4af37', borderRadius: 10, padding: '8px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          🔄 Refresh
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'flex', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
          {card('Total inscrits',    stats.totalUsers,               '👥')}
          {card('Actifs aujourd\'hui', stats.activeToday,            '🟢', '#4ade80')}
          {card('Nouveaux / semaine', stats.newThisWeek,             '📈', '#60a5fa')}
          {card('MRR estimé',        `$${stats.estimatedMRR}`,       '💰', '#4ade80')}
          {card('Signaux générés',   stats.totalSignals,             '⚡')}
          {card('Trades journalisés', stats.totalTrades,             '📒')}
        </div>
      )}

      {/* Plan breakdown */}
      {stats && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          {Object.entries(stats.byPlan).map(([plan, count]) => (
            <div key={plan} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${PLAN_COLORS[plan] || '#444'}40`, borderRadius: 10, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{PLAN_ICONS[plan] || '?'}</span>
              <span style={{ color: PLAN_COLORS[plan] || '#fff', fontWeight: 700, fontSize: 13 }}>{plan.toUpperCase()}</span>
              <span style={{ color: 'rgba(245,240,232,0.6)', fontSize: 13 }}>{count} users</span>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Rechercher par nom ou email..."
          style={{ width: '100%', maxWidth: 400, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 16px', color: '#f5f0e8', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* Table */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 120px 80px 120px 140px 100px', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)' }}>
          {['Utilisateur', 'Email', 'Plan', 'Logins', 'Dernière connexion', 'Inscrit le', 'Actions'].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(245,240,232,0.35)' }}>{h}</div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'rgba(245,240,232,0.3)', fontSize: 13 }}>Aucun utilisateur trouvé</div>
        )}

        {filtered.map((user, i) => (
          <div key={user.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 120px 80px 120px 140px 100px', padding: '14px 20px', borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', alignItems: 'center', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: '#f5f0e8' }}>{user.username}</div>
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email || '—'}</div>

            {/* Plan selector */}
            <div>
              <select
                value={user.plan}
                disabled={updating === user.id || user.plan === 'admin'}
                onChange={e => changePlan(user.id, e.target.value)}
                style={{ background: `${PLAN_COLORS[user.plan] || '#444'}22`, border: `1px solid ${PLAN_COLORS[user.plan] || '#444'}66`, borderRadius: 8, color: PLAN_COLORS[user.plan] || '#fff', fontSize: 11, fontWeight: 700, padding: '4px 8px', cursor: 'pointer', outline: 'none' }}
              >
                <option value="free">🌱 FREE</option>
                <option value="pro">⚡ PRO</option>
                <option value="elite">👑 ELITE</option>
                <option value="admin">🛡️ ADMIN</option>
              </select>
            </div>

            <div style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)', textAlign: 'center' }}>{user.login_count || 0}</div>
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)' }}>{timeAgo(user.last_seen)}</div>
            <div style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)' }}>{new Date(user.created_at).toLocaleDateString('fr-FR')}</div>

            <div>
              {user.plan !== 'admin' && (
                <button onClick={() => deleteUser(user.id, user.username)} style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', color: '#ff4444', borderRadius: 8, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>
                  🗑️
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: 'rgba(245,240,232,0.25)', textAlign: 'right' }}>
        {filtered.length} utilisateur{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''}
      </div>
    </div>
  );
}
