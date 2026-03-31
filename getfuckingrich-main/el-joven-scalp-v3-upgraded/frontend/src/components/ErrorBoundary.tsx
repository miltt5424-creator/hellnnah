import React from 'react';

interface State { hasError: boolean; error: string }

export default class ErrorBoundary extends React.Component<{children: React.ReactNode}, State> {
  state: State = { hasError: false, error: '' };
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message + '\n' + error.stack };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, background: '#0a0806', minHeight: '100vh', color: '#ef4444', fontFamily: 'Space Mono, monospace' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>💥 CRASH DÉTECTÉ</div>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', background: 'rgba(255,0,0,0.1)', padding: 16, borderRadius: 8, border: '1px solid rgba(255,0,0,0.3)' }}>
            {this.state.error}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '10px 20px', background: '#d4af37', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
            RECHARGER
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
