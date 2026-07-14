import { useEffect, useRef } from 'react';

// Cursor-following tooltip for graph bars / lines (reliable, unlike native
// title). Elements opt in via a `data-g="tooltip text"` attribute; this
// component just drives the single shared #gtip box based on mousemove.
export default function GTip() {
  const ref = useRef(null);

  useEffect(() => {
    const onMove = (e) => {
      const el = e.target.closest && e.target.closest('[data-g]');
      const box = ref.current;
      if (!box) return;
      if (!el) {
        box.classList.remove('on');
        return;
      }
      box.textContent = el.getAttribute('data-g');
      box.classList.add('on');
      const pad = 14,
        w = box.offsetWidth,
        h = box.offsetHeight;
      let x = e.clientX + pad,
        y = e.clientY + pad;
      if (x + w > window.innerWidth - 8) x = e.clientX - w - pad;
      if (y + h > window.innerHeight - 8) y = e.clientY - h - pad;
      box.style.left = x + 'px';
      box.style.top = y + 'px';
    };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  return <div id="gtip" ref={ref}></div>;
}
