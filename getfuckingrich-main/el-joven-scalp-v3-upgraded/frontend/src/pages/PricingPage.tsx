import React, { useState } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';

const PLANS = [
  { id: 'free', name: 'FREE', icon: '🌱', price: 0, period: 'forever', color: 'var(--text-dim)', paid: false, popular: false,
    features: ['✅ 5 AI signals / day','✅ 3 instruments','✅ Basic indicators','✅ TradingView chart','✅ News feed','❌ Auto-signal','❌ Risk Manager','❌ Multi-AI','❌ MT5 Auto-execution'],
    cta: 'Start Free' },
  { id: 'pro', name: 'PRO', icon: '⚡', price: 29, period: 'month', color: 'var(--gold)', paid: true, popular: true,
    features: ['✅ Unlimited AI signals','✅ All instruments (18+)','✅ All indicators (20+)','✅ Auto-signal scheduler','✅ Risk Manager + Kelly','✅ Trade Journal','✅ Multi-AI (Gemini/Grok/Mistral)','✅ Backtest engine','❌ MT5 Auto-execution'],
    cta: 'Get PRO' },
  { id: 'elite', name: 'ELITE', icon: '👑', price: 79, period: 'month', color: '#a78bfa', paid: true, popular: false,
    features: ['✅ Everything in PRO','✅ MT5 Auto-execution','✅ Multi-account support','✅ Custom AI prompts','✅ Webhook alerts','✅ Priority support','✅ Early access features','✅ Advanced backtesting'],
    cta: 'Get ELITE' },
];

type Plan = typeof PLANS[0];

function PaymentModal({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (num: string, label: string) => {
    navigator.clipboard.writeText(num);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(10px)', display:'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent:'center', padding: isMobile ? 0 : 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width:'100%', maxWidth: isMobile ? '100%' : 460, background:'rgba(15,12,8,0.98)', border:'1px solid rgba(212,175,55,0.35)', borderRadius: isMobile ? '20px 20px 0 0' : 24, padding: isMobile ? '28px 20px 40px' : '36px 32px', position:'relative' }}>
        <button onClick={onClose} style={{ position:'absolute', top:16, right:16, background:'rgba(255,255,255,0.06)', border:'none', color:'rgba(245,240,232,0.5)', cursor:'pointer', width:32, height:32, borderRadius:8, fontSize:16 }}>✕</button>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>{plan.icon}</div>
          <div style={{ fontSize:20, fontWeight:700, color:'#d4af37' }}>PLAN {plan.name}</div>
          <div style={{ fontSize:13, color:'rgba(245,240,232,0.5)', marginTop:6 }}>
            Abonnement mensuel — <span style={{ color:plan.color, fontWeight:700 }}>${plan.price}/mois</span>
          </div>
        </div>
        <div style={{ background:'rgba(212,175,55,0.06)', border:'1px solid rgba(212,175,55,0.15)', borderRadius:12, padding:'14px 16px', marginBottom:16, fontSize:12, color:'rgba(245,240,232,0.65)', lineHeight:1.7 }}>
          📲 Envoyez <strong style={{ color:'#d4af37' }}>${plan.price}</strong> via MVola ou Orange Money, puis contactez-nous sur Facebook avec votre <strong style={{ color:'#d4af37' }}>recu de paiement</strong>.
        </div>
        {[
          { label: 'MVOLA — TELMA', icon: '📱', num: '034 70 677 76', key: 'mvola', raw: '0347067776', color: '#d4af37', bg: 'rgba(212,175,55,0.1)', border: 'rgba(212,175,55,0.25)' },
          { label: 'ORANGE MONEY', icon: '🟠', num: '032 96 200 31', key: 'orange', raw: '0329620031', color: '#fb923c', bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.3)' },
        ].map(item => (
          <div key={item.key} style={{ marginBottom:12 }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.15em', color:'rgba(245,240,232,0.35)', marginBottom:8 }}>{item.label}</div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'12px 14px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:20 }}>{item.icon}</span>
                <div style={{ fontSize:16, fontWeight:700, fontFamily:'Space Mono, monospace', color:'#f5f0e8' }}>{item.num}</div>
              </div>
              <button onClick={() => copy(item.raw, item.key)} style={{ background: copied===item.key ? 'rgba(74,222,128,0.15)' : item.bg, border:'1px solid', borderColor: copied===item.key ? 'rgba(74,222,128,0.4)' : item.border, color: copied===item.key ? '#4ade80' : item.color, borderRadius:8, padding:'6px 14px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                {copied === item.key ? 'Copie !' : 'Copier'}
              </button>
            </div>
          </div>
        ))}
        <a href="https://www.facebook.com/profile.php?id=61583572947595" target="_blank" rel="noopener noreferrer" style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, width:'100%', padding:'13px 0', background:'linear-gradient(135deg, #1877f2, #0d5ec4)', border:'none', borderRadius:12, color:'#fff', fontSize:13, fontWeight:700, textDecoration:'none', marginTop:4 }}>
          📘 Envoyer le recu sur Facebook
        </a>
        <div style={{ textAlign:'center', marginTop:12, fontSize:10, color:'rgba(245,240,232,0.25)' }}>Activation sous 24h apres confirmation</div>
      </div>
    </div>
  );
}

