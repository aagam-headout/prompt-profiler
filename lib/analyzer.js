// Heuristic prompting-style analysis.
//
// IMPORTANT: every score here is a HEURISTIC SIGNAL, not a validated measure of
// a person's ability. Prompting style varies with task, tooling familiarity,
// and mood. Treat output as "things a human reviewer should look at", never as
// an automated verdict. The formulas are intentionally transparent (each score
// ships its component breakdown) so a reviewer can judge whether a signal is
// meaningful for their context. Analysis always runs over the FULL prompt set.

const QUESTION_WORDS = [
  'how',
  'why',
  'what',
  'when',
  'where',
  'which',
  'who',
  'can',
  'could',
  'should',
  'would',
  'is',
  'are',
  'does',
  'do',
];
const POLITE = ['please', 'thanks', 'thank you', 'appreciate', 'kindly'];
const CORRECTION = [
  'no,',
  'nope',
  "that's wrong",
  'thats wrong',
  'not what',
  'actually',
  'instead',
  'undo',
  'revert',
  'i meant',
  'incorrect',
  "doesn't work",
  'still broken',
  'again',
  'wrong',
];
const REASONING = [
  'because',
  'since',
  'therefore',
  'so that',
  'in order to',
  'the reason',
  'given that',
  'assuming',
  'trade-off',
  'tradeoff',
  'edge case',
  'constraint',
  'however',
  'whereas',
  'depends',
];
// Curated technical vocabulary — meaningful engineering concepts, matched on
// word boundaries (so "orm" won't fire inside "transform"). Generic filler
// (const, return, type, null, object…) is intentionally excluded — it adds
// noise without signalling technical depth.
const TECH = [
  // core / language
  'function',
  'async',
  'await',
  'closure',
  'recursion',
  'generic',
  'enum',
  'interface',
  'immutable',
  'polymorphism',
  'abstraction',
  'higher-order',
  'coroutine',
  'iterator',
  // web / frontend
  'component',
  'hook',
  'state',
  'props',
  'render',
  'hydration',
  'ssr',
  'csr',
  'memoization',
  'reconciliation',
  'virtual dom',
  'debounce',
  'throttle',
  'lazy load',
  'accessibility',
  // backend / api
  'endpoint',
  'middleware',
  'webhook',
  'rest',
  'graphql',
  'grpc',
  'websocket',
  'rate limit',
  'idempotent',
  'pagination',
  'serialization',
  'api gateway',
  'microservice',
  'load balancer',
  // data
  'schema',
  'query',
  'migration',
  'transaction',
  'index',
  'foreign key',
  'orm',
  'sharding',
  'replication',
  'normalization',
  'cache',
  'cache invalidation',
  // concurrency / performance
  'concurrency',
  'mutex',
  'deadlock',
  'race condition',
  'thread',
  'latency',
  'throughput',
  'memoize',
  'bottleneck',
  'event loop',
  'backpressure',
  'queue',
  // reliability / errors
  'error',
  'exception',
  'stack trace',
  'memory leak',
  'timeout',
  'retry',
  'fallback',
  'circuit breaker',
  'idempotency',
  'graceful shutdown',
  'null pointer',
  // architecture / patterns
  'dependency injection',
  'singleton',
  'factory',
  'observer',
  'pub/sub',
  'pipeline',
  'state machine',
  'monorepo',
  'feature flag',
  'refactor',
  'abstraction layer',
  // infra / devops
  'docker',
  'kubernetes',
  'container',
  'terraform',
  'ci/cd',
  'deploy',
  'autoscale',
  'ingress',
  'env var',
  'cron',
  // security
  'auth',
  'oauth',
  'jwt',
  'token',
  'sanitize',
  'injection',
  'xss',
  'csrf',
  'encryption',
  'hashing',
  // tooling / vcs
  'commit',
  'branch',
  'merge',
  'rebase',
  'cherry-pick',
  'squash',
  'lint',
  'typecheck',
  'bundle',
  'tree shaking',
  'regex',
  'mock',
  'fixture',
  'assertion',
  'coverage',
  'snapshot',
  'dependency',
];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TECH_RE = TECH.map((t) => [t, new RegExp('\\b' + escapeRe(t) + '\\b', 'i')]);

