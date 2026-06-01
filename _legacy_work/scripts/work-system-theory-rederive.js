#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  parsePackageFile,
  filterAndSummarizeHistory,
  detectCompositionalSignals,
  packageIsRederive,
} from './work-frontier-history.js';

const ENCODING_UTF8 = 'utf8';
const EXIT_SUCCESS = 0;
const EXIT_USAGE = 1;
const EXIT_FAILURE = 2;

const HELP_TEXT = [
  'Usage: npm run work:system-theory:rederive -- --owner <owner> --boundary <boundary> [options]',
  '       npm run work:system-theory:rederive -- --check-due --sprint <active-sprint.md> [--threshold <n>]',
  '',
  'Mode 1 (analysis): consumes compositional signals from frontier history and emits a',
  'structured systemTheory revision recommendation. When --write is supplied alongside',
  '--sprint, stamps a new `systemTheoryRederivedAt` date on the active sprint header.',
  '',
  'Mode 2 (gate): with --check-due, counts sprint-linked done packages after',
  'the latest closed rederive checkpoint when available; otherwise falls back',
  'to done-* packages dated >= the sprint `systemTheoryRederivedAt` stamp.',
  '',
  'Options:',
  '  --owner <name>          Owner key to filter history (required for analysis).',
  '  --boundary <name>       Boundary key to filter history (required for analysis).',
  '  --limit <n>             History window size (default 12).',
  '  --package-dir <dir>     Package directory (default work/packages).',
  '  --sprint <path>         Active sprint markdown path; required for --write or --check-due.',
  '  --write                 Write systemTheoryRederivedAt back into the sprint file.',
  '  --refresh               Force-refresh: emit recommendation even without compositional signal.',
  '  --check-due             Gate mode: exit non-zero when rederivation is overdue.',
  '  --threshold <n>         Closed-package threshold for --check-due (default 5).',
  '  --json                  Emit machine-readable JSON.',
].join('\n');

function parseCli(args) {
  const out = {
    owner: '', boundary: '', limit: 12,
    packageDir: 'work/packages', sprint: '',
    write: false, refresh: false, json: false, help: false,
    checkDue: false, threshold: 5,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-h' || a === '--help') out.help = true;
    else if (a === '--owner') out.owner = args[++i] || '';
    else if (a === '--boundary') out.boundary = args[++i] || '';
    else if (a === '--limit') out.limit = parseInt(args[++i], 10) || 12;
    else if (a === '--package-dir') out.packageDir = args[++i] || out.packageDir;
    else if (a === '--sprint') out.sprint = args[++i] || '';
    else if (a === '--write') out.write = true;
    else if (a === '--refresh') out.refresh = true;
    else if (a === '--json') out.json = true;
    else if (a === '--check-due') out.checkDue = true;
    else if (a === '--threshold') out.threshold = parseInt(args[++i], 10) || 5;
  }
  return out;
}

function readSprintRederivedAt(sprintPath) {
  if (!sprintPath || !fs.existsSync(sprintPath)) return null;
  const content = fs.readFileSync(sprintPath, ENCODING_UTF8);
  const match = content.match(/^systemTheoryRederivedAt:\s*(\d{4}-\d{2}-\d{2})/m);
  return match ? match[1] : null;
}

function countClosedPackagesSince(packageDir, isoDate) {
  if (!isoDate) return null;
  const sinceKey = isoDate.replace(/-/g, '');
  const resolved = path.resolve(packageDir);
  if (!fs.existsSync(resolved)) return 0;
  const files = fs.readdirSync(resolved);
  return files.filter((f) => {
    if (!f.startsWith('done-')) return false;
    const m = f.match(/^done-(\d{8})-/);
    return m && m[1] >= sinceKey;
  }).length;
}

function packageDateKey(fileName) {
  const match = String(fileName || '').match(/^done-(\d{8})-/u);
  return match ? match[1] : '';
}