export default function PricingPage() {
  const isMobile = useIsMobile();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  return (
    <div style={{ padding: isMobile ? '16px 12px 80px' : 32, overflow:'auto', flex:1 }}>
      <div style={{ textAlign:'center', marginBottom: isMobile ? 24 : 40 }}>
        <div style={{ fontSize: isMobile ? 22 : 28, fontWeight:900, color:'var(--gold)', letterSpacing:'0.05em', marginBottom:8 }}>💎 PLANS & PRICING</div>
        <div style={{ fontSize:13, color:'var(--text-muted)' }}>Professional AI trading signals. Cancel anytime.</div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? 14 : 24, maxWidth:1000, margin:'0 auto' }}>
        {PLANS.map(plan => (
          <div key={plan.id} className="panel" style={{ padding: isMobile ? 20 : 28, border: plan.popular ? '2px solid var(--gold)' : '1px solid var(--border)', position:'relative' }}>
            {plan.popular && (
              <div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)', background:'var(--gold)', color:'#000', fontSize:9, fontWeight:900, padding:'3px 12px', borderRadius:20, letterSpacing:'0.1em', whiteSpace:'nowrap' }}>
                MOST POPULAR
              </div>
            )}
            <div style={{ display:'flex', alignItems: isMobile ? 'center' : 'flex-start', justifyContent: isMobile ? 'space-between' : 'center', flexDirection: isMobile ? 'row' : 'column', marginBottom: isMobile ? 16 : 24 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:28 }}>{plan.icon}</span>
                <div>
                  <div style={{ fontSize:15, fontWeight:900, color:plan.color, letterSpacing:'0.1em' }}>{plan.name}</div>
                  {isMobile && <div style={{ fontSize:11, color:'var(--text-muted)' }}>/ {plan.period}</div>}
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'baseline', gap:4, justifyContent: isMobile ? 'flex-end' : 'center' }}>
                <span style={{ fontSize: isMobile ? 28 : 36, fontWeight:900, fontFamily:'Space Mono, monospace', color:'var(--text)' }}>${plan.price}</span>
                {!isMobile && <span style={{ fontSize:11, color:'var(--text-muted)' }}>/ {plan.period}</span>}
              </div>
            </div>
            {!isMobile && (
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:24 }}>
                {plan.features.map((f, i) => (
                  <div key={i} style={{ fontSize:11, color: f.startsWith('✅') ? 'var(--text)' : 'var(--text-muted)' }}>{f}</div>
                ))}
              </div>
            )}
            {isMobile && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:16 }}>
                {plan.features.filter(f => f.startsWith('✅')).map((f, i) => (
                  <span key={i} style={{ fontSize:10, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:20, padding:'3px 10px', color:'var(--text)' }}>{f.replace('✅ ', '')}</span>
                ))}
              </div>
            )}
            <button className={`btn ${plan.popular ? 'btn-gold' : 'btn-ghost'}`} style={{ width:'100%', padding:'11px 0', fontSize:12, fontWeight:700 }} onClick={() => plan.paid && setSelectedPlan(plan)}>
              {plan.cta}
            </button>
          </div>
        ))}
      </div>

      <div style={{ textAlign:'center', marginTop: isMobile ? 24 : 40, color:'var(--text-muted)', fontSize:11 }}>
        🔒 MVola & Orange Money · Activation 24h · Aucun frais caches
      </div>

      {selectedPlan && <PaymentModal plan={selectedPlan} onClose={() => setSelectedPlan(null)} />}
    </div>
  );
}
