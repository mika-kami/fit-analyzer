/**
 * ChatTab.jsx — AI coach chat interface.
 * OpenAI GPT-4o mini (with key) → Anthropic Claude (free fallback).
 * Context includes current workout + last 10 from history.
 * Props: { chat }  (from useOpenAI hook)
 */
import { useState, useEffect, useRef } from 'react';
import { Card, CardLabel }             from './OverviewTab.jsx';

const SUGGESTIONS = [
  'Нужен ли отдых завтра?',
  'Как улучшить среднюю скорость?',
  'Оцени мою форму',
  'Составь план на следующую неделю',
  'Почему так много времени в Z5?',
  'Что есть после тренировки?',
];


export function ApiKeyGate({ onSubmit, onSkip }) {
  const [key, setKey] = useState('');
  const valid = key.startsWith('sk-') && key.length > 20;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      <div style={{
        background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-md)', padding: 'var(--sp-4)',
        fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
      }}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 6 }}>
          ИИ-тренер
        </div>
        Используйте встроенный ИИ бесплатно или подключите OpenAI для GPT-4o mini.
      </div>
      <button
        onClick={onSkip}
        style={{
          background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)',
          borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)',
          color: '#4ade80', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'var(--font-body)', transition: `all var(--t-base) var(--ease-snappy)`,
        }}
      >
        ✓ Использовать встроенный ИИ (бесплатно)
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', color: 'var(--text-dim)', fontSize: 11 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        или с OpenAI ключом
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      </div>
      <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        <input
          type="password"
          value={key}
          onChange={e => setKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && valid && onSubmit(key)}
          placeholder="sk-…"
          style={{
            flex: 1, background: 'var(--bg-raised)',
            border: '1px solid var(--border-mid)',
            borderRadius: 'var(--r-md)',
            padding: 'var(--sp-3) var(--sp-4)',
            color: 'var(--text-primary)', fontSize: 13, outline: 'none',
            fontFamily: 'var(--font-mono)',
          }}
        />
        <button
          onClick={() => valid && onSubmit(key)}
          style={{
            background:   valid ? 'rgba(96,165,250,0.2)' : 'var(--bg-raised)',
            border:       `1px solid ${valid ? '#60a5fa' : 'var(--border-mid)'}`,
            borderRadius: 'var(--r-md)',
            padding:      'var(--sp-3) var(--sp-5)',
            color:        valid ? '#60a5fa' : 'var(--text-muted)',
            cursor:       valid ? 'pointer' : 'not-allowed',
            fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)',
            transition: `all var(--t-base) var(--ease-snappy)`,
          }}
        >
          GPT
        </button>
      </div>
      {key && !valid && (
        <span style={{ fontSize: 11, color: '#ef4444', fontFamily: 'var(--font-mono)' }}>
          Ключ должен начинаться с "sk-" и быть длиннее 20 символов
        </span>
      )}
    </div>
  );
}

export function ChatBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: '84%',
        padding:  'var(--sp-3) var(--sp-4)',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        background:   isUser ? 'rgba(96,165,250,0.12)' : 'var(--bg-raised)',
        border:       `1px solid ${isUser ? 'rgba(96,165,250,0.25)' : 'var(--border-subtle)'}`,
        fontSize:  13, lineHeight: 1.6, color: 'var(--text-primary)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {!isUser && (
          <div style={{
            fontSize: 9, color: 'var(--accent)', fontFamily: 'var(--font-mono)',
            letterSpacing: '0.12em', marginBottom: 4,
          }}>
            ◈ GPT ТРЕНЕР
          </div>
        )}
        {msg.content || (msg.streaming ? '' : '—')}
      </div>
    </div>
  );
}

export function ChatTab({ chat }) {
  const { messages, isStreaming, isKeySet, provider, setApiKey, useAnthropicFallback, clearKey, send } = chat;
  const [input, setInput] = useState('');
  const bottomRef = useRef();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    send(input.trim());
    setInput('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      <div style={{
        background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-lg)', padding: 'var(--sp-5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>ИИ-тренер</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {provider === 'openai' ? 'OpenAI GPT-4o mini' : 'Claude (встроенный)'} · знает тренировку
            </div>
          </div>
          {isKeySet && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ fontSize: 10, color: '#4ade80', fontFamily: 'var(--font-mono)' }}>● {provider}</div>
              <button
                onClick={clearKey}
                style={{
                  background: 'none', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--r-sm)', padding: '3px 10px',
                  color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                }}
              >
                сменить
              </button>
            </div>
          )}
        </div>

        {!isKeySet ? (
          <ApiKeyGate onSubmit={setApiKey} onSkip={useAnthropicFallback} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            {/* Message list */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 10,
              maxHeight: 360, overflowY: 'auto', paddingRight: 4,
            }}>
              {messages.map((m, i) => <ChatBubble key={i} msg={m} />)}
              {isStreaming && (
                <div style={{ display: 'flex', gap: 4, padding: '8px 12px' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: 'var(--accent)',
                      animation: 'pulse 1.4s ease infinite',
                      animationDelay: `${i * 0.18}s`,
                    }} />
                  ))}
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Suggestions */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  style={{
                    background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)',
                    borderRadius: 20, padding: '4px 12px',
                    color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    transition: `all var(--t-fast) var(--ease-snappy)`,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Input */}
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Спросите о тренировке…"
                disabled={isStreaming}
                style={{
                  flex: 1, background: 'var(--bg-raised)',
                  border: '1px solid var(--border-mid)',
                  borderRadius: 'var(--r-md)',
                  padding: 'var(--sp-3) var(--sp-4)',
                  color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                  fontFamily: 'var(--font-body)',
                }}
              />
              <button
                onClick={handleSend}
                disabled={isStreaming || !input.trim()}
                style={{
                  background:   isStreaming ? 'var(--bg-raised)' : 'rgba(96,165,250,0.15)',
                  border:       `1px solid ${isStreaming ? 'var(--border-mid)' : 'var(--info)'}`,
                  borderRadius: 'var(--r-md)',
                  padding:      'var(--sp-3) var(--sp-5)',
                  color:        isStreaming ? 'var(--text-muted)' : 'var(--info)',
                  cursor:       isStreaming ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 600,
                  transition: `all var(--t-base) var(--ease-snappy)`,
                }}
              >
                {isStreaming ? '…' : '→'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
