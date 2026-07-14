// Self-contained HTML report generator.
//
// Produces a single standalone .html string from an analyze() result plus a
// slice of raw prompt samples. NO external requests, NO server, NO CDN — all
// CSS is inlined and every chart is inline SVG / CSS bars so the file works
// offline over file://. All user-derived text (prompt samples, source label)
// is HTML-escaped before embedding, since prompts are untrusted user input.
//
// The visual language mirrors public/index.html (same palette, card style,
// score rings) so the report reads as the same product as the web UI.

// HTML-escape everything that could contain user text or markup.
const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Score → colour band, matching the web UI thresholds.
const clr = (v) => (v >= 66 ? 'var(--teal)' : v >= 45 ? 'var(--amber)' : 'var(--coral)');

// SVG progress ring, same geometry as index.html's ring().
function ring(val) {
  const r = 34,
    w = 8;
  const c = 2 * Math.PI * r;
  const off = c * (1 - val / 100);
  return `<svg width="92" height="92" viewBox="0 0 92 92">
    <circle cx="46" cy="46" r="${r}" fill="none" stroke="#0c0d10" stroke-width="${w}"/>
    <circle cx="46" cy="46" r="${r}" fill="none" stroke="${clr(val)}" stroke-width="${w}"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
      transform="rotate(-90 46 46)"/>
    <text x="46" y="46" text-anchor="middle" dominant-baseline="central"
      style="font-family:var(--serif);font-size:26px" fill="var(--fg)">${val}</text>
  </svg>`;
}

const TITLE = {
  technicalDepth: 'Technical depth',
  authenticityEngagement: 'Authenticity / engagement',
  independence: 'Independence',
};
const NOTE = {
  technicalDepth: 'Vocabulary, tech density, path specificity, reasoning.',
  authenticityEngagement: 'Corrections, length variety, iteration vs one-liners.',
  independence: 'Question/command balance & reasoning.',
};

// Horizontal CSS bar rows (used for distribution, tech terms, behaviour, tags).
function bars(items, { mono = false } = {}) {
  const max = Math.max(...items.map((x) => x.value), 1);
  return items
    .map(
      (x) => `<div class="distrow">
      <span class="dl"${mono ? ' style="font-family:var(--mono);font-size:12px"' : ''}>${esc(x.label)}</span>
      <span class="drail"><i style="width:${(x.value / max) * 100}%"></i></span>
      <span class="dv">${esc(x.display != null ? x.display : x.value)}</span></div>`
    )
    .join('');
}

// Activity-over-time sparkline (inline SVG), mirrors index.html's sparkline().
function sparkline(tl) {
  const w = 380,
    h = 60,
    pad = 4;
  const max = Math.max(...tl.map((d) => d.count), 1);
  const step = tl.length > 1 ? (w - pad * 2) / (tl.length - 1) : 0;
  const pts = tl.map((d, i) => [pad + i * step, h - pad - (d.count / max) * (h - pad * 2)]);
  const line = pts.map((p) => p.join(',')).join(' ');
  const area = `${pad},${h - pad} ${line} ${pad + (tl.length - 1) * step},${h - pad}`;
  return `<svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="display:block">
    <polygon points="${area}" fill="rgba(78,201,176,.12)"/>
    <polyline points="${line}" fill="none" stroke="var(--teal)" stroke-width="1.5"/>
  </svg><div class="sub">${esc(tl[0].date)} → ${esc(tl[tl.length - 1].date)} · ${tl.length} active days</div>`;
}

// Activity-by-hour histogram (CSS bars), mirrors index.html's hourlyChart().
function hourlyChart(hours) {
  const max = Math.max(...hours.map((h) => h.count), 1);
  const pad2 = (x) => String(x).padStart(2, '0');
  const cols = hours
    .map((h) => {
      const pct = (h.count / max) * 100;
      const c = h.count ? 'var(--teal)' : '#20242c';
      return `<div title="${pad2(h.hour)}:00 — ${h.count} prompt${h.count === 1 ? '' : 's'}" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:56px">
        <div style="width:70%;height:${Math.max(pct, 3)}%;background:${c};border-radius:2px 2px 0 0"></div>
      </div>`;
    })
    .join('');
  const ticks = [0, 6, 12, 18, 23]
    .map((hn) => `<span style="flex:1;text-align:center">${hn}</span>`)
    .join('');
  return `<div style="display:flex;gap:2px;align-items:flex-end">${cols}</div>
    <div class="sub" style="display:flex;margin-top:4px">${ticks}</div>`;
}

