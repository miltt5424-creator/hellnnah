import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarketStore } from '../../store/marketStore';
import { formatPrice } from '../../utils/priceFormat';
import { isInPromo, promoDaysLeft } from '../../hooks/usePlan';

const GROUPS = [
  { label:'COMMODITIES', items:[
    { symbol:'XAU/USD', icon:'🥇', name:'Gold',    dec:2 },
    { symbol:'XAG/USD', icon:'🥈', name:'Silver',  dec:3 },
    { symbol:'WTI/USD', icon:'⛽', name:'Oil',     dec:2 },
  ]},
  { label:'FOREX', items:[
    { symbol:'EUR/USD', icon:'💶', name:'EUR/USD', dec:5 },
    { symbol:'GBP/USD', icon:'💷', name:'GBP/USD', dec:5 },
    { symbol:'USD/JPY', icon:'💴', name:'USD/JPY', dec:3 },
    { symbol:'AUD/USD', icon:'🦘', name:'AUD/USD', dec:5 },
  ]},
  { label:'CRYPTO', items:[
    { symbol:'BTC/USD', icon:'₿',  name:'Bitcoin',  dec:0 },
    { symbol:'ETH/USD', icon:'Ξ',  name:'Ethereum', dec:2 },
    { symbol:'SOL/USD', icon:'◎',  name:'Solana',   dec:2 },
  ]},
  { label:'INDICES', items:[
    { symbol:'NAS100/USD', icon:'🧠', name:'Nasdaq', dec:0 },
    { symbol:'SPX500/USD', icon:'🏛️', name:'S&P 500', dec:0 },
  ]},
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function MobileDrawer({ open, onClose }: Props) {
  const navigate   = useNavigate();
  const symbol     = useMarketStore(s => s.symbol);
  const setSymbol  = useMarketStore(s => s.setSymbol);
  const prices     = useMarketStore(s => s.prices);
  const [user]     = useState(() => {
    try { return JSON.parse(localStorage.getItem("eljoven_user") || "{}"); } catch { return {}; }
  });
  const [plan]     = useState(() => localStorage.getItem("eljoven_plan") || "free");

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    localStorage.removeItem("eljoven_user");
    window.location.href = "/";
  };

  const selectSymbol = (sym: string) => {
    setSymbol(sym);
    onClose();
  };

  const promo = isInPromo();
  const daysLeft = promoDaysLeft();

  return (
    <>
      {/* Overlay */}
      {open && (
        <div onClick={onClose} style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
        }} />
      )}

      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 201,
        width: 280,
        background: "var(--bg-deep)",
        borderRight: "1px solid var(--border-gold)",
        display: "flex", flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.3s cubic-bezier(0.16,1,0.3,1)",
        boxShadow: open ? "4px 0 40px rgba(0,0,0,0.6)" : "none",
      }}>

        {/* Header profil */}
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid var(--border)", background: "rgba(212,175,55,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: 11, color: "var(--gold)", fontWeight: 700, letterSpacing: "0.1em" }}>EL JOVEN SCALP</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, padding: 4 }}>✕</button>
          </div>

          {/* Avatar + infos */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: "50%",
              background: "linear-gradient(135deg, #d4af37, #8b6914)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 800, color: "#0a0806",
              boxShadow: "0 0 12px rgba(212,175,55,0.4)",
            }}>
              {(user.username?.[0] || "?").toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{user.username || "Guest"}</div>
              <div style={{ fontSize: 10, color: "var(--gold)", opacity: 0.7, marginTop: 2 }}>
                {plan === "admin" ? "🛡️ ADMIN" : plan === "elite" ? "👑 ELITE" : plan === "pro" ? "⚡ PRO" : promo ? "🎁 LANCEMENT" : "🌱 FREE"}
              </div>
            </div>
          </div>

          {/* Promo badge */}
          {promo && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.3)", borderRadius: 10, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--gold)", fontWeight: 700 }}>🎁 OFFRE LANCEMENT — J-{daysLeft}</div>
              <div style={{ fontSize: 9, color: "rgba(245,240,232,0.5)", marginTop: 3 }}>Accès complet sauf bot MT5</div>
            </div>
          )}
        </div>

        {/* Watchlist */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          <div style={{ padding: "10px 16px 6px", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Watchlist
          </div>
          {GROUPS.map(group => (
            <div key={group.label}>
              <div style={{ padding: "8px 16px 4px", fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(212,175,55,0.4)", textTransform: "uppercase" }}>
                {group.label}
              </div>
              {group.items.map(item => {
                const p = prices[item.symbol];
                const active = symbol === item.symbol;
                const up = p && p.changePct >= 0;
                return (
                  <button key={item.symbol} onClick={() => selectSymbol(item.symbol)} style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 16px", background: active ? "rgba(212,175,55,0.08)" : "transparent",
                    border: "none", borderLeft: `3px solid ${active ? "var(--gold)" : "transparent"}`,
                    cursor: "pointer", transition: "all 0.15s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{item.icon}</span>
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: active ? "var(--gold)" : "var(--text-primary)" }}>{item.name}</div>
                        <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "Space Mono, monospace" }}>{item.symbol}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {p ? (
                        <>
                          <div style={{ fontSize: 12, fontFamily: "Space Mono, monospace", fontWeight: 700, color: active ? "var(--gold)" : "var(--text-primary)" }}>
                            {formatPrice(p.price, item.dec)}
                          </div>
                          <div style={{ fontSize: 9, color: up ? "var(--buy)" : "var(--sell)", fontFamily: "Space Mono, monospace" }}>
                            {up ? "+" : ""}{p.changePct.toFixed(2)}%
                          </div>
                        </>
                      ) : <div style={{ width: 40, height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 4 }} />}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={() => { navigate("/profile"); onClose(); }} style={{
            width: "100%", padding: "10px 16px", background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
            color: "var(--text-primary)", fontSize: 13, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span>👤</span> Mon Profil
          </button>
          <button onClick={() => { navigate("/pricing"); onClose(); }} style={{
            width: "100%", padding: "10px 16px", background: "rgba(212,175,55,0.06)",
            border: "1px solid rgba(212,175,55,0.2)", borderRadius: 10,
            color: "var(--gold)", fontSize: 13, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span>💎</span> Plans & Tarifs
          </button>
          {plan === "admin" && (
            <button onClick={() => { navigate("/admin"); onClose(); }} style={{
              width: "100%", padding: "10px 16px", background: "rgba(255,68,68,0.06)",
              border: "1px solid rgba(255,68,68,0.2)", borderRadius: 10,
              color: "#ff6b6b", fontSize: 13, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span>🛡️</span> Admin Panel
            </button>
          )}
          <button onClick={handleLogout} style={{
            width: "100%", padding: "10px 16px", background: "transparent",
            border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10,
            color: "#ef4444", fontSize: 13, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span>🚪</span> Déconnexion
          </button>
        </div>
      </div>
    </>
  );
}
