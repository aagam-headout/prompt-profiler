import { TIPS } from '../constants.js';

// Pure CSS/HTML hover tooltip (see .info / .info::after in styles.css).
// No JS needed for the hover itself — just render the marker with a data-tip.
export default function InfoTip({ k, pos = '' }) {
  if (!TIPS[k]) return null;
  return <span className={`info ${pos}`} data-tip={TIPS[k]}></span>;
}