// Behavioral marker vocabularies.
const IMPERATIVE = [
  'add',
  'fix',
  'create',
  'make',
  'implement',
  'update',
  'remove',
  'delete',
  'change',
  'build',
  'write',
  'refactor',
  'move',
  'rename',
  'use',
  'run',
  'install',
  'set',
  'generate',
  'convert',
  'update',
  'check',
  'show',
];
const URGENCY = [
  'asap',
  'urgent',
  'quickly',
  'right now',
  'immediately',
  'hurry',
  'need this now',
  'time-sensitive',
];
const FRUSTRATION = [
  'still not',
  'still broken',
  'ugh',
  'wtf',
  'why is this',
  "doesn't work",
  'not working',
  'frustrat',
  'annoying',
  'stuck',
  'come on',
  'seriously',
];
const AUTONOMY = [
  'you decide',
  'your call',
  'whatever you think',
  'up to you',
  'use your judgment',
  'best approach',
  'you choose',
  'what do you think',
  'your recommendation',
  'whatever is best',
];
const PLANNING = [
  'first',
  'then',
  'step 1',
  'step 2',
  'plan',
  'approach',
  'strategy',
  'phase',
  'next we',
  'after that',
  'finally',
  'before we',
];
const GRATITUDE = [
  'thanks',
  'thank you',
  'appreciate',
  'great job',
  'nice',
  'perfect',
  'awesome',
  'lgtm',
  'works',
];

