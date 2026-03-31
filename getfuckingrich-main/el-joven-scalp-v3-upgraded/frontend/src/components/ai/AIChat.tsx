import React, { useState, useRef, useEffect } from 'react';
import { useSignalStore } from '../../store/signalStore';
import { useMarketStore } from '../../store/marketStore';
import type { AIEngine } from '../../types/signal';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  ai?: string;
}

const AI_LABELS: Record<string, { icon: string; label: string }> = {
  auto:       { icon: '🤖', label: 'AUTO'       },
  gemini:     { icon: '♊', label: 'GEMINI'     },
  grok:       { icon: '𝕏', label: 'GROK'       },
  mistral:    { icon: '🌬️', label: 'MISTRAL'    },
  openrouter: { icon: '🔀', label: 'OPENROUTER' },
};

const QUICK = ['Quelle est la tendance ?', 'Meilleur setup maintenant ?', 'Où est le support clé ?', 'Risque à gérer ?'];

export default function AIChat() {
  const [messages, setMessages]  = useState<Message[]>([]);
  const [input, setInput]        = useState('');
  const [loading, setLoading]    = useState(false);
  const bottomRef                = useRef<HTMLDivElement>(null);
  const selectedAI               = useSignalStore((s) => s.selectedAI);
  const setAI                    = useSignalStore((s) => s.setSelectedAI);
  const symbol                   = useMarketStore((s) => s.symbol);
  const prices                   = useMarketStore((s) => s.prices);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: input.trim(), ts: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          context: { symbol, price: prices[symbol]?.price },
          ai: selectedAI,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages((m) => [...m, { role: 'assistant', content: data.message.content, ts: Date.now(), ai: data.message.ai }]);
      } else throw new Error(data.error || 'Erreur API');
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: `⚠️ ${err instanceof Error ? err.message : 'Erreur'}`, ts: Date.now() }]);
    } finally { setLoading(false); }
  };

  const currentAI = AI_LABELS[selectedAI] || AI_LABELS.auto;

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-header">
        <span className="panel-title">🤖 CHAT IA</span>
        {/* Mini sélecteur de moteur */}
        <div style={{ display: 'flex', gap: 2 }}>
          {(Object.keys(AI_LABELS) as AIEngine[]).map((key) => (
            <button
              key={key}
              onClick={() => setAI(key)}
              title={key}
              style={{
                fontSize: 11,
                padding: '1px 5px',
                borderRadius: 'var(--r-sm)',
                border: `1px solid ${selectedAI === key ? 'var(--gold)' : 'transparent'}`,
                background: selectedAI === key ? 'rgba(255,215,0,0.1)' : 'transparent',
                cursor: 'pointer',
                color: selectedAI === key ? 'var(--gold)' : 'var(--text-muted)',
              }}
            >
              {AI_LABELS[key].icon}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: 'center', padding: 10 }}>
            <div style={{ marginBottom: 8 }}>
              {currentAI.icon} {currentAI.label} — pose ta question
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
              {QUICK.map((q) => (
                <button key={q} className="btn btn-ghost" style={{ fontSize: 9, padding: '2px 7px' }}
                  onClick={() => setInput(q)}>{q}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            animation: 'fadeIn 0.15s ease',
          }}>
            <div style={{
              maxWidth: '85%', padding: '7px 10px',
              borderRadius: msg.role === 'user'
                ? 'var(--r-md) var(--r-md) 2px var(--r-md)'
                : 'var(--r-md) var(--r-md) var(--r-md) 2px',
              background: msg.role === 'user' ? 'rgba(255,215,0,0.1)' : 'var(--bg-card)',
              border: `1px solid ${msg.role === 'user' ? 'var(--gold-border)' : 'var(--border)'}`,
              fontSize: 11, lineHeight: 1.5, color: 'var(--text-primary)', whiteSpace: 'pre-wrap',
            }}>
              {msg.content}
              {msg.ai && (
                <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 3 }}>
                  {AI_LABELS[msg.ai]?.icon} {msg.ai}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 4, padding: '2px 0' }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{
                width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)',
                animation: `pulse 1s ease ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '7px 10px', display: 'flex', gap: 6 }}>
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={`Message ${currentAI.label}...`}
          style={{ flex: 1, fontSize: 11 }}
          disabled={loading}
        />
        <button
          className="btn btn-gold"
          onClick={send}
          disabled={loading || !input.trim()}
          style={{ padding: '7px 11px', fontSize: 12 }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