// Full page CSS — a trimmed static subset of public/index.html's styles
// (no interactive controls / tooltips), keeping palette, fonts and cards.
const CSS = `
  :root {
    --ink:#0e0f12; --panel:#16181d; --panel2:#1b1e24; --border:#282c34;
    --fg:#e8e4da; --muted:#8a8577; --faint:#5b5850;
    --amber:#e0a458; --teal:#4ec9b0; --coral:#e0705a; --violet:#b48ead;
    --serif:"Hoefler Text","Baskerville","Iowan Old Style",Georgia,serif;
    --body:"Avenir Next","Segoe UI",-apple-system,sans-serif;
    --mono:"SF Mono","Menlo","JetBrains Mono",ui-monospace,monospace;
  }
  * { box-sizing:border-box; }
  html,body { margin:0; }
  body {
    font-family:var(--body); font-size:15px; line-height:1.55; color:var(--fg);
    background:
      radial-gradient(1200px 600px at 80% -10%, rgba(224,164,88,.06), transparent 60%),
      radial-gradient(900px 500px at 0% 110%, rgba(78,201,176,.05), transparent 55%),
      var(--ink);
    background-attachment:fixed; min-height:100vh;
  }
  .wrap { max-width:1160px; margin:0 auto; padding:0 32px 100px; }
  header { padding:44px 0 24px; border-bottom:1px solid var(--border); margin-bottom:28px; }
  .eyebrow { font-family:var(--mono); font-size:11px; letter-spacing:.32em; text-transform:uppercase;
    color:var(--amber); margin-bottom:12px; }
  h1 { font-family:var(--serif); font-weight:500; font-size:44px; line-height:1; margin:0 0 10px; letter-spacing:-.01em; }
  h1 em { font-style:italic; color:var(--amber); }
  .lede { color:var(--muted); max-width:720px; font-size:15px; }
  .src { font-family:var(--mono); font-size:13px; color:var(--fg); margin-top:14px; }
  .src .k { color:var(--faint); text-transform:uppercase; letter-spacing:.14em; font-size:11px; margin-right:8px; }

  .disclaimer { border:1px solid rgba(224,164,88,.35); background:rgba(224,164,88,.06);
    color:#e9cfa0; padding:13px 18px; border-radius:4px; font-size:13px; margin-bottom:26px;
    display:flex; gap:10px; }
  .disclaimer b { color:#f3d9a8; }

  .hdr { font-family:var(--mono); font-size:11px; letter-spacing:.24em; text-transform:uppercase;
    color:var(--muted); margin:34px 0 14px; display:flex; align-items:center; gap:14px; }
  .hdr::after { content:""; flex:1; height:1px; background:var(--border); }

  .verdict { font-family:var(--serif); font-size:22px; line-height:1.45; padding:22px 26px;
    border-left:3px solid var(--amber); background:var(--panel); border-radius:0 6px 6px 0; }
  .verdict .band { color:var(--amber); font-style:italic; }

  .gauges { display:grid; grid-template-columns:1.3fr 1fr 1fr 1fr; gap:16px; }
  .gauge { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:22px;
    text-align:center; }
  .gauge.hero { text-align:left; display:flex; flex-direction:column; justify-content:center; }
  .gauge .glab { font-family:var(--mono); font-size:10.5px; letter-spacing:.16em; text-transform:uppercase;
    color:var(--muted); margin-bottom:6px; }
  .gauge .gnum { font-family:var(--serif); font-size:52px; line-height:1; font-weight:500; }
  .gauge .gsuf { font-family:var(--mono); font-size:13px; color:var(--faint); }
  .gauge svg { display:block; margin:6px auto 4px; }
  .gauge .gnote { font-family:var(--mono); font-size:10.5px; color:var(--faint); margin-top:8px; line-height:1.5; }

  .breakdowns { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
  .bd { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:18px; }
  .bd h4 { margin:0 0 12px; font-family:var(--mono); font-size:11px; letter-spacing:.1em;
    text-transform:uppercase; color:var(--muted); font-weight:500; }
  .bd .brow { display:grid; grid-template-columns:1fr auto; gap:8px; align-items:center; font-size:13px; margin-bottom:9px; }
  .bd .brail { grid-column:1/3; height:5px; background:#0c0d10; border-radius:3px; overflow:hidden; }
  .bd .brail > i { display:block; height:100%; background:var(--teal); border-radius:3px; }
  .bd .bpts { font-family:var(--mono); color:var(--amber); font-size:12px; }

  .strip { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:1px; background:var(--border);
    border:1px solid var(--border); border-radius:8px; overflow:hidden; }
  .stat { background:var(--panel); padding:18px 20px; }
  .stat .sv { font-family:var(--serif); font-size:32px; line-height:1; }
  .stat .sl { font-family:var(--mono); font-size:10.5px; letter-spacing:.12em; text-transform:uppercase;
    color:var(--muted); margin-top:6px; }

  .card { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:20px; }
  .two { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .ctitle { font-family:var(--mono); font-size:11px; letter-spacing:.1em; text-transform:uppercase;
    color:var(--muted); margin-bottom:14px; }

  table { width:100%; border-collapse:collapse; }
  td, th { padding:9px 4px; border-bottom:1px solid var(--border); font-size:13.5px; }
  th { font-family:var(--mono); font-size:10.5px; letter-spacing:.1em; text-transform:uppercase;
    color:var(--muted); text-align:left; font-weight:500; }
  td.n, th.n { text-align:right; font-family:var(--mono); }
  tr:last-child td { border-bottom:0; }

  .distrow { display:grid; grid-template-columns:150px 1fr 60px; align-items:center; gap:12px; margin-bottom:11px; }
  .distrow .dl { font-size:13px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .distrow .drail { height:20px; background:#0c0d10; border-radius:3px; overflow:hidden; }
  .distrow .drail > i { display:block; height:100%; background:linear-gradient(90deg,var(--amber),var(--teal)); border-radius:3px; }
  .distrow .dv { font-family:var(--mono); font-size:12px; text-align:right; color:var(--fg); }

  .chips { display:flex; flex-wrap:wrap; gap:8px; }
  .chip { font-family:var(--mono); font-size:12px; background:var(--panel2); border:1px solid var(--border);
    border-radius:20px; padding:6px 13px; }
  .chip .pct { color:var(--faint); }
  .sub { color:var(--faint); font-size:11.5px; font-family:var(--mono); }

  .samples { display:flex; flex-direction:column; gap:9px; }
  .sample { background:#0b0c0f; border:1px solid var(--border); border-left:2px solid var(--teal);
    padding:11px 14px; border-radius:0 5px 5px 0; font-size:13.5px; color:#cfcabd; white-space:pre-wrap;
    font-family:var(--mono); line-height:1.5; }

  footer { margin-top:48px; padding-top:20px; border-top:1px solid var(--border); color:var(--faint);
    font-family:var(--mono); font-size:11px; }

  @media (max-width:820px){
    .wrap{padding:0 18px 80px;} h1{font-size:34px;}
    .gauges,.breakdowns,.two,.strip{grid-template-columns:1fr;}
  }`;

