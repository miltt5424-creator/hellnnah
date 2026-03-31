import React, { useState } from 'react';
import { useAutoIndicators } from '../hooks/useAutoIndicators';
import { useIsMobile } from '../hooks/useIsMobile';
import PlanGate from '../components/ui/PlanGate';
import { usePlan } from '../hooks/usePlan';

import TradingViewWidget from '../components/chart/TradingViewWidget';
import MarketInfoPanel from '../components/market/MarketInfoPanel';
import AISignalPanel from '../components/signals/AISignalPanel';
import CompositeScorePanel from '../components/signals/CompositeScorePanel';
import SignalHistoryPanel from '../components/signals/SignalHistoryPanel';
import AutoSignalPanel from '../components/signals/AutoSignalPanel';
import IndicatorsPanel from '../components/signals/IndicatorsPanel';
import { OrderFlowPanel, ScalpTimerPanel, QuickTradeButtons } from '../components/scalping/ScalpingDashboard';
import RiskManagerPanel from '../components/risk/RiskManagerPanel';
import AIChat from '../components/ai/AIChat';
import NewsPanel from '../components/news/NewsPanel';
import MacroCalendarPanel from '../components/news/MacroCalendarPanel';
import AlertsPanel from '../components/alerts/AlertsPanel';
import BacktestPanel from '../components/backtest/BacktestPanel';
import MT5ExecutionPanel from '../components/mt5/MT5ExecutionPanel';
import TelegramPanel from '../components/telegram/TelegramPanel';
import StrategyPanel from '../components/signals/StrategyPanel';
import MobileDrawer from '../components/layout/MobileDrawer';
import MarketHeatmap from '../components/market/MarketHeatmap';

type LeftTab  = 'signal' | 'indicators' | 'auto';
type RightTab = 'tools' | 'news' | 'backtest' | 'heatmap' | 'strategy';
type MobileTab = 'signal' | 'tools' | 'news' | 'more';

const Gap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ marginBottom: 16 }}>{children}</div>
);