function readSprintPackageQueue(sprintPath) {
  if (!sprintPath || !fs.existsSync(sprintPath)) return [];
  const content = fs.readFileSync(sprintPath, ENCODING_UTF8);
  const packageLinks = [];
  const seen = new Set();
  const linkPattern =
    /\]\((?:\.\.\/)?packages\/([^)\s#]+?\.md)(?:#[^)]*)?\)/giu;
  let match;
  while ((match = linkPattern.exec(content)) !== null) {
    const fileName = path.basename(match[1]);
    if (!/^(?:done|active|todo|superseded)-.+\.md$/u.test(fileName)) {
      continue;
    }
    if (seen.has(fileName)) continue;
    seen.add(fileName);
    packageLinks.push(fileName);
  }
  return packageLinks;
}

function parseQueuePackage(packageDir, fileName) {
  const packagePath = path.join(path.resolve(packageDir), fileName);
  const parsed = fs.existsSync(packagePath) ? parsePackageFile(packagePath) : null;
  return parsed || {
    fileName,
    package: fileName,
    status: fileName.split('-')[0] || 'unknown',
    lane: 'unknown',
  };
}

function latestSprintRederiveCheckpoint(packageDir, sprintPath, isoDate) {
  const sinceKey = isoDate ? isoDate.replace(/-/g, '') : '';
  const queue = readSprintPackageQueue(sprintPath);
  let checkpoint = null;
  for (let index = 0; index < queue.length; index++) {
    const fileName = queue[index];
    if (!fileName.startsWith('done-')) continue;
    const dateKey = packageDateKey(fileName);
    if (sinceKey && dateKey && dateKey < sinceKey) continue;
    const parsed = parseQueuePackage(packageDir, fileName);
    if (parsed.status !== 'done') continue;
    if (!packageIsRederive({...parsed, package: fileName, fileName})) continue;
    checkpoint = {fileName, index, dateKey: dateKey || 'unknown'};
  }
  return checkpoint;
}

function countClosedSprintPackagesAfter(packageDir, sprintPath, checkpointIndex) {
  const queue = readSprintPackageQueue(sprintPath);
  if (checkpointIndex < 0 || checkpointIndex >= queue.length) return null;
  return queue.slice(checkpointIndex + 1).filter((fileName) => {
    if (!fileName.startsWith('done-')) return false;
    const parsed = parseQueuePackage(packageDir, fileName);
    return parsed.status === 'done';
  }).length;
}

function checkRederivationDue({packageDir, sprintPath, isoDate, threshold}) {
  const checkpoint = latestSprintRederiveCheckpoint(packageDir, sprintPath, isoDate);
  if (checkpoint) {
    const count = countClosedSprintPackagesAfter(
      packageDir,
      sprintPath,
      checkpoint.index,
    );
    return {
      mode: 'latest-sprint-rederive',
      closedPackagesSince: count,
      checkpointPackage: checkpoint.fileName,
      checkpointDate: checkpoint.dateKey,
      threshold,
      rederivationDue: count >= threshold,
    };
  }
  const count = countClosedPackagesSince(packageDir, isoDate);
  return {
    mode: 'date-prefix',
    closedPackagesSince: count,
    checkpointPackage: null,
    checkpointDate: isoDate,
    threshold,
    rederivationDue: count >= threshold,
  };
}

function buildRecommendation({owner, boundary, signals, history}) {
  const mechanismsSeen = Array.from(new Set(
    history.map((h) => h.failureMechanism).filter(Boolean),
  ));
  const distinctOwners = Array.from(new Set(
    history.map((h) => h.owner).filter(Boolean),
  ));
  const scaffold = {
    proposedSystemTheoryRevision: {
      problemStatement:
        `Frontier history on ${owner}/${boundary} shows a saturation pattern ` +
        'that single-slice work cannot resolve; revise the whole-system theory ' +
        'before promoting any further local mechanism patch.',
      stableFactsToReconfirm: [
        `owner=${owner}`,
        `boundary=${boundary}`,
        `recent mechanisms observed: ${mechanismsSeen.slice(0, 5).join(', ') || 'unknown'}`,
        `distinct owners touched: ${distinctOwners.length}`,
      ],
      compositionalSignals: signals,
      requiredNewFields: [
        'wholeSystemInvariants (list form) with coupledWith populated when the ' +
          'signal is compositional-pair-alternation or emergent-class-present',
        'transitionTable rows covering every owner mentioned in distinctOwners',
        'architectureGapTriggers explicitly enumerating the saturation pattern',
      ],
      candidateLayers: [
        'protocol (if protocol_mismatch or contract_gap+ownership_gap signal)',
        'scheduling (if same-mechanism-repeat on scheduling_gap)',
        'topology (if emergent_oscillation signal)',
        'model (if no slice can be selected and a modelTheory package is warranted)',
      ],
      promotionRule:
        'No local-slice runtime package may be opened on ' +
        `${owner}/${boundary} with mechanism in {${mechanismsSeen.join(', ')}} ` +
        'until this revision is recorded as the active sprint systemTheory.',
    },
  };
  return scaffold;
}

function stampSprint(sprintPath) {
  const content = fs.readFileSync(sprintPath, ENCODING_UTF8);
  const stamp = new Date().toISOString().slice(0, 10);
  const stampLine = `systemTheoryRederivedAt: ${stamp}`;
  let updated;
  if (/^systemTheoryRederivedAt:\s*\S+/m.test(content)) {
    updated = content.replace(
      /^systemTheoryRederivedAt:\s*\S+/m,
      stampLine,
    );
  } else if (/^Status:\s*[^\n]+\n/m.test(content)) {
    updated = content.replace(
      /^(Status:\s*[^\n]+\n)/m,
      `$1${stampLine}\n`,
    );
  } else {
    updated = `${stampLine}\n\n${content}`;
  }
  fs.writeFileSync(sprintPath, updated, ENCODING_UTF8);
  return stamp;
}

function loadHistory(packageDir, owner, boundary, limit) {
  const resolvedDir = path.resolve(packageDir);
  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Package directory does not exist: ${packageDir}`);
  }
  const files = fs.readdirSync(resolvedDir);
  const mdFiles = files.filter((f) =>
    f.endsWith('.md') &&
    (f.startsWith('done-') || f.startsWith('active-') ||
     f.startsWith('todo-') || f.startsWith('superseded-')),
  );
  const parsed = mdFiles
    .map((f) => parsePackageFile(path.join(resolvedDir, f)))
    .filter(Boolean);
  return filterAndSummarizeHistory(parsed, owner, boundary, limit);
}

function main(argv) {
  const opts = parseCli(argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${HELP_TEXT}\n`);
    return EXIT_SUCCESS;
  }
  if (opts.checkDue) {
    if (!opts.sprint) {
      process.stderr.write('--check-due requires --sprint <path>.\n');
      return EXIT_USAGE;
    }
    try {
      const stamp = readSprintRederivedAt(path.resolve(opts.sprint));
      if (!stamp) {
        const msg = {
          sprint: opts.sprint,
          rederivationDue: false,
          reason: 'sprint has no systemTheoryRederivedAt; opt-in gate inactive.',
        };
        process.stdout.write(opts.json
          ? `${JSON.stringify(msg, null, 2)}\n`
          : `Sprint ${opts.sprint}: no systemTheoryRederivedAt; gate inactive.\n`);
        return EXIT_SUCCESS;
      }
      const dueState = checkRederivationDue({
        packageDir: opts.packageDir,
        sprintPath: path.resolve(opts.sprint),
        isoDate: stamp,
        threshold: opts.threshold,
      });
      const count = dueState.closedPackagesSince;
      const due = dueState.rederivationDue;
      const checkpointDescription = dueState.checkpointPackage
        ? `latest systemTheory rederive ${dueState.checkpointPackage}`
        : stamp;
      const msg = {
        sprint: opts.sprint,
        systemTheoryRederivedAt: stamp,
        checkpointMode: dueState.mode,
        checkpointPackage: dueState.checkpointPackage,
        closedPackagesSince: count,
        threshold: opts.threshold,
        rederivationDue: due,
        reason: due
          ? `${count} closed packages since ${checkpointDescription} ` +
            `(threshold ${opts.threshold}); ` +
            'open a systemTheory revision package before activating the next slice.'
          : `${count} closed packages since ${checkpointDescription} ` +
            `(under threshold ${opts.threshold}).`,
      };
      process.stdout.write(opts.json
        ? `${JSON.stringify(msg, null, 2)}\n`
        : `${msg.reason}\n`);
      return due ? EXIT_FAILURE : EXIT_SUCCESS;
    } catch (err) {
      process.stderr.write(`Error: ${err.message}\n`);
      return EXIT_FAILURE;
    }
  }
  if (!opts.owner || !opts.boundary) {
    process.stderr.write(`${HELP_TEXT}\n`);
    return EXIT_USAGE;
  }
  try {
    const history = loadHistory(
      opts.packageDir, opts.owner, opts.boundary, opts.limit,
    );
    const signals = detectCompositionalSignals(history);
    if (signals.length === 0 && !opts.refresh) {
      const msg = {
        owner: opts.owner,
        boundary: opts.boundary,
        rederivationRequired: false,
        reason: 'No compositional signal detected on this owner/boundary; ' +
          'continue local slice work.',
      };
      process.stdout.write(opts.json
        ? `${JSON.stringify(msg, null, 2)}\n`
        : `No rederivation required for ${opts.owner}/${opts.boundary}.\n`);
      return EXIT_SUCCESS;
    }
    const recommendation = buildRecommendation({
      owner: opts.owner,
      boundary: opts.boundary,
      signals,
      history,
    });
    const result = {
      owner: opts.owner,
      boundary: opts.boundary,
      rederivationRequired: true,
      historyWindow: history.length,
      compositionalSignals: signals,
      recommendation,
    };
    if (opts.write && opts.sprint) {
      const stamp = stampSprint(path.resolve(opts.sprint));
      result.sprintStampedAt = stamp;
      result.sprintPath = opts.sprint;
    } else if (opts.write && !opts.sprint) {
      result.warning = '--write requires --sprint <path>; sprint not stamped.';
    }
    process.stdout.write(opts.json
      ? `${JSON.stringify(result, null, 2)}\n`
      : renderText(result));
    return EXIT_SUCCESS;
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    return EXIT_FAILURE;
  }
}

