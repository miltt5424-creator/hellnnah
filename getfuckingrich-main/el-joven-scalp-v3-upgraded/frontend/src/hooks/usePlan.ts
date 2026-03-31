import { useState, useEffect } from 'react';

export type Plan = 'free' | 'pro' | 'elite' | 'admin';
export const PLAN_LEVEL: Record<Plan, number> = { free: 0, pro: 1, elite: 2, admin: 99 };

const LAUNCH_DATE = new Date('2026-03-08T00:00:00Z');
const PROMO_DAYS  = 15;

let _plan:      Plan    = 'free';
let _createdAt: string  = '';
let _loaded:    boolean = false;
const _listeners = new Set<(p: Plan) => void>();

export function setPlanGlobal(plan: Plan, createdAt?: string) {
  _plan = plan;
  if (createdAt) _createdAt = createdAt;
  _loaded = true;
  _listeners.forEach(fn => fn(plan));
}

export function getPlan(): Plan { return _plan; }

export function isInPromo(): boolean {
  if (!_createdAt) return false;
  const registered = new Date(_createdAt);
  const promoEnd   = new Date(LAUNCH_DATE.getTime() + PROMO_DAYS * 86400000);
  const now        = new Date();
  return registered <= promoEnd && now <= promoEnd;
}

export function promoDaysLeft(): number {
  const promoEnd = new Date(LAUNCH_DATE.getTime() + PROMO_DAYS * 86400000);
  const diff     = promoEnd.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

async function loadPlan() {
  if (_loaded) return;
  try {
    const r = await fetch('/api/auth/check', { credentials: 'include' });
    const d = await r.json();
    if (d.authenticated && d.plan) {
      setPlanGlobal(d.plan as Plan, d.created_at);
    } else {
      _loaded = true;
    }
  } catch {
    _loaded = true;
  }
}

export function usePlan() {
  const [plan, setPlan] = useState<Plan>(_plan);

  useEffect(() => {
    _listeners.add(setPlan);
    loadPlan();
    return () => { _listeners.delete(setPlan); };
  }, []);

  const promo = isInPromo();

  return {
    plan,
    canAccess: (min: Plan) => {
      if (PLAN_LEVEL[plan] >= PLAN_LEVEL[min]) return true;
      if (promo && min !== 'elite') return true;
      return false;
    },
    isPro:         PLAN_LEVEL[plan] >= 1 || promo,
    isElite:       PLAN_LEVEL[plan] >= 2,
    isAdmin:       plan === 'admin',
    isInPromo:     promo,
    promoDaysLeft: promoDaysLeft(),
    loaded:        _loaded,
  };
}

export function resetPlanFetch() {
  _plan    = 'free';
  _loaded  = false;
}
