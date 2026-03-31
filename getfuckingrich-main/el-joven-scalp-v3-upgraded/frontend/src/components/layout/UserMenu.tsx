import React, { useState, useRef, useEffect } from 'react';
import { setPlanGlobal, resetPlanFetch, isInPromo } from '../../hooks/usePlan';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';

export default function UserMenu() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<{ username: string } | null>(null);
  const [plan, setPlan] = useState('free');
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const setPage = useUIStore((s) => s.setPage);

  useEffect(() => {
    // Ecoute les mises à jour du profil
    const onUpdate = () => {
      const stored = localStorage.getItem('eljoven_user');
      if (stored) { try { setUser(JSON.parse(stored)); } catch {} }
    };
    window.addEventListener('eljoven_user_updated', onUpdate);
    return () => window.removeEventListener('eljoven_user_updated', onUpdate);
  }, []);

  useEffect(() => {
    // D'abord localStorage pour affichage rapide
    const stored = localStorage.getItem('eljoven_user');
    if (stored) { try { setUser(JSON.parse(stored)); } catch {} }

    // Puis vérifie le vrai user depuis le backend
    fetch('/api/auth/check', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.authenticated && d.user) {
          setUser({ username: d.user });
          const p = (d.plan || 'free') as any;
          setPlan(p);
          setPlanGlobal(p, d.created_at);
          localStorage.setItem('eljoven_user', JSON.stringify({ username: d.user, email: d.email || '' }));
        } else {
          setUser(null);
          localStorage.removeItem('eljoven_user');
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    localStorage.removeItem('eljoven_user');
    navigate('/');
  };

  const initial = user?.username?.[0]?.toUpperCase() || '?';
  const username = user?.username || 'Guest';

  const MENU_ITEMS = [
    { icon: '👤', label: 'Mon Profil',     action: () => { setPage('profile'); navigate('/profile'); } },
    { icon: '💎', label: 'Mon Forfait',    action: () => navigate('/pricing') },
    { icon: '⚙️', label: 'Paramètres',    action: () => { setPage('profile'); navigate('/profile'); } },
    { icon: '📊', label: 'Mes Stats',      action: () => navigate('/journal') },
    { icon: '🔑', label: 'API Keys',       action: () => { setPage('profile'); navigate('/profile'); } },
    { divider: true },
    { icon: '🚪', label: 'Déconnexion',    action: handleLogout, danger: true },
  ];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Avatar Button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 10px 4px 4px',
          background: open ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${open ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 999, cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        {/* Avatar */}
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: 'linear-gradient(135deg, #d4af37, #8b6914)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, color: '#0a0806',
          flexShrink: 0, boxShadow: '0 0 10px rgba(212,175,55,0.4)',
        }}>
          {initial}
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', fontFamily: 'Space Mono,monospace', lineHeight: 1.2 }}>
            {username.length > 10 ? username.slice(0, 10) + '…' : username}
          </div>
          <div style={{ fontSize: 8, color: 'rgba(212,175,55,0.45)', letterSpacing: '0.15em', lineHeight: 1 }}>
            {plan === 'admin' ? 'ADMIN' : plan === 'elite' ? 'FORFAIT ELITE' : plan === 'pro' ? 'FORFAIT PRO' : isInPromo() ? '🎁 LANCEMENT' : 'FORFAIT FREE'}
          </div>
        </div>
        <span style={{ fontSize: 8, color: 'rgba(212,175,55,0.4)', marginLeft: 2, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 220, zIndex: 999,
          background: 'rgba(10,8,6,0.97)',
          border: '1px solid rgba(212,175,55,0.2)',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 30px rgba(212,175,55,0.08)',
          backdropFilter: 'blur(40px)',
          overflow: 'hidden',
          animation: 'fadeIn 0.15s ease',
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 16px 12px',
            borderBottom: '1px solid rgba(212,175,55,0.1)',
            background: 'rgba(212,175,55,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'linear-gradient(135deg, #d4af37, #8b6914)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 800, color: '#0a0806',
                boxShadow: '0 0 16px rgba(212,175,55,0.5)',
              }}>
                {initial}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#f5f0e8' }}>{username}</div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  marginTop: 3, padding: '2px 8px',
                  background: 'rgba(212,175,55,0.1)',
                  border: '1px solid rgba(212,175,55,0.2)',
                  borderRadius: 999, fontSize: 8,
                  color: 'rgba(212,175,55,0.7)', letterSpacing: '0.15em',
                }}>
                  {plan === 'admin' ? '🛡️ ADMIN' : plan === 'elite' ? '✦ ELITE' : plan === 'pro' ? '✦ PRO' : isInPromo() ? '🎁 LANCEMENT' : '✦ FREE'}
                </div>
              </div>
            </div>
          </div>

          {/* Items */}
          <div style={{ padding: '6px 0' }}>
            {MENU_ITEMS.map((item, i) => {
              if ('divider' in item && item.divider) return (
                <div key={i} style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '6px 0' }} />
              );
              return (
                <button key={i} onClick={() => { item.action?.(); setOpen(false); }} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer',
                  color: (item as any).danger ? '#ef4444' : 'rgba(245,240,232,0.75)',
                  fontSize: 12, textAlign: 'left',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = (item as any).danger ? 'rgba(239,68,68,0.08)' : 'rgba(212,175,55,0.07)';
                  (e.currentTarget as HTMLButtonElement).style.color = (item as any).danger ? '#ef4444' : '#d4af37';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'none';
                  (e.currentTarget as HTMLButtonElement).style.color = (item as any).danger ? '#ef4444' : 'rgba(245,240,232,0.75)';
                }}>
                  <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{(item as any).icon}</span>
                  <span style={{ fontWeight: 500 }}>{(item as any).label}</span>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: '10px 16px',
            borderTop: '1px solid rgba(212,175,55,0.08)',
            background: 'rgba(212,175,55,0.03)',
          }}>
            <button onClick={() => { navigate('/pricing'); setOpen(false); }} style={{
              width: '100%', padding: '8px 0',
              background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.08))',
              border: '1px solid rgba(212,175,55,0.3)',
              borderRadius: 8, cursor: 'pointer',
              color: '#d4af37', fontSize: 10, fontWeight: 800,
              letterSpacing: '0.15em', transition: 'all 0.2s',
            }}>
              {plan === 'free' ? '✦ PASSER À PRO' : plan === 'pro' ? '✦ PASSER À ELITE' : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
