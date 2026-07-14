import { useEffect, useRef, useState } from 'react';
import InfoTip from './InfoTip.jsx';
import { Ring, CountNum } from './Gauge.jsx';
import { Sparkline, HourlyChart } from './Sparkline.jsx';
import { ProfileSkeleton } from './Skeleton.jsx';
import { NOTE, TITLE, ordinal, clr } from '../constants.js';

function BarRow({ label, value, widthPct, dataG, mono }) {
  return (
    <div className="distrow" data-g={dataG}>
      <span
        className="dl"
        style={mono ? { fontFamily: 'var(--mono)', fontSize: '12px' } : undefined}
      >
        {label}
      </span>
      <span className="drail">
        <i style={{ width: widthPct + '%' }}></i>
      </span>
      <span className="dv">{value}</span>
    </div>
  );
}

function PctLine({ d, k }) {
  if (!(d.percentiles && d.percentiles[k] != null)) return null;
  const word = ordinal(d.percentiles[k]);
  return (
    <div className="gpct" data-g={`${word} percentile among ${d.cohortSize} analyzed sources`}>
      {word} pct<span className="gpctsub"> · vs {d.cohortSize}</span>
    </div>
  );
}

function GaugeCard({ d, k }) {
  return (
    <div className="gauge">
      <div className="glab">
        {TITLE[k]}
        <InfoTip k={k} />
      </div>
      <Ring val={d.scores[k]} />
      <PctLine d={d} k={k} />
      <div className="gnote">{NOTE[k]}</div>
    </div>
  );
}

function Breakdown({ d, k }) {
  return (
    <div className="bd">
      <h4>
        {TITLE[k]} · {d.scores[k]}
      </h4>
      {d.breakdowns[k].map((r, i) => (
        <div className="brow" key={i}>
          <span>{r.label}</span>
          <span className="bpts">+{r.points}</span>
          <span className="brail">
            <i style={{ width: Math.min(100, r.points * 3) + '%' }}></i>
          </span>
        </div>
      ))}
    </div>
  );
}

function barsFrom(arr, k, mono) {
  if (!(arr && arr.length)) return null;
  const mx = Math.max(...arr.map((x) => x.count), 1);
  return arr
    .slice(0, 12)
    .map((x, i) => (
      <BarRow
        key={i}
        mono={mono}
        label={String(x[k])}
        value={x.count.toLocaleString()}
        widthPct={(x.count / mx) * 100}
        dataG={`${String(x[k])} — ${x.count.toLocaleString()}`}
      />
    ));
}

const shortTool = (name) => (name.startsWith('mcp__') ? 'mcp:' + name.split('__').pop() : name);

function Verdict({ text }) {
  const m = /^(\w+)/.exec(text);
  if (!m) return <div className="verdict">{text}</div>;
  return (
    <div className="verdict">
      <span className="band">{m[1]}</span>
      {text.slice(m[0].length)}
    </div>
  );
}