// Domain / topic tagging. A prompt can match multiple categories.
const CATEGORIES = {
  Frontend: [
    'css',
    'html',
    'react',
    'component',
    'ui',
    'button',
    'style',
    'tailwind',
    'layout',
    'render',
    'dom',
    'jsx',
    'tsx',
    'frontend',
    'modal',
    'responsive',
    'animation',
    'svg',
  ],
  Backend: [
    'api',
    'endpoint',
    'server',
    'route',
    'controller',
    'service',
    'middleware',
    'request',
    'response',
    'backend',
    'express',
    'fastapi',
    'handler',
    'webhook',
  ],
  Database: [
    'database',
    'sql',
    'query',
    'schema',
    'migration',
    'table',
    'postgres',
    'mongo',
    'redis',
    'index',
    'join',
    'orm',
    'prisma',
    'column',
  ],
  Testing: [
    'test',
    'jest',
    'spec',
    'coverage',
    'mock',
    'assert',
    'vitest',
    'pytest',
    'e2e',
    'unit test',
    'integration test',
  ],
  Debugging: [
    'error',
    'bug',
    'crash',
    'stack trace',
    'undefined',
    'exception',
    'fails',
    'failing',
    'broken',
    'not working',
    'debug',
    'traceback',
  ],
  Refactoring: [
    'refactor',
    'clean up',
    'cleanup',
    'extract',
    'simplify',
    'restructure',
    'dedupe',
    'reorganize',
    'rename',
  ],
  DevOps: [
    'deploy',
    'docker',
    'kubernetes',
    'k8s',
    'pipeline',
    'ci/cd',
    'vercel',
    'aws',
    'container',
    'helm',
    'terraform',
    'nginx',
  ],
  Git: [
    'git',
    'commit',
    'rebase',
    'pull request',
    'pr',
    'merge conflict',
    'stash',
    'checkout',
    'cherry-pick',
    'squash',
  ],
  Docs: [
    'readme',
    'docstring',
    'documentation',
    'document the',
    'comment',
    'explain the',
    'changelog',
  ],
  'AI/ML': [
    'llm',
    'embedding',
    'gpt',
    'claude',
    'openai',
    'anthropic',
    'vector',
    'rag',
    'fine-tune',
    'inference',
    'prompt',
    'agent',
  ],
  Security: [
    'auth',
    'password',
    'secret',
    'encrypt',
    'vulnerability',
    'xss',
    'csrf',
    'permission',
    'oauth',
    'jwt',
    'sanitize',
  ],
  Performance: [
    'performance',
    'slow',
    'optimize',
    'latency',
    'memory leak',
    'bottleneck',
    'speed up',
    'throughput',
    'lag',
  ],
  Config: [
    'config',
    'setup',
    'install',
    'dependency',
    'package.json',
    'npm',
    'yarn',
    'pnpm',
    'tsconfig',
    'env var',
    'settings',
  ],
};
// Precompiled word-boundary matcher per category — robust against substring
// false positives (e.g. "orm" inside "transform", "pr" inside "print").
const CATEGORY_RE = Object.entries(CATEGORIES).map(([cat, kws]) => [
  cat,
  new RegExp('\\b(?:' + kws.map(escapeRe).join('|') + ')\\b', 'i'),
]);

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const words = (s) => s.toLowerCase().match(/[a-z0-9'+\-#.]+/g) || [];
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const containsAny = (t, list) => list.some((k) => t.includes(k));

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

export function analyze(prompts, sessionCount) {
  const typed = prompts.filter((p) => !p.isSlash);
  const n = typed.length;

  if (n === 0) {
    return {
      empty: true,
      message: 'No human-typed prompts found (only slash commands / tool traffic).',
    };
  }

  const lens = typed.map((p) => words(p.text).length);
  const totalWords = lens.reduce((a, b) => a + b, 0);
  const avgLen = totalWords / n;
  const medLen = median(lens);

  const allWords = typed.flatMap((p) => words(p.text));
  const uniq = new Set(allWords).size;
  const ttr = totalWords ? uniq / totalWords : 0;

  let questions = 0,
    polite = 0,
    corrections = 0,
    reasoning = 0,
    codeBlocks = 0,
    hasPath = 0,
    techHits = 0,
    oneLiners = 0,
    emoji = 0,
    imperative = 0,
    urgency = 0,
    frustration = 0,
    autonomy = 0,
    planning = 0,
    gratitude = 0,
    multiPart = 0,
    hasNumbers = 0,
    sentencesTotal = 0,
    charsTotal = 0;

  const lengthBuckets = { terse: 0, short: 0, medium: 0, long: 0 };
  const firstWords = {};
  const techTermCounts = {};
  const tagCounts = {};
  const perSession = {};
  const perDay = {};
  const perHour = new Array(24).fill(0);
  const sessionTimes = {};
  let anyTs = false,
    minTs = Infinity,
    maxTs = -Infinity;

  for (const p of typed) {
    const raw = p.text;
    const t = raw.toLowerCase();
    const w = words(raw);

    if (raw.includes('?') || QUESTION_WORDS.includes(w[0])) questions++;
    if (containsAny(t, POLITE)) polite++;
    if (containsAny(t, CORRECTION)) corrections++;
    if (containsAny(t, REASONING)) reasoning++;
    if (raw.includes('```')) codeBlocks++;
    if (/[/~][\w.-]+\/[\w.-]+/.test(raw) || /\.\w{1,5}\b/.test(raw)) hasPath++;
    for (const [term, re] of TECH_RE)
      if (re.test(raw)) {
        techHits++;
        techTermCounts[term] = (techTermCounts[term] || 0) + 1;
      }
    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(raw)) emoji++;

    const wl = w.length;
    if (wl <= 3) {
      lengthBuckets.terse++;
      oneLiners++;
    } else if (wl <= 12) lengthBuckets.short++;
    else if (wl <= 40) lengthBuckets.medium++;
    else lengthBuckets.long++;

    const fw = (w[0] || '').replace(/[^a-z]/g, '');
    if (fw) firstWords[fw] = (firstWords[fw] || 0) + 1;

    // behavioral markers
    if (IMPERATIVE.includes(fw)) imperative++;
    if (containsAny(t, URGENCY)) urgency++;
    if (containsAny(t, FRUSTRATION)) frustration++;
    if (containsAny(t, AUTONOMY)) autonomy++;
    if (containsAny(t, PLANNING)) planning++;
    if (containsAny(t, GRATITUDE)) gratitude++;
    if (
      /\n\s*\d+[.)]/.test(raw) ||
      /\n\s*[-*]\s/.test(raw) ||
      t.split(/\band\b|\balso\b|;/).length - 1 >= 3
    )
      multiPart++;
    if (/\d/.test(raw)) hasNumbers++;
    sentencesTotal += raw.split(/[.!?]+/).filter((x) => x.trim().length > 1).length || 1;
    charsTotal += w.join('').length;

    // domain / keyword tagging (word-boundary matched; one hit per category per prompt)
    for (const [cat, re] of CATEGORY_RE) {
      if (re.test(raw)) tagCounts[cat] = (tagCounts[cat] || 0) + 1;
    }

    const sid = p.session || 'unknown';
    perSession[sid] = (perSession[sid] || 0) + 1;

    if (p.ts) {
      const tms = Date.parse(p.ts);
      if (!Number.isNaN(tms)) {
        anyTs = true;
        perDay[p.ts.slice(0, 10)] = (perDay[p.ts.slice(0, 10)] || 0) + 1;
        const h = new Date(tms).getHours();
        perHour[h]++;
        if (tms < minTs) minTs = tms;
        if (tms > maxTs) maxTs = tms;
        const st = sessionTimes[sid] || (sessionTimes[sid] = { min: tms, max: tms });
        st.min = Math.min(st.min, tms);
        st.max = Math.max(st.max, tms);
      }
    }
  }

  const ratio = (x) => x / n;
  const iterationDepth = n / Math.max(1, sessionCount);

  // ---- Composite signals (0-100) with transparent component breakdown ----
  const mk = (parts) => {
    const value = clamp(parts.reduce((a, c) => a + c.v, 0));
    return { value, breakdown: parts.map((p) => ({ label: p.label, points: Math.round(p.v) })) };
  };

  const depth = mk([
    { label: 'Vocabulary richness', v: ttr * 90 },
    { label: 'Technical density', v: (Math.min(techHits / n, 3) / 3) * 30 },
    { label: 'File/path specificity', v: ratio(hasPath) * 20 },
    { label: 'Reasoning cues', v: ratio(reasoning) * 25 },
    { label: 'Prompt substance (length)', v: Math.min(avgLen / 40, 1) * 15 },
  ]);

  const lenVariety = median(lens) ? Math.min(stddev(lens) / (avgLen || 1), 1) : 0;
  const authenticity = mk([
    { label: 'Corrections / follow-ups', v: ratio(corrections) * 60 },
    { label: 'Length variety', v: lenVariety * 30 },
    { label: 'Iteration depth', v: Math.min(iterationDepth / 8, 1) * 25 },
    { label: 'Not just one-liners', v: (1 - Math.min(ratio(oneLiners), 1)) * 20 },
    { label: 'Reasoning cues', v: ratio(reasoning) * 15 },
  ]);

  const qr = ratio(questions);
  const independence = mk([
    { label: 'Question/command balance', v: (1 - Math.abs(qr - 0.35) / 0.65) * 60 },
    { label: 'Reasoning cues', v: ratio(reasoning) * 40 },
  ]);

  const composite = Math.round((depth.value + authenticity.value + independence.value) / 3);

  // Reliability: how much to trust the scores, driven by corpus volume. Small
  // corpora make ratios and vocabulary richness noisy, so flag them explicitly.
  const reliability =
    n >= 300
      ? { level: 'high', note: 'Large corpus — scores are comparatively stable.' }
      : n >= 60
        ? { level: 'medium', note: 'Moderate corpus — treat scores as directional, not precise.' }
        : {
            level: 'low',
            note: 'Small corpus — scores are noisy; read the prompts directly and weight lightly.',
          };

  const topStarters = Object.entries(firstWords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w, c]) => ({ word: w, count: c, pct: Math.round((c / n) * 100) }));

  const topTechTerms = Object.entries(techTermCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term, c]) => ({ term, count: c, pct: Math.round((c / n) * 100) }));

  const sessionSizes = Object.values(perSession);
  const durs = Object.values(sessionTimes)
    .map((s) => (s.max - s.min) / 60000)
    .filter((x) => x > 0);
  const sessionStats = {
    count: sessionSizes.length,
    avgPromptsPerSession: +(n / Math.max(1, sessionSizes.length)).toFixed(1),
    maxPromptsInSession: sessionSizes.length ? Math.max(...sessionSizes) : 0,
    singlePromptSessions: sessionSizes.filter((x) => x === 1).length,
    avgDurationMin: durs.length
      ? +(durs.reduce((a, b) => a + b, 0) / durs.length).toFixed(0)
      : null,
    longestSessionMin: durs.length ? +Math.max(...durs).toFixed(0) : null,
  };

  const dayMs = 86400000;
  const span =
    anyTs && Number.isFinite(minTs)
      ? {
          first: new Date(minTs).toISOString().slice(0, 10),
          last: new Date(maxTs).toISOString().slice(0, 10),
          days: Math.round((maxTs - minTs) / dayMs) + 1,
          activeDays: Object.keys(perDay).length,
        }
      : null;

  const timeline = Object.entries(perDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  return {
    empty: false,
    counts: {
      typedPrompts: n,
      slashCommands: prompts.length - n,
      sessions: sessionCount,
      totalWords,
    },
    metrics: {
      avgPromptWords: +avgLen.toFixed(1),
      medianPromptWords: medLen,
      vocabularyRichness: +(ttr * 100).toFixed(1),
      uniqueWords: uniq,
      questionRatio: +(qr * 100).toFixed(1),
      correctionRatio: +(ratio(corrections) * 100).toFixed(1),
      reasoningRatio: +(ratio(reasoning) * 100).toFixed(1),
      politenessRatio: +(ratio(polite) * 100).toFixed(1),
      codeBlockRatio: +(ratio(codeBlocks) * 100).toFixed(1),
      techTermsPerPrompt: +(techHits / n).toFixed(2),
      iterationDepth: +iterationDepth.toFixed(1),
      emojiPrompts: emoji,
      avgWordLength: +(charsTotal / Math.max(1, totalWords)).toFixed(2),
      avgSentences: +(sentencesTotal / n).toFixed(1),
      numericRefs: +(ratio(hasNumbers) * 100).toFixed(1),
    },
    behavior: [
      {
        label: 'Imperative / directive',
        key: 'imperative',
        pct: +(ratio(imperative) * 100).toFixed(1),
      },
      { label: 'Multi-part requests', key: 'multiPart', pct: +(ratio(multiPart) * 100).toFixed(1) },
      { label: 'Planning language', key: 'planning', pct: +(ratio(planning) * 100).toFixed(1) },
      { label: 'Delegates judgment', key: 'autonomy', pct: +(ratio(autonomy) * 100).toFixed(1) },
      { label: 'Urgency', key: 'urgency', pct: +(ratio(urgency) * 100).toFixed(1) },
      { label: 'Frustration', key: 'frustration', pct: +(ratio(frustration) * 100).toFixed(1) },
      { label: 'Gratitude / praise', key: 'gratitude', pct: +(ratio(gratitude) * 100).toFixed(1) },
    ],
    tags: Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count, pct: Math.round((count / n) * 100) })),
    hourly: anyTs ? perHour.map((count, hour) => ({ hour, count })) : [],
    scores: {
      technicalDepth: depth.value,
      authenticityEngagement: authenticity.value,
      independence: independence.value,
      composite,
    },
    reliability,
    breakdowns: {
      technicalDepth: depth.breakdown,
      authenticityEngagement: authenticity.breakdown,
      independence: independence.breakdown,
    },
    distribution: [
      { label: 'Terse (≤3w)', key: 'terse', count: lengthBuckets.terse },
      { label: 'Short (4–12w)', key: 'short', count: lengthBuckets.short },
      { label: 'Medium (13–40w)', key: 'medium', count: lengthBuckets.medium },
      { label: 'Long (40w+)', key: 'long', count: lengthBuckets.long },
    ],
    topTechTerms,
    sessionStats,
    span,
    timeline,
    fingerprint: {
      topStarters,
      politeness: polite > n * 0.15 ? 'courteous' : polite > 0 ? 'occasional' : 'blunt',
      style: styleLabel(avgLen, qr, ratio(corrections)),
    },
    verdict: verdict(
      composite,
      depth.value,
      authenticity.value,
      independence.value,
      sessionStats,
      n
    ),
  };
}

function styleLabel(avgLen, qr, corr) {
  const parts = [];
  parts.push(avgLen > 25 ? 'verbose / detailed' : avgLen > 10 ? 'balanced' : 'terse / directive');
  if (qr > 0.5) parts.push('inquisitive');
  if (corr > 0.25) parts.push('iterative / hands-on');
  return parts.join(', ');
}

function verdict(comp, d, a, i, s, n) {
  const band = comp >= 66 ? 'Strong' : comp >= 45 ? 'Moderate' : 'Light';
  const lead =
    d >= a && d >= i ? 'technical depth' : a >= i ? 'hands-on engagement' : 'balanced dialogue';
  const vol = n >= 300 ? 'a large corpus' : n >= 60 ? 'a moderate corpus' : 'a small corpus';
  return (
    `${band} overall signal from ${vol} (${n} prompts across ${s.count} sessions). ` +
    `Leans toward ${lead}. Read the prompt samples below before drawing conclusions — these are signals, not scores of the person.`
  );
}
