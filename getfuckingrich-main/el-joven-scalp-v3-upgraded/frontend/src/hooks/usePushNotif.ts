import { useCallback, useEffect, useState } from 'react';

export function usePushNotif() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    setSupported('Notification' in window && 'serviceWorker' in navigator);
    if ('Notification' in window) setPermission(Notification.permission);
  }, []);

  const requestPermission = useCallback(async () => {
    if (!supported) return false;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result === 'granted';
  }, [supported]);

  const notify = useCallback((title: string, body: string, icon = '/favicon.svg') => {
    if (permission !== 'granted') return;
    try {
      new Notification(title, { body, icon });
    } catch { /* ignore */ }
  }, [permission]);

  return { supported, permission, requestPermission, notify };
}