function Results({ d }) {
  const s = d.scores,
    m = d.metrics,
    c = d.counts,
    ss = d.sessionStats;

  const maxDist = Math.max(...d.distribution.map((x) => x.count), 1);
  const pctOf = (x) => (c.typedPrompts ? Math.round((x / c.typedPrompts) * 100) : 0);

  const maxTech = Math.max(...(d.topTechTerms.map((x) => x.count) || []), 1);

  const metricRows = [
    ['Avg prompt length', m.avgPromptWords + ' words', 'avgPromptWords'],
    ['Median length', m.medianPromptWords + ' words', 'medianPromptWords'],
    ['Vocabulary richness (TTR)', m.vocabularyRichness + '%', 'vocabularyRichness'],
    ['Unique words', m.uniqueWords.toLocaleString(), 'uniqueWords'],
    ['Question ratio', m.questionRatio + '%', 'questionRatio'],
    ['Correction / iteration', m.correctionRatio + '%', 'correctionRatio'],
    ['Reasoning cues', m.reasoningRatio + '%', 'reasoningRatio'],
    ['Technical terms / prompt', m.techTermsPerPrompt, 'techTermsPerPrompt'],
    ['Code blocks pasted', m.codeBlockRatio + '%', 'codeBlockRatio'],
    ['Politeness markers', m.politenessRatio + '%', 'politenessRatio'],
    ['Avg word length', m.avgWordLength + ' chars', 'avgWordLength'],
    ['Avg sentences / prompt', m.avgSentences, 'avgSentences'],
    ['Numeric references', m.numericRefs + '%', 'numericRefs'],
  ];

  const bMax = Math.max(...d.behavior.map((b) => b.pct), 1);

  const meta = d.meta || {};
  const toolsShort = (meta.tools || []).map((t) => ({ name: shortTool(t.name), count: t.count }));
  const modelsBars = barsFrom(meta.models, 'name', true);
  const langsBars = barsFrom(meta.languages, 'lang');
  const toolsBars = barsFrom(toolsShort, 'name', true);

  return (
    <>
      <section>
        <Verdict text={d.verdict} />
      </section>

      <div className="hdr">Signal scores</div>
      <div className="gauges">
        <div className="gauge hero">
          <div className="glab">
            Composite
            <InfoTip k="composite" />
          </div>
          <div className="gnum" style={{ color: clr(s.composite) }}>
            <CountNum n={s.composite} />
            <span className="gsuf"> / 100</span>
          </div>
          <PctLine d={d} k="composite" />
          <div className={`rel rel-${d.reliability.level}`} data-g={d.reliability.note}>
            {d.reliability.level} reliability
          </div>
          <div className="gnote">
            Mean of the three signals below.
            <br />
            Style: {d.fingerprint.style} · Tone: {d.fingerprint.politeness}
          </div>
        </div>
        <GaugeCard d={d} k="technicalDepth" />
        <GaugeCard d={d} k="authenticityEngagement" />
        <GaugeCard d={d} k="independence" />
      </div>

      <div className="hdr">What drives each score</div>
      <div className="breakdowns">
        <Breakdown d={d} k="technicalDepth" />
        <Breakdown d={d} k="authenticityEngagement" />
        <Breakdown d={d} k="independence" />
      </div>

      <div className="hdr">
        Corpus
        <InfoTip k="corpus" />
      </div>
      <div className="strip">
        <div className="stat">
          <div className="sv">{c.typedPrompts.toLocaleString()}</div>
          <div className="sl">Typed prompts</div>
        </div>
        <div className="stat">
          <div className="sv">{ss.count}</div>
          <div className="sl">Sessions</div>
        </div>
        <div className="stat">
          <div className="sv">{ss.avgPromptsPerSession}</div>
          <div className="sl">Avg prompts / session</div>
        </div>
        <div className="stat">
          <div className="sv">{ss.maxPromptsInSession}</div>
          <div className="sl">Busiest session</div>
        </div>
        {d.span && (
          <div className="stat">
            <div className="sv">
              {d.span.days}
              <span className="gsuf">d</span>
            </div>
            <div className="sl">
              Data span
              <InfoTip k="span" />
            </div>
          </div>
        )}
        {ss.avgDurationMin != null && (
          <div className="stat">
            <div className="sv">
              {ss.avgDurationMin}
              <span className="gsuf">m</span>
            </div>
            <div className="sl">
              Avg session length
              <InfoTip k="sessionLen" />
            </div>
          </div>
        )}
      </div>
      {d.span ? (
        <div className="sub" style={{ marginTop: '10px' }}>
          Data spans{' '}
          <b style={{ color: 'var(--fg)' }}>
            {d.span.first} → {d.span.last}
          </b>{' '}
          · {d.span.days} calendar days · {d.span.activeDays} active days
          {ss.longestSessionMin != null ? ` · longest session ${ss.longestSessionMin} min` : ''}
        </div>
      ) : (
        <div className="sub" style={{ marginTop: '10px' }}>
          No per-message timestamps for this source — duration unavailable. (Cursor doesn&apos;t
          store them.)
        </div>
      )}

      <div className="two" style={{ marginTop: '16px' }}>
        <div>
          <div className="hdr">
            Prompt-length distribution
            <InfoTip k="distribution" />
          </div>
          <div className="card">
            {d.distribution.map((x) => (
              <BarRow
                key={x.label}
                label={x.label}
                value={x.count}
                widthPct={(x.count / maxDist) * 100}
                dataG={`${x.label} — ${x.count} prompts (${pctOf(x.count)}% of corpus)`}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="hdr">
            Technicality — top terms
            <InfoTip k="techterms" />
          </div>
          <div className="card">
            {d.topTechTerms.length ? (
              d.topTechTerms.map((x) => (
                <BarRow
                  key={x.term}
                  mono
                  label={x.term}
                  value={x.count}
                  widthPct={(x.count / maxTech) * 100}
                  dataG={`"${x.term}" appears in ${x.count} prompts (${x.pct}%)`}
                />
              ))
            ) : (
              <div className="sub">No technical terms detected.</div>
            )}
          </div>
        </div>
      </div>

      <div className="two" style={{ marginTop: '16px' }}>
        <div>
          <div className="hdr">Metrics</div>
          <div className="card">
            <table>
              <tbody>
                {metricRows.map(([label, val, key]) => (
                  <tr key={key}>
                    <td>
                      {label}
                      <InfoTip k={key} />
                    </td>
                    <td className="n">{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="hdr">
            Style fingerprint
            <InfoTip k="fingerprint" />
          </div>
          <div className="card">
            <div className="sub" style={{ marginBottom: '10px' }}>
              Signature opening words
            </div>
            <div className="chips">
              {d.fingerprint.topStarters.map((x) => (
                <span className="chip" key={x.word}>
                  {x.word} <span className="pct">{x.pct}%</span>
                </span>
              ))}
            </div>
            {d.timeline.length > 1 && (
              <>
                <div className="sub" style={{ margin: '18px 0 8px' }}>
                  Activity over time
                </div>
                <Sparkline tl={d.timeline} />
              </>
            )}
            {d.hourly && d.hourly.some((h) => h.count) && (
              <>
                <div className="sub" style={{ margin: '18px 0 8px' }}>
                  Activity by hour
                  <InfoTip k="hourly" />
                </div>
                <HourlyChart hours={d.hourly} />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="two" style={{ marginTop: '16px' }}>
        <div>
          <div className="hdr">
            Behavioral markers
            <InfoTip k="behavior" />
          </div>
          <div className="card">
            {d.behavior.map((b) => (
              <BarRow
                key={b.label}
                label={b.label}
                value={`${b.pct}%`}
                widthPct={(b.pct / bMax) * 100}
                dataG={`${b.label} — present in ${b.pct}% of prompts`}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="hdr">
            Domain &amp; keyword tags
            <InfoTip k="tags" />
          </div>
          <div className="card">
            <div className="chips">
              {d.tags.length ? (
                d.tags.map((t) => (
                  <span className="chip" key={t.name}>
                    {t.name}{' '}
                    <span className="pct">
                      {t.count} · {t.pct}%
                    </span>
                  </span>
                ))
              ) : (
                <div className="sub">No domain keywords matched.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="hdr">
        Models, languages &amp; tooling
        <InfoTip k="languages" />
      </div>
      <div className="three">
        <div className="card">
          <div className="ctitle">
            Models used
            <InfoTip k="models" />
          </div>
          {modelsBars || <div className="sub">{meta.modelsNote || 'No model data.'}</div>}
        </div>
        <div className="card">
          <div className="ctitle">
            Languages generated
            <InfoTip k="languages" />
          </div>
          {langsBars || <div className="sub">No generated files detected.</div>}
        </div>
        <div className="card">
          <div className="ctitle">
            Tools invoked
            <InfoTip k="tools" />
          </div>
          {toolsBars || <div className="sub">Tool usage not tracked for this source.</div>}
          {meta.versions && meta.versions.length > 0 && (
            <div className="sub" style={{ marginTop: '12px' }}>
              Client versions:{' '}
              {meta.versions
                .slice(0, 5)
                .map((v) => v.version)
                .join(', ')}
            </div>
          )}
        </div>
      </div>

      <div className="hdr">
        Prompt samples
        <InfoTip k="samples" />
        <span className="sub" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {' '}
          — evenly sampled across the full corpus; read these
        </span>
      </div>
      <div className="samples">
        {(d.samples || []).map((t, i) => (
          <div className="sample" key={i}>
            {t}
          </div>
        ))}
      </div>
    </>
  );
}

export default function Profile({ tool, list, onLoadingChange }) {
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [statusMsg, setStatusMsg] = useState('Select a source and run the analysis.');
  const [meta, setMeta] = useState('');

  // Analyses are pure over a source id, so cache them: revisiting a source you
  // already ran shows instantly with no refetch.
  const cacheRef = useRef(new Map());

  // Re-populate the selected project whenever the tool (or its source list)
  // changes — mirrors the old innerHTML replace resetting <select>.value.
  useEffect(() => {
    setProjectId(tool === 'claude' ? '__all__' : list[0]?.id || '');
  }, [tool, list]);

  // Sync the view to the selected source: show its cached analysis if we have
  // one, otherwise clear stale results so `meta` never mismatches the view.
  useEffect(() => {
    setError(null);
    const hit = projectId && cacheRef.current.get(projectId);
    if (hit) {
      setData(hit.data);
      setMeta(hit.meta);
      setHasAnalyzed(true);
    } else {
      setData(null);
      setMeta('');
      setHasAnalyzed(false);
      setStatusMsg(
        projectId ? 'Ready — run the analysis.' : 'Select a source and run the analysis.'
      );
    }
  }, [projectId]);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  async function run() {
    const id = projectId;
    if (!id) return;
    setLoading(true);
    setError(null);
    setStatusMsg('Reading full corpus…');
    let d;
    try {
      const r = await fetch('/api/analyze?project=' + encodeURIComponent(id));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      d = await r.json();
    } catch (e) {
      setError('Request failed: ' + e.message);
      setLoading(false);
      return;
    }
    if (!d || d.error) {
      setError('Error: ' + ((d && d.error) || 'unknown'));
      setLoading(false);
      return;
    }
    if (d.empty) {
      setStatusMsg(d.message);
      setData(null);
      setHasAnalyzed(true);
      setLoading(false);
      return;
    }
    setHasAnalyzed(true);
    const c = d.counts;
    const metaStr = `${c.typedPrompts} prompts · ${c.sessions} sessions · ${c.totalWords.toLocaleString()} words`;
    setMeta(metaStr);
    setData(d);
    cacheRef.current.set(id, { data: d, meta: metaStr });
    setLoading(false);
  }

  const buttonLabel = loading ? 'Analyzing…' : hasAnalyzed ? 'Re-analyze' : 'Analyze';

  return (
    <section id="panel-profile">
      <div className="rowline" style={{ marginTop: '20px' }}>
        <select
          id="project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          disabled={loading}
        >
          {tool === 'claude' && (
            <option value="__all__">★ All Claude Code data (aggregate — every project)</option>
          )}
          {list.length
            ? list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {p.sessions} sessions
                </option>
              ))
            : tool !== 'claude' && <option value="">— no sources for this tool —</option>}
        </select>
        <button
          className={`btn primary${loading ? ' loading' : ''}`}
          id="run"
          disabled={loading}
          onClick={run}
        >
          {buttonLabel}
        </button>
        <span className="meta" id="meta">
          {meta}
        </span>
      </div>
      <div id="out">
        {loading ? (
          <ProfileSkeleton />
        ) : error ? (
          <div className="empty">{error}</div>
        ) : data ? (
          <Results d={data} />
        ) : (
          <div className="empty">{statusMsg}</div>
        )}
      </div>
    </section>
  );
}
