// Shimmer placeholders shown while a request is in flight, so the layout holds
// its shape instead of collapsing to a single line of status text.

function Block({ h = 16, w = '100%', r = 6, style }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r, ...style }} />;
}

export function ProfileSkeleton() {
  return (
    <div className="skel-wrap" aria-hidden="true">
      <div className="hdr">Signal scores</div>
      <div className="gauges">
        <div className="gauge hero">
          <Block h={18} w="55%" />
          <Block h={46} w="70%" style={{ marginTop: 16 }} />
          <Block h={13} w="85%" style={{ marginTop: 16 }} />
        </div>
        {[0, 1, 2].map((i) => (
          <div className="gauge" key={i} style={{ textAlign: 'center' }}>
            <Block h={13} w="60%" style={{ margin: '0 auto' }} />
            <div className="skel skel-ring" />
            <Block h={12} w="75%" style={{ margin: '8px auto 0' }} />
          </div>
        ))}
      </div>

      <div className="hdr">Corpus</div>
      <div className="strip">
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="stat" key={i}>
            <Block h={28} w="50%" />
            <Block h={11} w="80%" style={{ marginTop: 10 }} />
          </div>
        ))}
      </div>

      <div className="two" style={{ marginTop: 16 }}>
        {[0, 1].map((i) => (
          <div key={i}>
            <div className="hdr">&nbsp;</div>
            <div className="card">
              {Array.from({ length: 6 }).map((_, j) => (
                <Block key={j} h={14} w={`${88 - j * 9}%`} style={{ marginBottom: 14 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CompareSkeleton({ rows = 4 }) {
  return (
    <div className="card skel-wrap" aria-hidden="true" style={{ marginTop: 22 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Block key={i} h={32} style={{ marginBottom: 12 }} />
      ))}
    </div>
  );
}
