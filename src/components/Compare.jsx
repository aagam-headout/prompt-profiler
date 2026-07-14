import { useEffect, useState } from 'react';
import InfoTip from './InfoTip.jsx';
import { CompareSkeleton } from './Skeleton.jsx';
import { usePersistedState } from '../hooks/usePersistedState.js';
import { TOOL_NAMES, clr } from '../constants.js';

const MEDAL = ['g', 's', 'b'];
const volDot = (p) => (p >= 200 ? '' : p >= 50 ? 'mid' : 'lo');

export default function Compare({ tool, list }) {
  const [selected, setSelected] = useState(new Set());
  const [rankBy, setRankBy] = usePersistedState('pp.rankBy', 'composite');
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Reset the picklist selection whenever the tool (source list) changes.
  useEffect(() => {
    setSelected(new Set());
  }, [tool, list]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectAll = () => setSelected(new Set(list.map((p) => p.id)));
  const clearSel = () => setSelected(new Set());

  async function runCompare() {
    const ids = [...selected];
    if (ids.length < 2) {
      setRows(null);
      setError('Select at least 2 sources.');
      return;
    }
    setLoading(true);
    setError(null);
    let data;
    try {
      const r = await fetch('/api/compare?projects=' + encodeURIComponent(ids.join(',')));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      data = await r.json();
    } catch (e) {
      setError('Request failed: ' + e.message);
      setLoading(false);
      return;
    }
    if (data && data.error) {
      setError('Error: ' + data.error);
      setLoading(false);
      return;
    }
    if (!Array.isArray(data)) {
      setError('Unexpected response.');
      setLoading(false);
      return;
    }
    setRows(data);
    setLoading(false);
  }

  // Re-sort automatically whenever the rank key changes and results exist
  // (mirrors the old #rankBy change listener re-running compare()).
  const sortedRows = rows
    ? [...rows].sort((a, b) => {
        const val = (r) => (r.empty || !r.scores ? -1 : r.scores[rankBy]);
        return val(b) - val(a);
      })
    : null;
  const cmeta = sortedRows ? `${sortedRows.length} sources · ranked by ${rankBy}` : '';

  return (
    <section id="panel-compare">
      <div className="rowline" style={{ marginTop: '20px' }}>
        <span className="lab">Rank by</span>
        <select
          id="rankBy"
          value={rankBy}
          onChange={(e) => setRankBy(e.target.value)}
          disabled={loading}
        >
          <option value="composite">Composite</option>
          <option value="technicalDepth">Technical depth</option>
          <option value="authenticityEngagement">Authenticity / engagement</option>
          <option value="independence">Independence</option>
        </select>
        <button
          className={`btn primary${loading ? ' loading' : ''}`}
          id="compareBtn"
          disabled={loading || selected.size < 2}
          onClick={runCompare}
        >
          {loading
            ? 'Comparing…'
            : `Compare selected${selected.size >= 2 ? ` (${selected.size})` : ''}`}
        </button>
        <span className="meta" id="cmeta">
          {cmeta}
        </span>
      </div>
      <div className="hdr">
        Select 2+ <span id="toolNameC">{TOOL_NAMES[tool] || tool}</span> sources
      </div>
      {list.length > 0 && (
        <div className="pickbar">
          <span className="sub">{selected.size} selected</span>
          <button className="linkbtn" onClick={selectAll} disabled={loading}>
            Select all
          </button>
          <button className="linkbtn" onClick={clearSel} disabled={loading || !selected.size}>
            Clear
          </button>
        </div>
      )}
      <div id="pickList" className="picklist">
        {list.length ? (
          list.map((p) => (
            <label className="pick" key={p.id}>
              <input
                type="checkbox"
                value={p.id}
                checked={selected.has(p.id)}
                disabled={loading}
                onChange={() => toggle(p.id)}
              />
              <span className={`badge ${p.kind}`}>{p.kind}</span>
              <span>{p.label}</span> <span className="sub">{p.sessions}s</span>
            </label>
          ))
        ) : (
          <div className="empty">No sources.</div>
        )}
      </div>
      <div id="compareOut">
        {loading ? (
          <CompareSkeleton rows={Math.max(2, selected.size)} />
        ) : error ? (
          <div className="empty">{error}</div>
        ) : sortedRows ? (
          <>
            <div className="hdr" style={{ marginTop: '22px' }}>
              Ranking
              <InfoTip k="composite" />
            </div>
            <div className="legend">
              <span>
                <span className="dot" style={{ background: 'var(--teal)' }}></span>66–100 strong
              </span>
              <span>
                <span className="dot" style={{ background: 'var(--amber)' }}></span>45–65 moderate
              </span>
              <span>
                <span className="dot" style={{ background: 'var(--coral)' }}></span>0–44 light
              </span>
              <span style={{ marginLeft: '8px' }}>
                <span className="voldot lo"></span>/<span className="voldot mid"></span>/
                <span className="voldot"></span> data volume: low / medium / high
              </span>
            </div>
            <div className="card">
              <table className="cmp">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'center' }}>#</th>
                    <th>Source</th>
                    <th className="n">
                      Volume
                      <InfoTip k="cmpVolume" pos="r" />
                    </th>
                    <th className="n">
                      Depth
                      <InfoTip k="technicalDepth" pos="r" />
                    </th>
                    <th className="n">
                      Auth
                      <InfoTip k="authenticityEngagement" pos="r" />
                    </th>
                    <th className="n">
                      Indep
                      <InfoTip k="independence" pos="r" />
                    </th>
                    <th className="n">
                      Comp
                      <InfoTip k="composite" pos="r" />
                    </th>
                    <th className="n">
                      Ranked
                      <InfoTip k="cmpRanked" pos="r" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r, i) => {
                    if (r.empty) {
                      return (
                        <tr key={r.id}>
                          <td className="rank">–</td>
                          <td className="cand">
                            <span className={`badge ${r.kind}`}>{r.kind}</span> {r.label}
                          </td>
                          <td colSpan={6} className="sub">
                            no human prompts
                          </td>
                        </tr>
                      );
                    }
                    const s = r.scores,
                      c = r.counts;
                    const rs = s[rankBy];
                    return (
                      <tr key={r.id}>
                        <td className={`rank ${MEDAL[i] || ''}`}>{i + 1}</td>
                        <td className="cand">
                          <span className={`badge ${r.kind}`}>{r.kind}</span> <b>{r.label}</b>
                          <div className="sub">{r.style || ''}</div>
                        </td>
                        <td className="n">
                          <span className="vol">
                            <span className={`voldot ${volDot(c.typedPrompts)}`}></span>
                            {c.typedPrompts.toLocaleString()} · {c.sessions}s
                          </span>
                        </td>
                        <td className="n" style={{ color: clr(s.technicalDepth) }}>
                          {s.technicalDepth}
                        </td>
                        <td className="n" style={{ color: clr(s.authenticityEngagement) }}>
                          {s.authenticityEngagement}
                        </td>
                        <td className="n" style={{ color: clr(s.independence) }}>
                          {s.independence}
                        </td>
                        <td className="n" style={{ color: clr(s.composite) }}>
                          {s.composite}
                        </td>
                        <td className="rankedcell" data-g={`Ranked score: ${rs} / 100`}>
                          <div className="rankbar">
                            <i style={{ width: rs + '%', background: clr(rs) }}></i>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p
              className="sub"
              style={{ marginTop: '12px', textTransform: 'none', letterSpacing: 0 }}
            >
              Heuristic ranking. Scores from small corpora (red volume dot) or different tools
              aren&apos;t strictly comparable — data volume alone shifts vocabulary and variety
              metrics. Open each source in Deep dive and read its prompts before drawing
              conclusions.
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}