function renderText(result) {
  const lines = [
    '================================================================================',
    `  SYSTEM-THEORY REDERIVE: ${result.owner} / ${result.boundary}`,
    '================================================================================',
    `History window: ${result.historyWindow}`,
    `Rederivation required: ${result.rederivationRequired}`,
    '',
    'Compositional signals:',
  ];
  for (const sig of result.compositionalSignals) {
    lines.push(`  - [${sig.pattern}] ${sig.mechanism}`);
    lines.push(`      ${sig.reason}`);
  }
  const rev = result.recommendation.proposedSystemTheoryRevision;
  lines.push('');
  lines.push('Proposed systemTheory revision:');
  lines.push(`  problemStatement: ${rev.problemStatement}`);
  lines.push('  stableFactsToReconfirm:');
  for (const f of rev.stableFactsToReconfirm) lines.push(`    - ${f}`);
  lines.push('  requiredNewFields:');
  for (const f of rev.requiredNewFields) lines.push(`    - ${f}`);
  lines.push('  candidateLayers:');
  for (const f of rev.candidateLayers) lines.push(`    - ${f}`);
  lines.push(`  promotionRule: ${rev.promotionRule}`);
  if (result.sprintStampedAt) {
    lines.push('');
    lines.push(`Sprint stamped: ${result.sprintPath} systemTheoryRederivedAt=${result.sprintStampedAt}`);
  }
  if (result.warning) {
    lines.push('');
    lines.push(`WARNING: ${result.warning}`);
  }
  lines.push('================================================================================');
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}

export {
  parseCli,
  buildRecommendation,
  stampSprint,
  loadHistory,
  renderText,
  readSprintRederivedAt,
  countClosedPackagesSince,
  readSprintPackageQueue,
  latestSprintRederiveCheckpoint,
  countClosedSprintPackagesAfter,
  checkRederivationDue,
};
