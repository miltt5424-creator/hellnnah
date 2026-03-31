import { create } from 'zustand';
import type { AlertState, Alert } from '../types/alert';

export const useAlertStore = create<AlertState>((set) => ({
  alerts: [],
  soundEnabled: true,
  addAlert: (alert: Alert) => set((state) => ({ alerts: [alert, ...state.alerts] })),
  removeAlert: (id: string) => set((state) => ({ alerts: state.alerts.filter((a) => a.id !== id) })),
  toggleAlert: (id: string) => set((state) => ({ alerts: state.alerts.map((a) => a.id === id ? { ...a, active: !a.active } : a) })),
  triggerAlert: (id: string) => set((state) => ({ alerts: state.alerts.map((a) => a.id === id ? { ...a, triggered: true } : a) })),
  setSoundEnabled: (v: boolean) => set({ soundEnabled: v }),
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
}));
