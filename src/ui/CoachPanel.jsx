import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

export function CoachPanel({ open, onToggle, chat, contextLabel, actionButtons = [] }) {
  const { messages, isStreaming, hasKey, send, webSearch, toggleWebSearch } = chat;
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
                  {m.role === 'assistant' ? (
                    <ReactMarkdown components={mdComponents}>{m.content}</ReactMarkdown>
                  ) : m.content}
                </div>
              ))}
              {isStreaming && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Coach is typing...</div>}
              <div ref={bottomRef} />
            </div>
            <div style={{ padding: '6px var(--sp-3) 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={toggleWebSearch}
                title={webSearch ? 'Web search ON — click to disable' : 'Web search OFF — click to enable'}
                style={{
                  background: webSearch ? 'rgba(96,165,250,0.15)' : 'var(--bg-overlay)',
                  border: `1px solid ${webSearch ? 'rgba(96,165,250,0.5)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--r-sm)', padding: '3px 8px',
                  fontSize: 10, color: webSearch ? '#60a5fa' : 'var(--text-muted)',
                  cursor: 'pointer', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
                }}
              >
                🌐 {webSearch ? 'Web ON' : 'Web OFF'}
              </button>
              {webSearch && <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>uses gpt-4o + live search</span>}
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
    display: open ? 'none' : 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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

const mdComponents = {
  p: ({ children }) => <p style={{ margin: '0 0 6px', lineHeight: 1.55 }}>{children}</p>,
  ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ol>,
  li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
  strong: ({ children }) => <strong style={{ color: 'var(--accent)', fontWeight: 600 }}>{children}</strong>,
  em: ({ children }) => <em style={{ color: 'var(--text-secondary)' }}>{children}</em>,
  code: ({ inline, children }) =>
    inline ? (
      <code style={{ background: 'var(--bg-overlay)', borderRadius: 3, padding: '1px 4px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{children}</code>
    ) : (
      <pre style={{ background: 'var(--bg-overlay)', borderRadius: 6, padding: '8px 10px', overflowX: 'auto', margin: '6px 0' }}>
        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{children}</code>
      </pre>
    ),
  h1: ({ children }) => <h1 style={{ fontSize: 14, fontWeight: 700, margin: '8px 0 4px', color: 'var(--text-primary)' }}>{children}</h1>,
  h2: ({ children }) => <h2 style={{ fontSize: 13, fontWeight: 700, margin: '8px 0 4px', color: 'var(--text-primary)' }}>{children}</h2>,
  h3: ({ children }) => <h3 style={{ fontSize: 12, fontWeight: 600, margin: '6px 0 3px', color: 'var(--text-secondary)' }}>{children}</h3>,
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '8px 0' }} />,
  blockquote: ({ children }) => (
    <blockquote style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 10, margin: '6px 0', color: 'var(--text-secondary)' }}>{children}</blockquote>
  ),
};
