import React, { useState, useEffect, useRef } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';

function Counter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      observer.disconnect();
      let start = 0;
      const step = target / 60;
      const timer = setInterval(() => {
        start += step;
        if (start >= target) { setVal(target); clearInterval(timer); }
        else setVal(Math.floor(start));
      }, 16);
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div onClick={() => setOpen(v => !v)} style={{
      border: "1px solid rgba(212,175,55,0.2)", borderRadius: 12,
      padding: "16px 20px", cursor: "pointer",
      background: open ? "rgba(212,175,55,0.05)" : "rgba(255,255,255,0.02)",
      transition: "all 0.3s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 15, color: "#f5f0e8", fontWeight: 600, lineHeight: 1.4 }}>{q}</span>
        <span style={{ color: "#d4af37", fontSize: 20, flexShrink: 0, transition: "transform 0.3s", transform: open ? "rotate(45deg)" : "none" }}>+</span>
      </div>
      {open && <p style={{ margin: "12px 0 0", fontSize: 13, color: "rgba(245,240,232,0.6)", lineHeight: 1.7 }}>{a}</p>}
    </div>
  );
}

function AuthModal({ mode, onClose }: { mode: "login" | "signup"; onClose: () => void }) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<"login" | "signup">(mode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!email || !password) { setError("Email et mot de passe requis"); return; }
    setLoading(true); setError("");
    try {
      const endpoint = tab === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = tab === "login" ? { username: email, password } : { username: email, password, name };
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) window.location.href = "/dashboard";
      else setError(data.error || "Erreur de connexion");
    } catch { setError("Erreur réseau"); }
    finally { setLoading(false); }
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: isMobile ? "100%" : 420,
        background: "rgba(15,12,8,0.98)",
        border: "1px solid rgba(212,175,55,0.3)",
        borderRadius: isMobile ? "20px 20px 0 0" : 20,
        padding: isMobile ? "28px 20px 40px" : 40,
        boxShadow: "0 0 80px rgba(212,175,55,0.1)",
      }}>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"rgba(212,175,55,0.5)", cursor:"pointer", fontSize:12, marginBottom:16, display:"flex", alignItems:"center", gap:6, padding:0 }}>← Retour</button>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 24, fontWeight: 700, color: "#d4af37", letterSpacing: "0.1em" }}>EL JOVEN</div>
          <div style={{ fontSize: 10, color: "rgba(212,175,55,0.5)", letterSpacing: "0.3em", marginTop: 2 }}>SCALP PRO</div>
        </div>
        <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 4, marginBottom: 24 }}>
          {(["login", "signup"] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setError(""); }} style={{
              flex: 1, padding: "9px 0", border: "none", cursor: "pointer", borderRadius: 8,
              fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
              background: tab === t ? "rgba(212,175,55,0.15)" : "transparent",
              color: tab === t ? "#d4af37" : "rgba(245,240,232,0.4)", transition: "all 0.2s",
            }}>{t === "login" ? "CONNEXION" : "INSCRIPTION"}</button>
          ))}
        </div>
        <button onClick={() => window.location.href = "/api/auth/google"} style={{
          width: "100%", padding: "12px 0", marginBottom: 16,
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10, cursor: "pointer", color: "#f5f0e8", fontSize: 13, fontWeight: 600,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continuer avec Google
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
          <span style={{ fontSize: 11, color: "rgba(245,240,232,0.3)" }}>OU</span>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          {tab === "signup" && (
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom complet"
              style={{ padding: "13px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#f5f0e8", fontSize: 14, outline: "none", width: "100%" }} />
          )}
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email"
            style={{ padding: "13px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#f5f0e8", fontSize: 14, outline: "none", width: "100%" }} />
          <div style={{ position: "relative" }}>
            <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Mot de passe" type={showPwd ? "text" : "password"}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              style={{ padding: "13px 16px", paddingRight: 42, width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#f5f0e8", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
            <button type="button" onClick={() => setShowPwd(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "rgba(245,240,232,0.4)" }}>
              {showPwd ? "🙈" : "👁️"}
            </button>
          </div>
        </div>
        {error && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 12, textAlign: "center" }}>{error}</div>}
        <button onClick={handleSubmit} disabled={loading} style={{
          width: "100%", padding: "14px 0",
          background: loading ? "rgba(212,175,55,0.3)" : "linear-gradient(135deg, #d4af37, #b8941f)",
          border: "none", borderRadius: 10, cursor: loading ? "not-allowed" : "pointer",
          color: "#0a0806", fontSize: 14, fontWeight: 800, letterSpacing: "0.1em",
        }}>
          {loading ? "..." : tab === "login" ? "SE CONNECTER" : "CRÉER MON COMPTE"}
        </button>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const isMobile = useIsMobile();
  const [authModal, setAuthModal] = useState<"login" | "signup" | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const FEATURES = [
    { icon: "🧠", title: "Multi-AI Engine", desc: "Gemini, Grok, Mistral et OpenRouter analysent le marché en parallèle. Le meilleur signal gagne." },
    { icon: "📐", title: "SMC + ICT Analysis", desc: "Smart Money Concepts, Order Blocks, FVG, Inducements, OTE — la méthode des institutionnels." },
    { icon: "⚡", title: "Auto-Signal 24/7", desc: "Scanner automatique toutes les 5 minutes avec seuil adaptatif selon la session de marché." },
    { icon: "🛡️", title: "Risk Manager", desc: "Calcul automatique des lots, Kelly Criterion, pip values réels par instrument." },
    { icon: "🤖", title: "MT5 Auto-Execution", desc: "Bridge direct avec MetaTrader 5. Les signaux s'exécutent automatiquement sur ton compte." },
    { icon: "📊", title: "Trade Journal", desc: "Persistance PostgreSQL. Sharpe ratio, max drawdown, streak, performance par setup." },
  ];

  const FAQS = [
    { q: "Quels instruments sont supportés ?", a: "XAU/USD, BTC/USD, ETH/USD, SOL/USD, EUR/USD, GBP/USD, USD/JPY, NAS100, SPX500, WTI et plus encore." },
    { q: "Comment fonctionne l'exécution MT5 ?", a: "Un Expert Advisor (EA) est installé dans ton MetaTrader 5. Il se connecte au backend via un bridge sécurisé et exécute les ordres automatiquement." },
    { q: "Les clés API sont-elles sécurisées ?", a: "Oui. Toutes les clés sont stockées côté serveur dans des variables d'environnement chiffrées. Elles ne transitent jamais côté client." },
    { q: "Est-ce que ça marche sur mobile ?", a: "Oui ! Le site est entièrement responsive et optimisé pour mobile avec une navigation dédiée." },
    { q: "Puis-je annuler à tout moment ?", a: "Oui, sans engagement. L'annulation est instantanée depuis ton espace compte. Aucun frais caché." },
  ];

  const px = isMobile ? "20px" : "48px";

  return (
    <div style={{ minHeight: "100vh", background: "#0a0806", color: "#f5f0e8", fontFamily: "DM Sans, sans-serif", overflowX: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
        @keyframes glow { 0%,100% { opacity:0.4; } 50% { opacity:0.8; } }
        @keyframes ticker { from { transform:translateX(0); } to { transform:translateX(-50%); } }
        .fade-up-1 { animation: fadeUp 0.8s 0.1s ease both; }
        .fade-up-2 { animation: fadeUp 0.8s 0.25s ease both; }
        .fade-up-3 { animation: fadeUp 0.8s 0.4s ease both; }
        .fade-up-4 { animation: fadeUp 0.8s 0.55s ease both; }
        .feature-card:hover { border-color:rgba(212,175,55,0.4) !important; transform:translateY(-4px); }
        .btn-gold-land:hover { transform:translateY(-2px); box-shadow:0 12px 40px rgba(212,175,55,0.4) !important; }
      `}</style>

      {/* Navbar */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        padding: isMobile ? "0 16px" : "0 48px", height: isMobile ? 56 : 64,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: scrolled ? "rgba(10,8,6,0.95)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(212,175,55,0.1)" : "none",
        transition: "all 0.3s",
      }}>
        <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: isMobile ? 18 : 22, fontWeight: 700, color: "#d4af37", letterSpacing: "0.1em" }}>
          EL JOVEN <span style={{ fontSize: isMobile ? 9 : 12, color: "rgba(212,175,55,0.5)", letterSpacing: "0.3em" }}>SCALP</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!isMobile && (
            <button onClick={() => setAuthModal("login")} style={{
              padding: "8px 20px", background: "transparent",
              border: "1px solid rgba(212,175,55,0.3)", borderRadius: 8,
              color: "#d4af37", fontSize: 12, fontWeight: 600, cursor: "pointer", letterSpacing: "0.06em",
            }}>CONNEXION</button>
          )}
          <button onClick={() => setAuthModal("signup")} className="btn-gold-land" style={{
            padding: isMobile ? "8px 16px" : "8px 20px",
            background: "linear-gradient(135deg, #d4af37, #b8941f)",
            border: "none", borderRadius: 8,
            color: "#0a0806", fontSize: 12, fontWeight: 800, cursor: "pointer", letterSpacing: "0.06em",
          }}>{isMobile ? "COMMENCER" : "COMMENCER"}</button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", padding: isMobile ? "100px 20px 60px" : "120px 48px 80px" }}>
        <div style={{ position: "absolute", top: "20%", left: "10%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,175,55,0.06) 0%, transparent 70%)", animation: "glow 4s ease-in-out infinite", pointerEvents: "none" }} />
        <div style={{ maxWidth: 900, textAlign: "center", position: "relative", zIndex: 1, width: "100%" }}>
          <div className="fade-up-1" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", border: "1px solid rgba(212,175,55,0.3)", borderRadius: 20, marginBottom: 24, background: "rgba(212,175,55,0.05)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e", display: "inline-block" }} />
            <span style={{ fontSize: isMobile ? 9 : 11, color: "rgba(212,175,55,0.8)", letterSpacing: "0.1em", fontFamily: "DM Mono, monospace" }}>LIVE · GEMINI + GROK + MISTRAL</span>
          </div>

          <h1 className="fade-up-2" style={{ fontFamily: "Cormorant Garamond, serif", fontSize: isMobile ? "42px" : "clamp(48px, 8vw, 96px)", fontWeight: 700, lineHeight: 1.1, marginBottom: 20, letterSpacing: "-0.01em" }}>
            L'IA qui trade<br />
            <span style={{ color: "#d4af37", textShadow: "0 0 60px rgba(212,175,55,0.3)" }}>comme les pros.</span>
          </h1>

          <p className="fade-up-3" style={{ fontSize: isMobile ? 15 : 18, color: "rgba(245,240,232,0.55)", lineHeight: 1.7, maxWidth: 600, margin: "0 auto 32px", fontWeight: 300 }}>
            Signaux SMC + ICT en temps réel, exécution automatique MT5, journal PostgreSQL.
          </p>

          <div className="fade-up-4" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => setAuthModal("signup")} className="btn-gold-land" style={{
              padding: isMobile ? "14px 32px" : "16px 40px",
              background: "linear-gradient(135deg, #d4af37, #b8941f)",
              border: "none", borderRadius: 12, color: "#0a0806",
              fontSize: isMobile ? 13 : 14, fontWeight: 800,
              cursor: "pointer", letterSpacing: "0.08em", transition: "all 0.3s",
              boxShadow: "0 8px 32px rgba(212,175,55,0.25)", width: isMobile ? "100%" : "auto",
            }}>ESSAYER GRATUITEMENT</button>
            <button onClick={() => setAuthModal("login")} style={{
              padding: isMobile ? "14px 32px" : "16px 40px",
              background: "rgba(212,175,55,0.06)",
              border: "1px solid rgba(212,175,55,0.25)", borderRadius: 12,
              color: "#d4af37", fontSize: isMobile ? 13 : 14, fontWeight: 600,
              cursor: "pointer", letterSpacing: "0.08em", width: isMobile ? "100%" : "auto",
            }}>SE CONNECTER</button>
          </div>

          <div style={{ display: "flex", gap: isMobile ? 24 : 48, justifyContent: "center", marginTop: 48, flexWrap: "wrap" }}>
            {[{ n: 18, suffix: "+", label: "Instruments" }, { n: 4, suffix: " AI", label: "Moteurs IA" }, { n: 99, suffix: "%", label: "Uptime" }].map(({ n, suffix, label }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: isMobile ? 28 : 36, fontWeight: 500, color: "#d4af37" }}>
                  <Counter target={n} suffix={suffix} />
                </div>
                <div style={{ fontSize: 10, color: "rgba(245,240,232,0.35)", letterSpacing: "0.15em", marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ticker */}
      <div style={{ overflow: "hidden", borderTop: "1px solid rgba(212,175,55,0.1)", borderBottom: "1px solid rgba(212,175,55,0.1)", padding: "10px 0", background: "rgba(212,175,55,0.02)" }}>
        <div style={{ display: "flex", animation: "ticker 20s linear infinite", whiteSpace: "nowrap" }}>
          {["XAU/USD +0.34%","BTC/USD +1.2%","ETH/USD -0.8%","EUR/USD +0.12%","GBP/USD +0.21%","NAS100 +0.54%","SPX500 +0.18%","XAG/USD +0.67%",
            "XAU/USD +0.34%","BTC/USD +1.2%","ETH/USD -0.8%","EUR/USD +0.12%","GBP/USD +0.21%","NAS100 +0.54%","SPX500 +0.18%","XAG/USD +0.67%"].map((t, i) => (
            <span key={i} style={{ padding: "0 24px", fontSize: 11, fontFamily: "DM Mono, monospace", color: t.includes("-") ? "#ef4444" : "#22c55e", opacity: 0.7 }}>{t}</span>
          ))}
        </div>
      </div>

      {/* Features */}
      <section style={{ padding: isMobile ? "60px 20px" : "100px 48px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: isMobile ? 36 : 64 }}>
          <div style={{ fontSize: 10, color: "rgba(212,175,55,0.6)", letterSpacing: "0.3em", marginBottom: 12, fontFamily: "DM Mono, monospace" }}>FONCTIONNALITÉS</div>
          <h2 style={{ fontFamily: "Cormorant Garamond, serif", fontSize: isMobile ? "28px" : "clamp(32px, 5vw, 56px)", fontWeight: 700, lineHeight: 1.2 }}>
            Tout ce qu'un trader<br /><span style={{ color: "#d4af37" }}>sérieux</span> a besoin.
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="feature-card" style={{
              padding: isMobile ? "20px" : "32px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(212,175,55,0.1)", borderRadius: 16,
              transition: "all 0.3s", display: "flex", gap: 16, alignItems: "flex-start",
            }}>
              <div style={{ fontSize: isMobile ? 28 : 36, flexShrink: 0 }}>{f.icon}</div>
              <div>
                <h3 style={{ fontFamily: "Cormorant Garamond, serif", fontSize: isMobile ? 18 : 22, fontWeight: 700, color: "#d4af37", marginBottom: 8 }}>{f.title}</h3>
                <p style={{ fontSize: 13, color: "rgba(245,240,232,0.5)", lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Banner */}
      <section style={{ padding: isMobile ? "50px 20px" : "80px 48px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(212,175,55,0.08) 0%, transparent 60%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", position: "relative" }}>
          <h2 style={{ fontFamily: "Cormorant Garamond, serif", fontSize: isMobile ? "26px" : "clamp(28px, 4vw, 48px)", fontWeight: 700, marginBottom: 16 }}>
            Prêt à trader avec <span style={{ color: "#d4af37" }}>l'IA</span> ?
          </h2>
          <p style={{ fontSize: isMobile ? 13 : 15, color: "rgba(245,240,232,0.5)", marginBottom: 28 }}>Commence gratuitement. Upgrade quand tu veux.</p>
          <button onClick={() => setAuthModal("signup")} className="btn-gold-land" style={{
            padding: isMobile ? "14px 32px" : "16px 48px",
            background: "linear-gradient(135deg, #d4af37, #b8941f)",
            border: "none", borderRadius: 12, color: "#0a0806",
            fontSize: isMobile ? 13 : 14, fontWeight: 800, cursor: "pointer",
            letterSpacing: "0.08em", boxShadow: "0 8px 32px rgba(212,175,55,0.25)",
            width: isMobile ? "100%" : "auto",
          }}>CRÉER MON COMPTE GRATUIT</button>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: isMobile ? "50px 20px" : "80px 48px", maxWidth: 800, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: isMobile ? 28 : 48 }}>
          <div style={{ fontSize: 10, color: "rgba(212,175,55,0.6)", letterSpacing: "0.3em", marginBottom: 12, fontFamily: "DM Mono, monospace" }}>FAQ</div>
          <h2 style={{ fontFamily: "Cormorant Garamond, serif", fontSize: isMobile ? "26px" : "clamp(28px, 4vw, 44px)", fontWeight: 700 }}>Questions fréquentes</h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {FAQS.map(f => <FAQItem key={f.q} {...f} />)}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: isMobile ? "24px 20px" : "32px 48px", borderTop: "1px solid rgba(212,175,55,0.1)", display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: "center", gap: 8, textAlign: isMobile ? "center" : "left" }}>
        <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 18, color: "#d4af37", fontWeight: 700 }}>EL JOVEN SCALP</div>
        <div style={{ fontSize: 11, color: "rgba(245,240,232,0.25)" }}>© 2025 El Joven Scalp. Trading involves risk.</div>
      </footer>

      {authModal && <AuthModal mode={authModal} onClose={() => setAuthModal(null)} />}
    </div>
  );
}
