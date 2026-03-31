import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile';

type Section = 'profile' | 'security' | 'notifications' | 'api';

export default function ProfilePage() {
  const isMobile = useIsMobile();
  const [section, setSection] = useState<Section>('profile');
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', fullName: '', bio: '', timezone: 'UTC', language: 'fr' });
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [showPw, setShowPw] = useState({ current: false, newPw: false, confirm: false });
  const [notifs, setNotifs] = useState({ signalEmail: true, signalPush: true, newsEmail: false, weeklyReport: true, priceAlert: true, mt5Alert: true });
  const [apiKeys, setApiKeys] = useState({ gemini: '', grok: '', mistral: '', openrouter: '' });
  const [showKeys, setShowKeys] = useState({ gemini: false, grok: false, mistral: false, openrouter: false });

  useEffect(() => {
    const stored = localStorage.getItem('eljoven_user');
    if (stored) { try { const u = JSON.parse(stored); setForm(f => ({ ...f, username: u.username || '', email: u.email || '' })); } catch {} }
    const keys = localStorage.getItem('eljoven_apikeys');
    if (keys) { try { setApiKeys(JSON.parse(keys)); } catch {} }
    fetch('/api/auth/check', { credentials: 'include' }).then(r => r.json()).then(d => {
      if (d.authenticated && d.user) setForm(f => ({ ...f, username: d.user, email: d.email || f.email }));
    }).catch(() => {});
  }, []);

  const handleSave = () => {
    localStorage.setItem('eljoven_user', JSON.stringify({ username: form.username, email: form.email, fullName: form.fullName }));
    setSaved(true); setTimeout(() => setSaved(false), 2500);
    window.dispatchEvent(new Event('eljoven_user_updated'));
  };
  const handleSaveKeys = () => {
    localStorage.setItem('eljoven_apikeys', JSON.stringify(apiKeys));
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#f5f0e8', fontSize: 16, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'rgba(212,175,55,0.7)', letterSpacing: '0.1em', marginBottom: 6, display: 'block' };
  const cardStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: isMobile ? 16 : 24, marginBottom: 16 };
  const btnStyle: React.CSSProperties = { padding: '13px 28px', background: 'linear-gradient(135deg, #d4af37, #8b6914)', border: 'none', borderRadius: 10, cursor: 'pointer', color: '#0a0806', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', width: isMobile ? '100%' : 'auto' };

  const NAV = [
    { key: 'profile', icon: '👤', label: 'Profil' },
    { key: 'security', icon: '🔒', label: 'Securite' },
    { key: 'notifications', icon: '🔔', label: 'Notifs' },
    { key: 'api', icon: '🔑', label: 'API Keys' },
  ] as const;

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px 12px 80px' : 24, background: 'var(--bg)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ marginBottom: isMobile ? 16 : 28 }}>
          <h1 style={{ fontFamily: 'Syne,sans-serif', fontSize: isMobile ? 18 : 22, fontWeight: 900, color: '#d4af37', margin: 0 }}>MON COMPTE</h1>
          {!isMobile && <p style={{ fontSize: 12, color: 'rgba(245,240,232,0.4)', margin: '4px 0 0' }}>Gerez votre profil, securite et preferences</p>}
        </div>

        {/* Nav mobile — tabs horizontaux */}
        {isMobile ? (
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
            {NAV.map(item => (
              <button key={item.key} onClick={() => setSection(item.key)} style={{
                flexShrink: 0, padding: '8px 14px', cursor: 'pointer', borderRadius: 20,
                fontSize: 12, fontWeight: 700,
                background: section === item.key ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
                color: section === item.key ? '#d4af37' : 'rgba(245,240,232,0.5)',
                border: section === item.key ? '1px solid rgba(212,175,55,0.3)' : '1px solid transparent',
              }}>{item.icon} {item.label}</button>
            ))}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 20 }}>
          {/* Nav desktop */}
          {!isMobile && (
            <div style={{ width: 180, flexShrink: 0 }}>
              <div style={{ ...cardStyle, padding: 8, marginBottom: 0 }}>
                <div style={{ textAlign: 'center', padding: '16px 8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 8 }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #d4af37, #8b6914)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#0a0806', margin: '0 auto 8px', boxShadow: '0 0 20px rgba(212,175,55,0.4)' }}>
                    {form.username?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#f5f0e8' }}>{form.username || 'Guest'}</div>
                </div>
                {NAV.map(item => (
                  <button key={item.key} onClick={() => setSection(item.key)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', border: 'none', cursor: 'pointer', borderRadius: 8, background: section === item.key ? 'rgba(212,175,55,0.1)' : 'transparent', color: section === item.key ? '#d4af37' : 'rgba(245,240,232,0.55)', fontSize: 12, fontWeight: section === item.key ? 700 : 500, transition: 'all 0.15s', textAlign: 'left', borderLeft: section === item.key ? '2px solid #d4af37' : '2px solid transparent' }}>
                    <span style={{ fontSize: 14 }}>{item.icon}</span>{item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            {saved && <div style={{ padding: '12px 16px', marginBottom: 16, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, fontSize: 12, color: '#22c55e' }}>✅ Sauvegarde avec succes</div>}

            {section === 'profile' && (
              <div>
                <div style={cardStyle}>
                  <h3 style={{ fontSize: 13, fontWeight: 800, color: '#d4af37', margin: '0 0 16px' }}>INFORMATIONS PERSONNELLES</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                    <div><label style={labelStyle}>NOM D UTILISATEUR</label><input style={inputStyle} value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="username" /></div>
                    <div><label style={labelStyle}>NOM COMPLET</label><input style={inputStyle} value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="John Doe" /></div>
                    <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}><label style={labelStyle}>EMAIL</label><input style={inputStyle} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" type="email" /></div>
                    <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}><label style={labelStyle}>BIO</label><textarea style={{ ...inputStyle, height: 80, resize: 'vertical' }} value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Trader depuis..." /></div>
                    <div><label style={labelStyle}>TIMEZONE</label><select style={{ ...inputStyle, cursor: 'pointer' }} value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}>{['UTC','Europe/Paris','America/New_York','Asia/Tokyo','Asia/Dubai'].map(tz => <option key={tz} value={tz} style={{ background: '#0a0806' }}>{tz}</option>)}</select></div>
                    <div><label style={labelStyle}>LANGUE</label><select style={{ ...inputStyle, cursor: 'pointer' }} value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))}><option value="fr" style={{ background: '#0a0806' }}>Francais</option><option value="en" style={{ background: '#0a0806' }}>English</option></select></div>
                  </div>
                </div>
                <div style={{ ...cardStyle, background: 'rgba(212,175,55,0.04)', borderColor: 'rgba(212,175,55,0.15)' }}>
                  <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: isMobile ? 'column' : 'row', gap: 12 }}>
                    <div><h3 style={{ fontSize: 13, fontWeight: 800, color: '#d4af37', margin: '0 0 4px' }}>FORFAIT ACTUEL</h3><div style={{ fontSize: 12, color: 'rgba(245,240,232,0.5)' }}>Plan gratuit — 5 signaux/jour</div></div>
                    <button onClick={() => navigate('/pricing')} style={btnStyle}>UPGRADE PRO</button>
                  </div>
                </div>
                <button onClick={handleSave} style={btnStyle}>SAUVEGARDER</button>
              </div>
            )}

            {section === 'security' && (
              <div style={cardStyle}>
                <h3 style={{ fontSize: 13, fontWeight: 800, color: '#d4af37', margin: '0 0 16px' }}>CHANGER LE MOT DE PASSE</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {(['current', 'newPw', 'confirm'] as const).map(key => (
                    <div key={key}>
                      <label style={labelStyle}>{key === 'current' ? 'MOT DE PASSE ACTUEL' : key === 'newPw' ? 'NOUVEAU MOT DE PASSE' : 'CONFIRMER'}</label>
                      <div style={{ position: 'relative' }}>
                        <input type={showPw[key] ? 'text' : 'password'} style={{ ...inputStyle, paddingRight: 42 }} value={pwForm[key]} onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))} placeholder="..." />
                        <button type="button" onClick={() => setShowPw(s => ({ ...s, [key]: !s[key] }))} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: 'rgba(245,240,232,0.4)' }}>{showPw[key] ? '🙈' : '👁️'}</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={handleSave} style={{ ...btnStyle, marginTop: 20 }}>METTRE A JOUR</button>
              </div>
            )}

            {section === 'notifications' && (
              <div style={cardStyle}>
                <h3 style={{ fontSize: 13, fontWeight: 800, color: '#d4af37', margin: '0 0 16px' }}>NOTIFICATIONS</h3>
                {[
                  { key: 'signalEmail', label: 'Signaux par email', desc: 'Recevez les signaux AI par email' },
                  { key: 'signalPush', label: 'Signaux push', desc: 'Notifications push navigateur' },
                  { key: 'weeklyReport', label: 'Rapport hebdomadaire', desc: 'Performance de la semaine' },
                  { key: 'priceAlert', label: 'Alertes de prix', desc: 'Quand un prix atteint votre niveau' },
                  { key: 'mt5Alert', label: 'Alertes MT5', desc: 'Executions et erreurs MT5' },
                ].map((item, i, arr) => (
                  <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: i < arr.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none', gap: 12 }}>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 13, color: '#f5f0e8', fontWeight: 600 }}>{item.label}</div><div style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)', marginTop: 2 }}>{item.desc}</div></div>
                    <div onClick={() => setNotifs(n => ({ ...n, [item.key]: !n[item.key as keyof typeof n] }))} style={{ width: 44, height: 24, borderRadius: 999, cursor: 'pointer', background: notifs[item.key as keyof typeof notifs] ? 'linear-gradient(135deg, #d4af37, #8b6914)' : 'rgba(255,255,255,0.1)', position: 'relative', transition: 'all 0.2s', flexShrink: 0 }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: notifs[item.key as keyof typeof notifs] ? 23 : 3, transition: 'left 0.2s' }} />
                    </div>
                  </div>
                ))}
                <button onClick={handleSave} style={{ ...btnStyle, marginTop: 20 }}>SAUVEGARDER</button>
              </div>
            )}

            {section === 'api' && (
              <div style={cardStyle}>
                <h3 style={{ fontSize: 13, fontWeight: 800, color: '#d4af37', margin: '0 0 6px' }}>API KEYS — MOTEURS IA</h3>
                <p style={{ fontSize: 11, color: 'rgba(245,240,232,0.4)', margin: '0 0 16px' }}>Vos cles sont stockees localement.</p>
                {([
                  { key: 'gemini', label: 'GEMINI (Google)', url: 'https://aistudio.google.com/app/apikey', color: '#4285F4' },
                  { key: 'grok', label: 'GROK (xAI)', url: 'https://console.x.ai', color: '#1DA1F2' },
                  { key: 'mistral', label: 'MISTRAL', url: 'https://console.mistral.ai', color: '#FF7000' },
                  { key: 'openrouter', label: 'OPENROUTER', url: 'https://openrouter.ai/keys', color: '#9b59b6' },
                ] as const).map(item => (
                  <div key={item.key} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }}><span style={{ color: item.color }}>●</span> {item.label}</label>
                      <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: 'rgba(212,175,55,0.5)', textDecoration: 'none' }}>Obtenir</a>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input type={showKeys[item.key] ? 'text' : 'password'} style={{ ...inputStyle, paddingRight: 42, fontFamily: 'Space Mono, monospace', fontSize: 12 }} value={apiKeys[item.key]} onChange={e => setApiKeys(k => ({ ...k, [item.key]: e.target.value }))} placeholder={"Colle ta cle " + item.label} />
                      <button type="button" onClick={() => setShowKeys(s => ({ ...s, [item.key]: !s[item.key] }))} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: 'rgba(245,240,232,0.4)' }}>{showKeys[item.key] ? '🙈' : '👁️'}</button>
                    </div>
                  </div>
                ))}
                <button onClick={handleSaveKeys} style={btnStyle}>SAUVEGARDER LES CLES</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