// ══ DESKTOP ══════════════════════════════════════════════════════
function DesktopLayout() {
  const { isPro, isElite, isAdmin } = usePlan();
  const [leftTab,  setLeftTab]  = useState<LeftTab>('signal');
  const [rightTab, setRightTab] = useState<RightTab>('tools');

  const tabBtnStyle = (active: boolean) => ({
    flex: 1, padding: '12px 6px', fontSize: 11, fontWeight: 700,
    border: 'none', cursor: 'pointer', background: 'transparent',
    color: active ? 'var(--gold)' : 'var(--text-muted)',
    borderBottom: active ? '2px solid var(--gold)' : '2px solid transparent',
    transition: 'all 0.2s',
  });

  const colStyle: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: '20px 16px' };

  return (
    <div style={{ flex:1, display:'grid', gridTemplateColumns:'320px minmax(600px, 1fr) 380px', overflow:'hidden', minHeight:0 }}>
      {/* GAUCHE */}
      <div style={{ display:'flex', flexDirection:'column', borderRight:'1px solid var(--border)', overflow:'hidden' }}>
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', background:'var(--glass-01)', flexShrink:0 }}>
          {(['signal','indicators','auto'] as LeftTab[]).map(tab => (
            <button key={tab} onClick={() => setLeftTab(tab)} style={tabBtnStyle(leftTab===tab)}>
              {tab==='signal' && '⚡ Signal'}{tab==='indicators' && '🔬 Indic'}{tab==='auto' && '🤖 Auto'}
            </button>
          ))}
        </div>
        <div style={colStyle}>
          {leftTab==='signal' && <><Gap><MarketInfoPanel /></Gap><Gap><AISignalPanel /></Gap><CompositeScorePanel /></>}
          {leftTab==='indicators' && <IndicatorsPanel />}
          {leftTab==='auto' && <><PlanGate minPlan="pro" disableOnly><Gap><AutoSignalPanel /></Gap></PlanGate><SignalHistoryPanel /></>}
        </div>
      </div>
      {/* CENTRE */}
      <div style={{ display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ flex:1, minHeight:380, padding:'20px 16px 10px', display:'flex', flexDirection:'column' }}>
          <div style={{ flex:1, borderRadius:'var(--r-lg)', overflow:'hidden', border:'1px solid var(--border)' }}>
            <TradingViewWidget />
          </div>
        </div>
        <div style={{ borderTop:'1px solid var(--border)', padding:'16px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, flexShrink:0 }}>
          <OrderFlowPanel /><ScalpTimerPanel />
        </div>
      </div>
      {/* DROITE */}
      <div style={{ display:'flex', flexDirection:'column', borderLeft:'1px solid var(--border)', overflow:'hidden' }}>
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', background:'var(--glass-01)', flexShrink:0 }}>
          {(['tools','news','backtest','heatmap','strategy'] as RightTab[]).map(tab => (
            <button key={tab} onClick={() => setRightTab(tab)} style={tabBtnStyle(rightTab===tab)}>
              {tab==='tools' && '🔧 Tools'}{tab==='news' && '📰 News'}{tab==='backtest' && '🧮 Test'}{tab==='heatmap' && '💹 Heat'}{tab==='strategy' && '🧠 SMC'}
            </button>
          ))}
        </div>
        <div style={colStyle}>
          {rightTab==='tools' && <><Gap><QuickTradeButtons /></Gap><PlanGate minPlan="elite" disableOnly><Gap><MT5ExecutionPanel /></Gap></PlanGate><PlanGate minPlan="pro"><Gap><RiskManagerPanel /></Gap></PlanGate><Gap><TelegramPanel /></Gap><Gap><AlertsPanel /></Gap><AIChat /></>}
          {rightTab==='news' && <><Gap><NewsPanel /></Gap><MacroCalendarPanel /></>}
          {rightTab==='backtest' && <PlanGate minPlan="pro"><BacktestPanel /></PlanGate>}
          {rightTab==='heatmap' && <MarketHeatmap />}
          {rightTab==='strategy' && <StrategyPanel />}
        </div>
      </div>
    </div>
  );
}

// ══ MOBILE ═══════════════════════════════════════════════════════
function MobileLayout() {
  const [tab, setTab] = useState<MobileTab>('signal');
  const [drawerOpen, setDrawerOpen] = useState(false);

  React.useEffect(() => {
    const handler = () => setDrawerOpen(true);
    window.addEventListener('open-drawer', handler);
    return () => window.removeEventListener('open-drawer', handler);
  }, []);
  const [signalSub, setSignalSub] = useState<'signal'|'auto'|'indic'>('signal');

  const scrollStyle: React.CSSProperties = {
    flex: 1, overflowY: 'auto', padding: '12px',
    paddingBottom: 80,
    display: 'flex', flexDirection: 'column', gap: 12,
  };

  const BOTTOM_TABS: { key: MobileTab; icon: string; label: string }[] = [
    { key: 'signal', icon: '⚡', label: 'Signal' },
    { key: 'tools',  icon: '🔧', label: 'Tools'  },
    { key: 'news',   icon: '📰', label: 'News'   },
    { key: 'more',   icon: '⋯',  label: 'Plus'   },
  ];

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' }}>
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* CONTENU */}
      <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column' }}>

        {/* SIGNAL */}
        {tab==='signal' && (
          <div style={{ display:'flex', flexDirection:'column' }}>
            {/* Sub tabs */}
            <div style={{ display:'flex', borderBottom:'1px solid var(--border)', background:'var(--glass-01)', flexShrink:0 }}>
              {(['signal','indic','auto'] as const).map(s => (
                <button key={s} onClick={() => setSignalSub(s as any)} style={{
                  flex:1, padding:'10px 4px', fontSize:11, fontWeight:700,
                  border:'none', cursor:'pointer', background:'transparent',
                  color: signalSub===s ? 'var(--gold)' : 'var(--text-muted)',
                  borderBottom: signalSub===s ? '2px solid var(--gold)' : '2px solid transparent',
                }}>
                  {s==='signal' ? '⚡ Signal' : s==='indic' ? '🔬 Indic' : '🤖 Auto'}
                </button>
              ))}
            </div>
            <div style={{ padding:'12px', paddingBottom:80, display:'flex', flexDirection:'column', gap:12 }}>
              {signalSub==='signal' && <><MarketInfoPanel /><AISignalPanel /><CompositeScorePanel /></>}
              {signalSub==='indic'  && <IndicatorsPanel />}
              {signalSub==='auto'   && <><PlanGate minPlan="pro" disableOnly><AutoSignalPanel /></PlanGate><SignalHistoryPanel /></>}
            </div>
          </div>
        )}

        {/* TOOLS */}
        {tab==='tools' && (
          <div style={{ padding:'12px', paddingBottom:80, display:'flex', flexDirection:'column', gap:12 }}>
            <QuickTradeButtons />
            <PlanGate minPlan="elite" disableOnly><MT5ExecutionPanel /></PlanGate>
            <TelegramPanel />
            <PlanGate minPlan="pro"><RiskManagerPanel /></PlanGate>
            <AlertsPanel />
            <AIChat />
          </div>
        )}

        {/* NEWS */}
        {tab==='news' && (
          <div style={{ padding:'12px', paddingBottom:80, display:'flex', flexDirection:'column', gap:12 }}>
            <NewsPanel />
            <MacroCalendarPanel />
          </div>
        )}

        {/* MORE */}
        {tab==='more' && (
          <div style={{ padding:'12px', paddingBottom:80, display:'flex', flexDirection:'column', gap:12 }}>
            <PlanGate minPlan="pro"><BacktestPanel /></PlanGate>
            <MarketHeatmap />
            <StrategyPanel />
          </div>
        )}
      </div>

      {/* BOTTOM NAV */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: 64, zIndex: 100,
        background: 'rgba(10,8,6,0.97)',
        borderTop: '1px solid var(--border)',
        backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'stretch',
      }}>
        {BOTTOM_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 3,
            background: 'transparent', border: 'none', cursor: 'pointer',
            borderTop: tab===t.key ? '2px solid var(--gold)' : '2px solid transparent',
            transition: 'all 0.2s',
          }}>
            <span style={{ fontSize: 18 }}>{t.icon}</span>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
              color: tab===t.key ? 'var(--gold)' : 'var(--text-muted)',
            }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ══ EXPORT ═══════════════════════════════════════════════════════
export default function DashboardPage() {
  useAutoIndicators();
  const isMobile = useIsMobile();
  return isMobile ? <MobileLayout /> : <DesktopLayout />;
}