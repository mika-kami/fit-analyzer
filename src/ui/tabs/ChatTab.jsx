/**
 * ChatTab.jsx — AI coach chat interface.
 * Props: { chat }  (from useOpenAI hook)
 */
import { useState, useEffect, useRef } from 'react';

const SUGGESTIONS = [
  'Нужен ли отдых завтра?',
  'Как улучшить среднюю скорость?',
  'Оцени мою форму',
  'Составь план на следующую неделю',
  'Почему так много времени в Z5?',
  'Что есть после тренировки?',
];

/** Lightweight markdown → React elements (bold, italic, code, lists, headings). */
function renderMarkdown(text) {
  if (!text) return '—';
  const lines = text.split('\n');
  const elements = [];
  let listItems = [];
  let listOrdered = false;

  const flushList = () => {
    if (!listItems.length) return;
    const Tag = listOrdered ? 'ol' : 'ul';
    elements.push(
      <Tag key={`list-${elements.length}`} style={{
        margin: '4px 0', paddingLeft: 20, fontSize: 13, lineHeight: 1.7,
        color: 'var(--text-primary)',
      }}>
        {listItems.map((li, i) => <li key={i}>{inlineFormat(li)}</li>)}
      </Tag>
    );
    listItems = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headings
    const hMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (hMatch) {
      flushList();
      const level = hMatch[1].length;
      const sizes = { 1: 15, 2: 14, 3: 13 };
      elements.push(
        <div key={i} style={{
          fontSize: sizes[level], fontWeight: 700, color: 'var(--accent)',
          margin: '6px 0 2px',
        }}>
          {inlineFormat(hMatch[2])}
        </div>
      );
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[\s]*[-*]\s+(.+)/);
    if (ulMatch) {
      if (listItems.length && listOrdered) flushList();
      listOrdered = false;
      listItems.push(ulMatch[1]);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^[\s]*\d+[.)]\s+(.+)/);
    if (olMatch) {
      if (listItems.length && !listOrdered) flushList();
      listOrdered = true;
      listItems.push(olMatch[1]);
      continue;
    }

    flushList();

    // Empty line → spacer
    if (!line.trim()) {
      elements.push(<div key={i} style={{ height: 6 }} />);
      continue;
    }

    // Regular paragraph
    elements.push(
      <div key={i} style={{ margin: 0, lineHeight: 1.7 }}>
        {inlineFormat(line)}
      </div>
    );
  }
  flushList();
  return elements;
}

/** Inline formatting: **bold**, *italic*, `code` */
function inlineFormat(text) {
  const parts = [];
  // Split by inline patterns: **bold**, *italic*, `code`
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let last = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={key++} style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={key++} style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>{match[3]}</em>);
    } else if (match[4]) {
      parts.push(
        <code key={key++} style={{
          background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
          borderRadius: 3, padding: '1px 5px', fontSize: 12,
          fontFamily: 'var(--font-mono)', color: 'var(--accent)',
        }}>{match[4]}</code>
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

function ChatBubble({ msg }) {
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
        wordBreak: 'break-word',
      }}>
        {!isUser && (
          <div style={{
            fontSize: 9, color: 'var(--accent)', fontFamily: 'var(--font-mono)',
            letterSpacing: '0.12em', marginBottom: 4,
          }}>
            GPT ТРЕНЕР
          </div>
        )}
        {isUser ? msg.content || '—' : renderMarkdown(msg.content)}
      </div>
    </div>
  );
}

export function ChatTab({ chat }) {
  const { messages, isStreaming, hasKey, send } = chat;
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
              GPT-4o mini {hasKey ? '' : '· ключ не настроен'}
            </div>
          </div>
          {hasKey && (
            <div style={{ fontSize: 10, color: '#4ade80', fontFamily: 'var(--font-mono)' }}>● openai</div>
          )}
        </div>

        {!hasKey ? (
          <div style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 'var(--r-md)', padding: 'var(--sp-4)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', marginBottom: 6 }}>
              OpenAI API ключ не настроен
            </div>
            <div style={{
              background: 'var(--bg-raised)', borderRadius: 'var(--r-sm)',
              padding: 'var(--sp-3)', fontFamily: 'var(--font-mono)',
              fontSize: 11, color: '#a3e635', lineHeight: 2,
            }}>
              <div style={{ color: 'var(--text-muted)' }}># Добавь в .env файл:</div>
              <div>VITE_OPENAI_API_KEY=sk-...</div>
            </div>
          </div>
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
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => { send(s); }}
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
            )}

            {/* Input */}
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Спросите о тренировке..."
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
                {isStreaming ? '...' : '->'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
