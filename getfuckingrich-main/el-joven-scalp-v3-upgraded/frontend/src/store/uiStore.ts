import { create } from 'zustand';
import type { ToastType } from '../types/alert';

export type Page = 'dashboard' | 'journal' | 'pricing' | 'profile';

export interface Toast {
  id: string;
  message: string;
  type?: ToastType;
}

interface UIState {
  page: Page;
  setPage: (page: Page) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  activeToasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  page: 'dashboard',
  setPage: (page) => set({ page }),
  sidebarOpen: true,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  activeToasts: [],
  addToast: (message, type) => set((state) => ({
    activeToasts: [...state.activeToasts, { id: Date.now().toString(), message, type }]
  })),
  removeToast: (id) => set((state) => ({ activeToasts: state.activeToasts.filter((t) => t.id !== id) })),
}));
