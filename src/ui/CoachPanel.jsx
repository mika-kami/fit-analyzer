import { useEffect, useRef, useState } from 'react';

export function CoachPanel({ open, onToggle, chat, contextLabel, actionButtons = [] }) {
  const { messages, isStreaming, hasKey, send } = chat;
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    send(input.trim());
    setInput('');
  };

  return (
    <>
      <button onClick={onToggle} style={floatingBtnStyle(open)}>💬</button>
      <div style={panelStyle(open)}>
        <div style={headerStyle}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Coach</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {contextLabel || 'Global conversation'}
            </div>
          </div>
          <button onClick={onToggle} style={closeBtnStyle}>{open ? '×' : '↗'}</button>
        </div>

        {actionButtons.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 'var(--sp-2) var(--sp-3)', borderBottom: '1px solid var(--border-subtle)' }}>
            {actionButtons.map((a) => (
              <button key={a.id} onClick={a.onClick} style={chipStyle}>{a.label}</button>
            ))}
          </div>
        )}

        {!hasKey ? (
          <div style={{ padding: 'var(--sp-4)', fontSize: 12, color: '#ef4444' }}>OpenAI API key not configured.</div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                    background: m.role === 'user' ? 'rgba(96,165,250,0.16)' : 'var(--bg-raised)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 10,
                    padding: '8px 10px',
                    fontSize: 12,
                    lineHeight: 1.55,
                    color: 'var(--text-primary)',
                  }}
                >
                  {m.content}
                </div>
              ))}
              {isStreaming && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Coach is typing...</div>}
              <div ref={bottomRef} />
            </div>
            <div style={{ padding: 'var(--sp-3)', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8 }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask coach..."
                style={inputStyle}
              />
              <button onClick={handleSend} style={sendStyle}>Send</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function floatingBtnStyle(open) {
  return {
    position: 'fixed',
    right: 16,
    bottom: 16,
    zIndex: 300,
    width: 48,
    height: 48,
    borderRadius: '50%',
    border: '1px solid rgba(232,168,50,0.45)',
    background: open ? 'rgba(232,168,50,0.18)' : 'rgba(232,168,50,0.12)',
    color: 'var(--accent)',
    fontSize: 18,
    cursor: 'pointer',
  };
}

function panelStyle(open) {
  return {
    position: 'fixed',
    top: 0,
    right: 0,
    width: 'min(420px, 94vw)',
    height: '100vh',
    background: 'var(--bg-surface)',
    borderLeft: '1px solid var(--border-subtle)',
    zIndex: 250,
    transform: open ? 'translateX(0)' : 'translateX(105%)',
    transition: 'transform 200ms ease',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 0 40px rgba(0,0,0,0.35)',
  };
}

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--sp-3)',
  borderBottom: '1px solid var(--border-subtle)',
};

const closeBtnStyle = {
  background: 'var(--bg-overlay)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--text-secondary)',
  width: 26,
  height: 26,
  cursor: 'pointer',
};

const chipStyle = {
  background: 'var(--bg-overlay)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 16,
  padding: '2px 8px',
  fontSize: 10,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
};

const inputStyle = {
  flex: 1,
  background: 'var(--bg-raised)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--text-primary)',
  padding: '8px 10px',
  fontSize: 12,
};

const sendStyle = {
  background: 'rgba(232,168,50,0.14)',
  border: '1px solid rgba(232,168,50,0.35)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--accent)',
  padding: '8px 10px',
  fontSize: 12,
  cursor: 'pointer',
};
