export function Sparkline({ tl }) {
  if (!(tl && tl.length > 1)) return null;
  const w = 380,
    h = 60,
    pad = 4;
  const max = Math.max(...tl.map((d) => d.count), 1);
  const step = tl.length > 1 ? (w - pad * 2) / (tl.length - 1) : 0;
  const pts = tl.map((d, i) => [pad + i * step, h - pad - (d.count / max) * (h - pad * 2)]);
  const line = pts.map((p) => p.join(',')).join(' ');
  const area = `${pad},${h - pad} ${line} ${pad + (tl.length - 1) * step},${h - pad}`;
  const bandW = Math.max(step, 2);

  return (
    <>
      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ display: 'block', cursor: 'crosshair' }}
      >
        <polygon points={area} fill="rgba(78,201,176,.12)" />
        <polyline points={line} fill="none" stroke="var(--teal)" strokeWidth="1.5" />
        {tl.map((d, i) => (
          <rect
            key={d.date}
            x={(pts[i][0] - bandW / 2).toFixed(1)}
            y="0"
            width={bandW.toFixed(1)}
            height={h}
            fill="transparent"
            data-g={`${d.date} — ${d.count} prompt${d.count === 1 ? '' : 's'}`}
          />
        ))}
      </svg>
      <div className="sub">
        {tl[0].date} → {tl[tl.length - 1].date} · {tl.length} active days
      </div>
    </>
  );
}

export function HourlyChart({ hours }) {
  if (!(hours && hours.some((h) => h.count))) return null;
  const max = Math.max(...hours.map((h) => h.count), 1);
  const pad2 = (x) => String(x).padStart(2, '0');
  return (
    <>
      <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end' }}>
        {hours.map((h) => {
          const pct = (h.count / max) * 100;
          const c = h.count ? 'var(--teal)' : '#20242c';
          return (
            <div
              key={h.hour}
              data-g={`${pad2(h.hour)}:00–${pad2(h.hour)}:59 — ${h.count} prompt${h.count === 1 ? '' : 's'}`}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                alignItems: 'center',
                height: '56px',
                cursor: 'default',
              }}
            >
              <div
                style={{
                  width: '70%',
                  height: `${Math.max(pct, 3)}%`,
                  background: c,
                  borderRadius: '2px 2px 0 0',
                }}
              ></div>
            </div>
          );
        })}
      </div>
      <div className="sub" style={{ display: 'flex', marginTop: '4px' }}>
        {[0, 6, 12, 18, 23].map((hn) => (
          <span key={hn} style={{ flex: 1, textAlign: 'center' }}>
            {hn}
          </span>
        ))}
      </div>
    </>
  );
}
