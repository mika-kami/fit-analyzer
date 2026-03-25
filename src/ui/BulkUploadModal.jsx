/**
 * BulkUploadModal.jsx — Sequential bulk FIT file upload with per-file progress.
 * Props: { files, uploadFit, onDone }
 */
import { useState, useEffect, useRef } from 'react';

const STATUS_ICON = {
  pending:    { icon: '○', color: 'var(--text-dim)' },
  processing: { icon: '⟳', color: 'var(--accent)', spin: true },
  done:       { icon: '✓', color: '#4ade80' },
  duplicate:  { icon: '=', color: 'var(--text-muted)' },
  error:      { icon: '✗', color: '#ef4444' },
};

export function BulkUploadModal({ files, uploadFit, onDone }) {
  const [results, setResults] = useState(() =>
    files.map(f => ({ name: f.name, status: 'pending', error: null }))
  );
  const cancelRef = useRef(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      for (let i = 0; i < files.length; i++) {
        if (cancelRef.current) break;

        setResults(prev => prev.map((r, j) =>
          j === i ? { ...r, status: 'processing' } : r
        ));

        try {
          await uploadFit(files[i]);
          setResults(prev => prev.map((r, j) =>
            j === i ? { ...r, status: 'done' } : r
          ));
        } catch (e) {
          const msg = e.message ?? String(e);
          const isDup = /duplicate|unique|already/i.test(msg);
          setResults(prev => prev.map((r, j) =>
            j === i ? {
              ...r,
              status: isDup ? 'duplicate' : 'error',
              error: isDup ? 'Уже загружена' : msg,
            } : r
          ));
        }
      }

      setTimeout(() => onDone(), 1200);
    })();
  }, []);

  const handleCancel = () => {
    cancelRef.current = true;
    onDone();
  };

  const doneCount = results.filter(r => r.status === 'done' || r.status === 'duplicate').length;
  const total = results.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const currentIdx = results.findIndex(r => r.status === 'processing');

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 480, width: '90%',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--r-lg)',
          padding: 'var(--sp-6)',
        }}
      >
        {/* Title */}
        <div style={{
          fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
          marginBottom: 'var(--sp-4)',
        }}>
          Загрузка тренировок ({doneCount} из {total})
        </div>

        {/* Progress bar */}
        <div style={{
          height: 6, borderRadius: 3,
          background: 'var(--bg-overlay)',
          marginBottom: 'var(--sp-4)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: 3,
            background: 'var(--accent)',
            width: `${pct}%`,
            transition: 'width 0.3s ease',
          }} />
        </div>

        {/* File list */}
        <div style={{
          maxHeight: 280, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 4,
          marginBottom: 'var(--sp-5)',
        }}>
          {results.map((r, i) => {
            const cfg = STATUS_ICON[r.status];
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 0',
                opacity: r.status === 'pending' ? 0.5 : 1,
              }}>
                <span style={{
                  color: cfg.color,
                  fontSize: 14,
                  fontWeight: 600,
                  width: 18, textAlign: 'center', flexShrink: 0,
                  ...(cfg.spin ? { display: 'inline-block', animation: 'spin 0.8s linear infinite' } : {}),
                }}>
                  {cfg.icon}
                </span>
                <span style={{
                  fontSize: 12, fontFamily: 'var(--font-mono)',
                  color: r.status === 'error' ? '#ef4444' : 'var(--text-secondary)',
                  fontStyle: r.status === 'duplicate' ? 'italic' : 'normal',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  flex: 1,
                }}>
                  {r.name}
                </span>
                {r.status === 'duplicate' && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', flexShrink: 0 }}>
                    (уже есть)
                  </span>
                )}
                {r.status === 'error' && r.error && (
                  <span style={{ fontSize: 10, color: '#ef4444', flexShrink: 0, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.error.slice(0, 40)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Cancel button — only show while processing */}
        {currentIdx >= 0 && (
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={handleCancel}
              style={{
                background: 'none',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-md)',
                padding: 'var(--sp-2) var(--sp-4)',
                color: 'var(--text-muted)',
                fontSize: 12, cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}
            >
              Отмена
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
