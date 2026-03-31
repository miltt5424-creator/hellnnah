export type AlertType = 'price_above' | 'price_below' | 'signal_buy' | 'signal_sell';
export type ToastType = 'info' | 'success' | 'warning' | 'error' | 'buy' | 'sell';

export interface Alert {
  id: string;
  symbol: string;
  condition?: string;
  value?: number;
  active: boolean;
  triggered?: boolean;
  type?: AlertType;
  threshold?: number;
  createdAt?: number;
}

export interface AlertState {
  alerts: Alert[];
  soundEnabled: boolean;
  addAlert: (alert: Alert) => void;
  removeAlert: (id: string) => void;
  toggleAlert: (id: string) => void;
  triggerAlert: (id: string) => void;
  setSoundEnabled: (v: boolean) => void;
  toggleSound: () => void;
}
