import { RING, clr } from '../constants.js';
import { useCountUp } from '../hooks/useCountUp.js';

export function Ring({ val }) {
  const shown = useCountUp(val);
  const c = 2 * Math.PI * RING.r;
  const off = c * (1 - shown / 100);
  return (
    <svg width="92" height="92" viewBox="0 0 92 92">
      <circle cx="46" cy="46" r={RING.r} fill="none" stroke="#0c0d10" strokeWidth={RING.w} />
      <circle
        cx="46"
        cy="46"
        r={RING.r}
        fill="none"
        stroke={clr(val)}
        strokeWidth={RING.w}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform="rotate(-90 46 46)"
      />
      <text
        x="46"
        y="46"
        textAnchor="middle"
        dominantBaseline="central"
        className="ring-center"
        fill="var(--fg)"
      >
        {shown}
      </text>
    </svg>
  );
}

// Plain animated integer (used for the composite hero number).
export function CountNum({ n }) {
  return <>{useCountUp(n)}</>;
}
