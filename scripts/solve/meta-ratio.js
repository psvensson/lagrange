// Commit-level meta-to-product ratio — the retrospective's overhead trend line.
//
// The portfolio's process:product ratio counts QUESTS by class; this counts
// COMMITS by what they touch, which is the number a retrospective needs to see
// whether workflow bookkeeping is drowning product work. Classification is
// purely path-based per commit over a bounded window:
//
//   product   — touches src/, examples/, or charts/
//   test-only — otherwise touches test/
//   meta      — everything else (solve/, docs/, scripts/, config)
//
// A commit that touches both src/ and solve/ counts as product: the workflow
// deliberately co-locates a landing with its ledger update, and that is not
// overhead. The signal to watch is the pure-meta share trending up.

import {spawnSync} from 'node:child_process';

const GIT_LOG_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const COMMIT_SEPARATOR = '\u0000';
const DEFAULT_WINDOW_DAYS = 4;

const PRODUCT_PREFIXES = Object.freeze(['src/', 'examples/', 'charts/']);
const TEST_PREFIX = 'test/';

export function classifyCommitPaths(paths) {
  if (paths.some((p) => PRODUCT_PREFIXES.some((prefix) => p.startsWith(prefix)))) {
    return 'product';
  }
  if (paths.some((p) => p.startsWith(TEST_PREFIX))) return 'test-only';
  return 'meta';
}

function readCommitWindow(root, days) {
  const result = spawnSync('git', [
    'log', `--since=${days} days ago`, '--name-only',
    '--pretty=format:%x00%h %s',
  ], {cwd: root, encoding: 'utf8', maxBuffer: GIT_LOG_MAX_BUFFER_BYTES});
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    throw new Error(`git log failed: ${(result.stderr || 'unknown error').trim()}`);
  }
  return result.stdout.split(COMMIT_SEPARATOR).filter((block) => block.trim())
    .map((block) => {
      const lines = block.split('\n').filter((line) => line.trim());
      return {subject: lines[0] || '', paths: lines.slice(1)};
    });
}

export function buildMetaRatio(root, {days = DEFAULT_WINDOW_DAYS} = {}) {
  const commits = readCommitWindow(root, days);
  const tally = {'product': 0, 'test-only': 0, 'meta': 0};
  for (const commit of commits) {
    tally[classifyCommitPaths(commit.paths)] += 1;
  }
  const total = commits.length;
  const share = (count) => (total === 0 ? 0 : count / total);
  return {
    days,
    total,
    tally,
    shares: {
      product: share(tally.product),
      testOnly: share(tally['test-only']),
      meta: share(tally.meta),
    },
  };
}

function percent(fraction) {
  return `${Math.round(fraction * 100)}%`;
}

export function renderMetaRatio(ratio) {
  const {days, total, tally, shares} = ratio;
  const lines = [
    `# Commit meta-ratio — last ${days} day(s), ${total} commit(s)`,
    '',
    `- product (touches src/, examples/, charts/): ${tally.product} ` +
      `(${percent(shares.product)})`,
    `- test-only: ${tally['test-only']} (${percent(shares.testOnly)})`,
    `- meta (solve/, docs/, scripts/, config only): ${tally.meta} ` +
      `(${percent(shares.meta)})`,
    '',
  ];
  if (total > 0 && shares.meta > 0.5) {
    lines.push(
      '> meta share exceeds half of all commits in the window — worth a ' +
      'retrospective look at which bookkeeping can fold into landings.', '');
  }
  return lines.join('\n');
}

export function runMetaRatioCommand(root, args = {}) {
  const days = Number(args.days) > 0 ? Number(args.days) : DEFAULT_WINDOW_DAYS;
  return renderMetaRatio(buildMetaRatio(root, {days}));
}
