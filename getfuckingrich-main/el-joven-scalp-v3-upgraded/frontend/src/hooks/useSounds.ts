import { useCallback, useRef } from 'react';
import { useAlertStore } from '../store/alertStore';

function createBeep(freq: number, duration: number, type: OscillatorType = 'sine'): () => void {
  return () => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch { /* AudioContext not available */ }
  };
}

export function useSounds() {
  const soundEnabled = useAlertStore((s) => s.soundEnabled);
  const buyBeep  = useRef(createBeep(880, 0.15, 'square'));
  const sellBeep = useRef(createBeep(440, 0.15, 'sawtooth'));

  const playBuy = useCallback(() => {
    if (soundEnabled) buyBeep.current();
  }, [soundEnabled]);

  const playSell = useCallback(() => {
    if (soundEnabled) sellBeep.current();
  }, [soundEnabled]);

  return { playBuy, playSell };
}
