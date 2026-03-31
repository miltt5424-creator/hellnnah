import React from 'react';
import { usePlan, Plan } from '../../hooks/usePlan';
import { useNavigate } from 'react-router-dom';

interface Props {
  minPlan: Plan;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  blur?: boolean;
  disableOnly?: boolean;
}

export default function PlanGate({ minPlan, children, fallback, blur = true, disableOnly = false }: Props) {
  const { canAccess } = usePlan();
  const navigate = useNavigate();

  if (canAccess(minPlan)) return <>{children}</>;
  if (fallback) return <>{fallback}</>;

  // Mode disableOnly : visible mais non cliquable
  if (disableOnly) {
    return (
      <div style={{ position: 'relative', width: '100%' }}>
        <div style={{ opacity: 0.45, pointerEvents: 'none', width: '100%', filter: 'grayscale(0.3)' }}>
          {children}
        </div>
        <div
          onClick={() => navigate('/pricing')}
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.15)',
            borderRadius: 12, cursor: 'pointer', gap: 4,
            border: '1px solid rgba(212,175,55,0.15)',
          }}
        >
          <div style={{ fontSize: 14 }}>🔒</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#d4af37', letterSpacing: '0.08em' }}>
            {minPlan.toUpperCase()} REQUIS
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', width: '100%' }}>
      {blur && (
        <div style={{ filter: 'blur(3px)', opacity: 0.35, pointerEvents: 'none', width: '100%' }}>
          {children}
        </div>
      )}
      <div
        onClick={() => navigate('/pricing')}
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.25)',
          borderRadius: 12, cursor: 'pointer', gap: 6,
          backdropFilter: 'blur(1px)',
          border: '1px solid rgba(212,175,55,0.15)',
        }}
      >
        <div style={{ fontSize: 20 }}>🔒</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#d4af37', letterSpacing: '0.08em' }}>
          {minPlan.toUpperCase()} REQUIS
        </div>
        <div style={{ fontSize: 10, color: 'rgba(245,240,232,0.5)' }}>
          Cliquer pour voir les plans
        </div>
      </div>
    </div>
  );
}
