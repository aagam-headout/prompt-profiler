// Shared display constants ported 1:1 from the old inline <script> in
// public/index.html. Keep values in sync with lib/analyzer.js output shape.

export const RING = { r: 34, w: 8 };

export const clr = (v) => (v >= 66 ? 'var(--teal)' : v >= 45 ? 'var(--amber)' : 'var(--coral)');

export const NOTE = {
  technicalDepth: 'Vocabulary, tech density, path specificity, reasoning.',
  authenticityEngagement: 'Corrections, length variety, iteration vs one-liners.',
  independence: 'Question/command balance & reasoning.',
};

export const TITLE = {
  technicalDepth: 'Technical depth',
  authenticityEngagement: 'Authenticity / engagement',
  independence: 'Independence',
};

// Plain-language definitions of what every data point represents.
export const TIPS = {
  composite:
    'Unweighted average of the three signal scores. A rough single-number summary for sorting — not a validated grade.',
  technicalDepth:
    'How technical and specific the prompts read: vocabulary breadth, density of technical terms, file/path references, and reasoning words. High = detailed, domain-specific phrasing.',
  authenticityEngagement:
    'How much genuine back-and-forth the sessions show — corrections, varied prompt lengths, deep iteration, reasoning — vs a flat stream of one-liners. Measures engagement, NOT honesty.',
  independence:
    'Balance between asking to understand (questions) and dictating commands, plus reasoning cues. Both extremes score lower; a healthy mix scores higher.',
  corpus:
    'A session = one continuous conversation. Claude Code: one .jsonl file / sessionId. Cursor: one composer thread. Volume affects every ratio, so treat small corpora cautiously.',
  span: 'Calendar span from the first to the last timestamped prompt, and how many distinct days had activity. Only available where timestamps exist (Claude). Cursor stores no per-message timestamp.',
  sessionLen:
    'Average wall-clock minutes between the first and last prompt in a session (sessions with 2+ timestamped prompts).',
  distribution:
    'Prompts grouped by word count. A varied mix suggests the person adapts how they communicate; all-terse or all-long is more uniform.',
  techterms:
    'Recognized technical keywords ranked by how many prompts contain each. Hints at the domain and technical concreteness of the work.',
  fingerprint:
    'Stylistic tics that recur regardless of task — the words a person tends to open with, and their activity cadence over time.',
  samples:
    'Actual prompt text, sampled evenly across the whole corpus (not just recent). The numbers summarize; these let you judge for yourself.',
  // metrics
  avgPromptWords: 'Mean words per typed prompt across the full corpus.',
  medianPromptWords:
    'Middle prompt length — less skewed by a few very long prompts than the average.',
  vocabularyRichness:
    'Unique words ÷ total words (type-token ratio). Higher = more varied language. Naturally falls as the corpus grows, so compare like-sized corpora.',
  uniqueWords: 'Count of distinct words used across all prompts.',
  questionRatio:
    'Share of prompts that are questions (end with "?" or start with a question word).',
  correctionRatio:
    'Share of prompts with correction/retry language ("no", "actually", "still broken", "revert"). Signals hands-on debugging.',
  reasoningRatio:
    'Share of prompts using reasoning connectors ("because", "so that", "trade-off", "edge case").',
  politenessRatio:
    'Share of prompts with politeness markers ("please", "thanks"). Tone signal only.',
  codeBlockRatio: 'Share of prompts that paste fenced code blocks (```).',
  techTermsPerPrompt: 'Average number of recognized technical terms per prompt.',
  avgWordLength: 'Average characters per word — a rough proxy for vocabulary sophistication.',
  avgSentences:
    'Average number of sentences per prompt. Higher = more structured, multi-clause requests.',
  numericRefs:
    'Share of prompts containing digits (line numbers, versions, counts, error codes) — a specificity signal.',
  behavior:
    'How the person tends to interact, independent of topic: do they dictate or delegate, plan ahead, express urgency, correct, or thank? Tone & working-style signals, not skill.',
  tags: 'Each prompt is matched against domain keyword sets (it can hit several). Shows what kinds of work the sessions cover and where the person spends time.',
  models:
    'Which underlying models answered, by number of assistant turns. Reflects the tool/plan in use, not the person.',
  languages:
    'Programming languages of the files the agent actually wrote or edited (Claude: Write/Edit tools; Cursor: generated code blocks). Indicates the tech stack worked in.',
  tools:
    'Agent tools invoked across all sessions (Bash, Edit, Read, MCP tools…). Hints at workflow — heavy testing, browsing, git, etc.',
  hourly:
    'When prompts were sent, by hour of day (local time from timestamps). Shows working rhythm. Only available where timestamps exist (Claude).',
  percentile:
    'Where this score sits versus every other source analyzed (higher = above more peers). A raw score means little alone; this gives it context. Needs 3+ sources to show.',
  reliability:
    'How much to trust these scores, based on corpus size. Small corpora make ratios and vocabulary richness noisy — low reliability means read the prompts and weight the numbers lightly.',
  // compare columns
  cmpVolume:
    'Data volume: typed prompts and sessions behind the scores. Low volume = less reliable scores; not a quality signal itself.',
  cmpRanked:
    'The score the table is currently sorted by, shown as a bar for quick visual comparison.',
};

export const ordinal = (n) => {
  if (n == null) return '';
  const s = ['th', 'st', 'nd', 'rd'],
    v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const TOOL_NAMES = {
  claude: 'Claude Code',
  cursor: 'Cursor',
  codex: 'Codex',
  opencode: 'OpenCode',
};
