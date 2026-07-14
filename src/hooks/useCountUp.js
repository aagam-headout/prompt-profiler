import { useEffect, useRef, useState } from 'react';

// Animate a number from its last settled value up to `target` (easeOutCubic).
// Honors prefers-reduced-motion by snapping instantly.
export function useCountUp(target, duration = 650) {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const reduce =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = fromRef.current;
    if (reduce || from === target) {
      setValue(target);
      fromRef.current = target;
      return undefined;
    }
    const start = window.performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}
