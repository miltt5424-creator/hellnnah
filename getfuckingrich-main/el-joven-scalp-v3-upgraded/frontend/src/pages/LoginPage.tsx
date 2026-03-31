import React, { useState, useEffect } from 'react';

interface LoginPageProps { onLogin: () => void; }

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [mounted,  setMounted]  = useState(false);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 50); return () => clearTimeout(t); }, []);

  const submit = async () => {
    if (!password.trim()) { setError('Enter your access code'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ username: username || 'joven', password }), credentials:'include',
      });
      const data = await res.json();
      if (data.success) { if (data.token) localStorage.setItem('ejoven_token', data.token); onLogin(); }
      else setError('Invalid access code');
    } catch { setError('Connection error — check backend'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--bg-base)', position:'relative', overflow:'hidden' }}>

      {/* Animated background orbs */}
      {[
        { size:500, top:'10%', left:'15%', color:'rgba(255,215,0,0.06)', delay:0 },
        { size:400, top:'60%', left:'65%', color:'rgba(0,120,255,0.04)', delay:2 },
        { size:350, top:'40%', left:'45%', color:'rgba(0,255,136,0.03)', delay:4 },
        { size:300, top:'75%', left:'10%', color:'rgba(150,80,255,0.04)', delay:1 },
      ].map((orb, i) => (
        <div key={i} style={{
          position:'absolute', borderRadius:'50%',
          width:orb.size, height:orb.size,
          background:`radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
          top:orb.top, left:orb.left,
          animation:`orbFloat ${7+i}s ease-in-out ${orb.delay}s infinite`,
          pointerEvents:'none',
        }} />
      ))}

      {/* Grid texture */}
      <div style={{
        position:'absolute', inset:0, opacity:0.03, pointerEvents:'none',
        backgroundImage:'linear-gradient(var(--border-md) 1px, transparent 1px), linear-gradient(90deg, var(--border-md) 1px, transparent 1px)',
        backgroundSize:'40px 40px',
      }} />

      {/* Card */}
      <div style={{
        width:'100%', maxWidth:400, padding:'0 20px',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(20px)',
        transition:'opacity 0.5s var(--ease-out), transform 0.5s var(--ease-out)',
        position:'relative', zIndex:10,
      }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{
            width:72, height:72, borderRadius:'var(--r-xl)',
            background:'linear-gradient(135deg, rgba(255,215,0,0.22) 0%, rgba(255,215,0,0.06) 100%)',
            border:'1px solid var(--border-gold)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:36, margin:'0 auto 16px',
            boxShadow:'var(--shadow-gold)', animation:'goldPulse 3s ease infinite',
          }}>⚡</div>
          <h1 style={{ fontFamily:'Syne,sans-serif', fontSize:28, fontWeight:900, color:'var(--gold)', letterSpacing:'0.04em', lineHeight:1, marginBottom:6 }}>
            EL JOVEN SCALP
          </h1>
          <p style={{ fontSize:11, color:'var(--text-muted)', letterSpacing:'0.2em', fontFamily:'Space Mono,monospace' }}>
            AI TRADING DESK · PRO
          </p>
        </div>

        {/* Form */}
        <div className="panel panel-gold">
          <div className="panel-header" style={{ justifyContent:'center' }}>
            <span className="panel-title">🔐 ACCESS PORTAL</span>
          </div>
          <div className="panel-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <div style={{ fontSize:9, color:'var(--text-muted)', letterSpacing:'0.1em', marginBottom:5 }}>USERNAME</div>
              <input className="input" placeholder="joven" value={username} onChange={e => setUsername(e.target.value)}
                style={{ background:'rgba(255,255,255,0.04)' }} />
            </div>
            <div>
              <div style={{ fontSize:9, color:'var(--text-muted)', letterSpacing:'0.1em', marginBottom:5 }}>ACCESS CODE</div>
              <input className="input" type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>

            {error && (
              <div style={{ fontSize:10, color:'var(--sell)', padding:'7px 10px', background:'var(--sell-dim)', borderRadius:'var(--r-sm)', border:'1px solid var(--border-sell)' }}>
                ⚠️ {error}
              </div>
            )}

            <button className="btn btn-gold btn-xl" style={{ width:'100%', justifyContent:'center', marginTop:4 }}
              onClick={submit} disabled={loading}>
              {loading ? <><span className="spinner spinner-sm" /> AUTHENTICATING...</> : <>⚡ ACCESS DASHBOARD</>}
            </button>

            <div style={{ textAlign:'center', fontSize:9, color:'var(--text-muted)', lineHeight:1.6, marginTop:4 }}>
              Default code: set <span style={{ color:'var(--gold)', fontFamily:'Space Mono,monospace' }}>ADMIN_PASSWORD</span> in backend .env
            </div>
          </div>
        </div>

        <div style={{ textAlign:'center', marginTop:24, fontSize:9, color:'var(--text-muted)' }}>
          Don't have a plan?{' '}
          <span style={{ color:'var(--gold)', cursor:'pointer', fontWeight:700 }}>
            View pricing →
          </span>
        </div>
      </div>
    </div>
  );
}
