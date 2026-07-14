import { useEffect, useMemo, useState } from 'react';
import GTip from './components/GTip.jsx';
import Profile from './components/Profile.jsx';
import Compare from './components/Compare.jsx';
import { usePersistedState } from './hooks/usePersistedState.js';

export default function App() {
  const [sources, setSources] = useState([]);
  const [sourcesError, setSourcesError] = useState(null);
  const [tool, setTool] = usePersistedState('pp.tool', 'claude');
  const [mode, setMode] = usePersistedState('pp.mode', 'profile');
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/projects');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        setSources(Array.isArray(data) ? data : []);
      } catch (e) {
        setSources([]);
        setSourcesError(e.message);
      }
    })();
  }, []);

  const list = useMemo(
    () => sources.filter((s) => s.kind === tool).filter((s) => s.sessions > 0),
    [sources, tool]
  );

  return (
    <>
      <GTip />
      <div className="wrap">
        <header>
          <div className="eyebrow">Prompting-Style Analysis</div>
          <h1>
            Prompt <em>Profiler</em>
          </h1>
          <p className="lede">
            Reads a full local session history from Claude Code, Cursor, Codex, and OpenCode, then
            surfaces prompting-style signals — technical depth, engagement, independence.
          </p>
        </header>

        <div className="disclaimer">
          <span>⚠</span>
          <span>
            Every score is a <b>heuristic signal</b>, not a validated measure of skill or quality.
            Style varies with task, tooling familiarity, and mood. Analysis runs on the <b>full</b>{' '}
            corpus — but always read the raw prompts before drawing conclusions.
          </span>
        </div>

        <div className="rowline">
          <span className="lab">Tool</span>
          <div className="seg tool" id="toolSeg">
            {[
              ['claude', 'Claude Code'],
              ['cursor', 'Cursor'],
              ['codex', 'Codex'],
              ['opencode', 'OpenCode'],
            ].map(([id, label]) => (
              <button
                key={id}
                data-tool={id}
                className={tool === id ? 'on' : ''}
                disabled={profileLoading}
                onClick={() => setTool(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="lab" style={{ marginLeft: '12px' }}>
            Mode
          </span>
          <div className="seg" id="modeSeg">
            <button
              data-mode="profile"
              className={mode === 'profile' ? 'on' : ''}
              onClick={() => setMode('profile')}
            >
              Deep dive
            </button>
            <button
              data-mode="compare"
              className={mode === 'compare' ? 'on' : ''}
              onClick={() => setMode('compare')}
            >
              Compare &amp; rank
            </button>
          </div>
        </div>

        {sourcesError && (
          <div className="empty">
            Couldn&apos;t load sources — is the server running? ({sourcesError})
          </div>
        )}

        <div style={{ display: mode === 'profile' ? '' : 'none' }}>
          <Profile tool={tool} list={list} onLoadingChange={setProfileLoading} />
        </div>
        <div style={{ display: mode === 'compare' ? '' : 'none' }}>
          <Compare tool={tool} list={list} />
        </div>
      </div>
    </>
  );
}