/**
 * Build a complete, standalone HTML report.
 * @param {object} result  analyze() output
 * @param {string[]} samples  evenly-sampled raw prompt strings (untrusted)
 * @param {object} opts  { label, id, kind }
 * @returns {string} full HTML document
 */
export function buildReport(result, samples = [], opts = {}) {
  const label = opts.label || opts.id || 'unknown source';
  const kind = opts.kind || 'claude';
  const generated = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Prompt Profiler — ${esc(label)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="eyebrow">Prompting-Style Analysis</div>
    <h1>Prompt <em>Profiler</em> — Report</h1>
    <p class="lede">A full local Claude Code, Cursor, Codex, and OpenCode session history, distilled into prompting-style signals. This file is self-contained: no server, no network.</p>
    <div class="src"><span class="k">Source</span>${esc(label)} <span class="sub">· ${esc(kind)} · ${esc(opts.id || '')}</span></div>
    <div class="src" style="color:var(--faint)"><span class="k">Generated</span>${esc(generated)}</div>
  </header>
  <div class="disclaimer">
    <span>⚠</span>
    <span>Every score is a <b>heuristic signal</b>, not a validated measure of skill or quality. Style varies with task, tooling familiarity, and mood. Analysis runs on the <b>full</b> corpus — but always read the raw prompts before drawing conclusions.</span>
  </div>`;

  const footer = `
  <footer>Prompt Profiler · heuristic signals for human review, not verdicts · generated ${esc(generated)}</footer>
</div>
</body>
</html>`;

  // Empty-corpus report: still a valid standalone file.
  if (result.empty) {
    return `${head}
  <div class="card" style="text-align:center;font-family:var(--serif);font-size:20px;color:var(--muted);padding:56px">
    ${esc(result.message || 'No human-typed prompts found.')}
  </div>${footer}`;
  }

  const s = result.scores;
  const c = result.counts;
  const m = result.metrics;
  const ss = result.sessionStats;

  const gauge = (k) =>
    `<div class="gauge"><div class="glab">${TITLE[k]}</div>${ring(s[k])}<div class="gnote">${NOTE[k]}</div></div>`;

  const bd = (k) =>
    `<div class="bd"><h4>${TITLE[k]} · ${s[k]}</h4>${result.breakdowns[k]
      .map(
        (r) => `<div class="brow"><span>${esc(r.label)}</span>
        <span class="bpts">+${r.points}</span>
        <span class="brail"><i style="width:${Math.min(100, r.points * 3)}%"></i></span></div>`
      )
      .join('')}</div>`;

  const scoresSection = `
    <section><div class="verdict">${esc(result.verdict).replace(/^(\w+)/, '<span class="band">$1</span>')}</div></section>

    <div class="hdr">Signal scores</div>
    <div class="gauges">
      <div class="gauge hero">
        <div class="glab">Composite</div>
        <div class="gnum" style="color:${clr(s.composite)}">${s.composite}<span class="gsuf"> / 100</span></div>
        <div class="gnote">Mean of the three signals.<br>Style: ${esc(result.fingerprint.style)} · Tone: ${esc(result.fingerprint.politeness)}</div>
      </div>
      ${gauge('technicalDepth')}${gauge('authenticityEngagement')}${gauge('independence')}
    </div>

    <div class="hdr">What drives each score</div>
    <div class="breakdowns">${bd('technicalDepth')}${bd('authenticityEngagement')}${bd('independence')}</div>`;

  const corpusSection = `
    <div class="hdr">Corpus</div>
    <div class="strip">
      <div class="stat"><div class="sv">${c.typedPrompts.toLocaleString()}</div><div class="sl">Typed prompts</div></div>
      <div class="stat"><div class="sv">${ss.count}</div><div class="sl">Sessions</div></div>
      <div class="stat"><div class="sv">${ss.avgPromptsPerSession}</div><div class="sl">Avg prompts / session</div></div>
      <div class="stat"><div class="sv">${ss.maxPromptsInSession}</div><div class="sl">Busiest session</div></div>
      ${result.span ? `<div class="stat"><div class="sv">${result.span.days}<span class="gsuf">d</span></div><div class="sl">Data span</div></div>` : ''}
      ${ss.avgDurationMin != null ? `<div class="stat"><div class="sv">${ss.avgDurationMin}<span class="gsuf">m</span></div><div class="sl">Avg session length</div></div>` : ''}
    </div>
    ${
      result.span
        ? `<div class="sub" style="margin-top:10px">Data spans <b style="color:var(--fg)">${esc(result.span.first)} → ${esc(result.span.last)}</b> · ${result.span.days} calendar days · ${result.span.activeDays} active days${ss.longestSessionMin != null ? ` · longest session ${ss.longestSessionMin} min` : ''}</div>`
        : `<div class="sub" style="margin-top:10px">No per-message timestamps for this source — duration unavailable. (Cursor doesn't store them.)</div>`
    }`;

  const distItems = result.distribution.map((x) => ({ label: x.label, value: x.count }));
  const techItems = result.topTechTerms.map((x) => ({ label: x.term, value: x.count }));
  const distTechSection = `
    <div class="two" style="margin-top:16px">
      <div><div class="hdr">Prompt-length distribution</div><div class="card">${bars(distItems)}</div></div>
      <div><div class="hdr">Technicality — top terms</div><div class="card">${
        techItems.length
          ? bars(techItems, { mono: true })
          : '<div class="sub">No technical terms detected.</div>'
      }</div></div>
    </div>`;

  const metricRows = [
    ['Avg prompt length', m.avgPromptWords + ' words'],
    ['Median length', m.medianPromptWords + ' words'],
    ['Vocabulary richness (TTR)', m.vocabularyRichness + '%'],
    ['Unique words', m.uniqueWords.toLocaleString()],
    ['Question ratio', m.questionRatio + '%'],
    ['Correction / iteration', m.correctionRatio + '%'],
    ['Reasoning cues', m.reasoningRatio + '%'],
    ['Technical terms / prompt', m.techTermsPerPrompt],
    ['Code blocks pasted', m.codeBlockRatio + '%'],
    ['Politeness markers', m.politenessRatio + '%'],
    ['Avg word length', m.avgWordLength + ' chars'],
    ['Avg sentences / prompt', m.avgSentences],
    ['Numeric references', m.numericRefs + '%'],
  ]
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${esc(v)}</td></tr>`)
    .join('');

  const starters = result.fingerprint.topStarters
    .map((x) => `<span class="chip">${esc(x.word)} <span class="pct">${x.pct}%</span></span>`)
    .join('');
  const spark = result.timeline.length > 1 ? sparkline(result.timeline) : '';
  const hourly =
    result.hourly && result.hourly.some((h) => h.count) ? hourlyChart(result.hourly) : '';

  const metricsFingerprintSection = `
    <div class="two" style="margin-top:16px">
      <div><div class="hdr">Metrics</div><div class="card"><table>${metricRows}</table></div></div>
      <div><div class="hdr">Style fingerprint</div><div class="card">
        <div class="sub" style="margin-bottom:10px">Signature opening words</div>
        <div class="chips">${starters}</div>
        ${spark ? `<div class="sub" style="margin:18px 0 8px">Activity over time</div>${spark}` : ''}
        ${hourly ? `<div class="sub" style="margin:18px 0 8px">Activity by hour</div>${hourly}` : ''}
      </div></div>
    </div>`;

  const behaviorItems = result.behavior.map((b) => ({
    label: b.label,
    value: b.pct,
    display: b.pct + '%',
  }));
  const tagsHtml = result.tags.length
    ? result.tags
        .map(
          (t) =>
            `<span class="chip">${esc(t.name)} <span class="pct">${t.count} · ${t.pct}%</span></span>`
        )
        .join('')
    : '<div class="sub">No domain keywords matched.</div>';
  const behaviorTagsSection = `
    <div class="two" style="margin-top:16px">
      <div><div class="hdr">Behavioral markers</div><div class="card">${bars(behaviorItems)}</div></div>
      <div><div class="hdr">Domain &amp; keyword tags</div><div class="card"><div class="chips">${tagsHtml}</div></div></div>
    </div>`;

  const samplesHtml = (samples || []).map((t) => `<div class="sample">${esc(t)}</div>`).join('');
  const samplesSection = `
    <div class="hdr">Prompt samples <span class="sub" style="text-transform:none;letter-spacing:0">— evenly sampled across the full corpus; read these</span></div>
    <div class="samples">${samplesHtml || '<div class="sub">No samples available.</div>'}</div>`;

  return (
    head +
    scoresSection +
    corpusSection +
    distTechSection +
    metricsFingerprintSection +
    behaviorTagsSection +
    samplesSection +
    footer
  );
}

// Reproduce server.js /api/analyze sampling: an evenly-spaced slice of up to
// 40 typed prompts (truncated to 400 chars) across the whole corpus.
export function buildSamples(prompts) {
  const typed = prompts.filter((p) => !p.isSlash);
  const step = Math.max(1, Math.floor(typed.length / 40));
  return typed
    .filter((_, idx) => idx % step === 0)
    .slice(0, 40)
    .map((p) => p.text.slice(0, 400));
}
