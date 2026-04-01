import { useState, useCallback, useRef } from 'react';

/**
 * Upload.jsx
 * Entry screen: drag-and-drop or click-to-select FIT file.
 * Visually: dark field, amber accent, grid-line texture.
 */


const SUPPORTED = '.fit — Garmin · Wahoo · Polar · Suunto · Hammerhead';

export function UploadScreen({ onFile, onSample, onGarmin, isLoading, error }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef();

  const handleFile = useCallback((file) => {
    if (file) onFile(file);
  }, [onFile]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDrag(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const onDragOver = useCallback((e) => { e.preventDefault(); setDrag(true); }, []);
  const onDragLeave = useCallback(() => setDrag(false), []);

  return (
    <div style={{
      minHeight:      '100vh',
      background:     'var(--bg-base)',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      padding:        'var(--sp-8)',
      fontFamily:     'var(--font-body)',
      position:       'relative',
      overflow:       'hidden',
    }}>
      {/* Subtle grid background */}
      <div style={{
        position:   'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(var(--border-subtle) 1px, transparent 1px),
          linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
        maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)',
      }} />

      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 600, height: 300, borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(232,168,50,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', width: '100%', maxWidth: 480, textAlign: 'center' }}>
        {/* Wordmark */}
        <div style={{
          fontSize: 10, color: 'var(--accent)', letterSpacing: '0.2em',
          textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
          marginBottom: 'var(--sp-4)',
        }}>
          ◈ FIT ANALYZER
        </div>

        <h1 style={{
          fontSize: 34, fontWeight: 600, color: 'var(--text-primary)',
          fontFamily: 'var(--font-display)', margin: '0 0 var(--sp-3)',
          letterSpacing: '-0.03em', lineHeight: 1.15,
        }}>
          Аналof тренировки
        </h1>

        <p style={{
          color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 var(--sp-8)',
          fontFamily: 'var(--font-body)', lineHeight: 1.6,
        }}>
          Загрузите FIT-файл для детального аналofа пульса,<br />зон нагрузки и рекоmендаций тренера
        </p>

        {/* Drop zone */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !isLoading && inputRef.current.click()}
          style={{
            width:        '100%',
            height:       200,
            border:       `1.5px dashed ${drag ? 'var(--accent)' : 'var(--border-mid)'}`,
            borderRadius: 'var(--r-xl)',
            display:      'flex',
            flexDirection:'column',
            alignItems:   'center',
            justifyContent:'center',
            gap:           'var(--sp-3)',
            cursor:        isLoading ? 'wait' : 'pointer',
            background:    drag
              ? 'rgba(232,168,50,0.05)'
              : 'var(--bg-overlay)',
            transition:    `all var(--t-base) var(--ease-snappy)`,
            marginBottom:  'var(--sp-4)',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".fit"
            style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])}
          />

          {isLoading ? (
            <>
              <Spinner />
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                Parsing FIT file...
              </span>
            </>
          ) : (
            <>
              <div style={{ fontSize: 36, lineHeight: 1, filter: drag ? 'none' : 'grayscale(0.5)' }}>
                📂
              </div>
              <div style={{
                color:      drag ? 'var(--accent)' : 'var(--text-primary)',
                fontSize:   15, fontWeight: 600,
              }}>
                {drag ? 'Drop the file' : 'Drag a FIT file'}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                or нажmите для выбора
              </div>
              <div style={{
                color: 'var(--text-dim)', fontSize: 10,
                fontFamily: 'var(--font-mono)', letterSpacing: '0.05em',
              }}>
                {SUPPORTED}
              </div>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background:    'rgba(239,68,68,0.08)',
            border:        '1px solid rgba(239,68,68,0.25)',
            borderRadius:  'var(--r-md)',
            padding:       'var(--sp-3) var(--sp-4)',
            color:         '#f87171',
            fontSize:      12,
            fontFamily:    'var(--font-mono)',
            marginBottom:  'var(--sp-4)',
            textAlign:     'left',
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Divider */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
          color: 'var(--text-dim)', fontSize: 11, marginBottom: 'var(--sp-4)',
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          or
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        </div>

        {/* Garmin Connect button */}
        {onGarmin && (
          <button
            onClick={onGarmin}
            style={{
              width: '100%', marginBottom: 'var(--sp-3)',
              background: 'rgba(232,168,50,0.08)',
              border: '1px solid rgba(232,168,50,0.30)',
              borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-5)',
              color: 'var(--accent)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font-body)',
              transition: 'all var(--t-base) var(--ease-snappy)',
            }}
          >
            ⊕ Connect Garmin Connect
          </button>
        )}

        {/* Sample button */}
        <button
          onClick={onSample}
          disabled={isLoading}
          style={{
            width:         '100%',
            background:    'var(--bg-overlay)',
            border:        '1px solid var(--border-subtle)',
            borderRadius:  'var(--r-md)',
            padding:       'var(--sp-3) var(--sp-5)',
            color:         'var(--text-secondary)',
            fontSize:      13,
            cursor:        isLoading ? 'not-allowed' : 'pointer',
            fontFamily:    'var(--font-body)',
            transition:    `all var(--t-base) var(--ease-snappy)`,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          Open sample - 50 km, road cycling, 7 сент 2025
        </button>
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div style={{
      width: 28, height: 28,
      border: '2px solid var(--border-mid)',
      borderTopColor: 'var(--accent)',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
  );
}


// ────────────────────────────────────────────────────────────


