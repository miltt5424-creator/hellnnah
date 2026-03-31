import React, { useEffect, useState } from 'react';

export default function TelegramPanel() {
  const [enabled, setEnabled]   = useState<boolean | null>(null);
  const [testing, setTesting]   = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; reason: string } | null>(null);

  useEffect(() => {
    fetch('/api/telegram/status', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setEnabled(d.enabled))
      .catch(() => setEnabled(false));
  }, []);

  const test = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch('/api/telegram/test', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      setTestResult({ ok: d.success, reason: d.reason });
    } catch {
      setTestResult({ ok: false, reason: 'Backend introuvable' });
    }
    setTesting(false);
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">📢 TELEGRAM</span>
        <span style={{ fontSize:9, padding:'2px 8px', borderRadius:20,
          background: enabled ? 'rgba(0,230,118,0.15)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${enabled ? 'rgba(0,230,118,0.3)' : 'var(--border)'}`,
          color: enabled ? 'var(--buy)' : 'var(--text-muted)' }}>
          {enabled === null ? '...' : enabled ? '● ACTIF' : '○ INACTIF'}
        </span>
      </div>
      <div className="panel-body" style={{ display:'flex', flexDirection:'column', gap:10 }}>

        {!enabled ? (
          <>
            <div style={{ fontSize:10, color:'var(--text-dim)', lineHeight:1.8 }}>
              Configure 2 variables dans ton <code style={{ color:'var(--gold)' }}>.env</code> pour activer :
            </div>
            <div style={{ padding:'10px 12px', borderRadius:8, background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)', fontFamily:'Space Mono,monospace', fontSize:9, lineHeight:2, color:'var(--text-dim)' }}>
              <div><span style={{ color:'var(--gold)' }}>TELEGRAM_BOT_TOKEN</span>=7123456:AAFxxx...</div>
              <div><span style={{ color:'var(--gold)' }}>TELEGRAM_CHAT_ID</span>=@MonCanal</div>
              <div style={{ opacity:0.5, fontSize:8 }}># optionnel :</div>
              <div style={{ opacity:0.5, fontSize:8 }}>TELEGRAM_MIN_CONFIDENCE=60</div>
              <div style={{ opacity:0.5, fontSize:8 }}>TELEGRAM_MIN_RR=1.5</div>
            </div>
            <div style={{ fontSize:9, color:'var(--text-muted)', lineHeight:1.7 }}>
              <div style={{ fontWeight:700, color:'var(--text-dim)', marginBottom:4 }}>Étapes setup (5 min) :</div>
              <div>1. Telegram → cherche <strong>@BotFather</strong></div>
              <div>2. Envoie <code>/newbot</code> → copie le token</div>
              <div>3. Crée un canal → ajoute ton bot comme <strong>admin</strong></div>
              <div>4. Canal public : <code>CHAT_ID = @NomCanal</code></div>
              <div>5. Canal privé : forward un msg vers <strong>@userinfobot</strong> pour l'ID</div>
              <div>6. Redémarre le backend</div>
            </div>
          </>
        ) : (
          <>
            <div style={{ padding:'8px 12px', borderRadius:8, background:'rgba(0,230,118,0.07)', border:'1px solid rgba(0,230,118,0.2)', fontSize:10, color:'var(--buy)', lineHeight:1.7 }}>
              ✅ Bot Telegram configuré et actif.<br />
              <span style={{ fontSize:8, color:'var(--text-muted)' }}>Les signaux BUY/SELL confirmés sont automatiquement envoyés dans ton canal.</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <div style={{ fontSize:9, color:'var(--text-muted)', letterSpacing:'0.08em' }}>CE QUI EST ENVOYÉ</div>
              {[
                '✅ Signaux manuels IA (bouton GÉNÉRER)',
                '✅ Signaux auto (AutoSignal scheduler)',
                '✅ Notification START/STOP AutoSignal',
                '🔇 Signaux HOLD filtrés',
                '🔇 Signaux sous seuil confiance/RR',
              ].map((item, i) => (
                <div key={i} style={{ fontSize:9, color: item.startsWith('✅') ? 'var(--buy)' : 'var(--text-muted)', padding:'2px 0' }}>{item}</div>
              ))}
            </div>
            <button onClick={test} disabled={testing} style={{ padding:'8px', borderRadius:8, border:'1px solid var(--border)', background:'rgba(255,255,255,0.04)', color:'var(--text-dim)', fontSize:10, cursor:'pointer', fontWeight:600 }}>
              {testing ? '⏳ Envoi...' : '📤 Envoyer message de test'}
            </button>
            {testResult && (
              <div style={{ fontSize:9, padding:'6px 10px', borderRadius:8,
                background: testResult.ok ? 'rgba(0,230,118,0.08)' : 'rgba(255,51,85,0.08)',
                border: `1px solid ${testResult.ok ? 'rgba(0,230,118,0.3)' : 'rgba(255,51,85,0.3)'}`,
                color: testResult.ok ? 'var(--buy)' : 'var(--sell)' }}>
                {testResult.ok ? '✅ Message reçu dans le canal !' : `❌ ${testResult.reason}`}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}