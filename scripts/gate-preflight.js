#!/usr/bin/env node

// Gate preflight — the runnable form of operational-ground-truth.md's
// "deterministic-first; the gate is a LAST RESORT ONLY" requirements.
//
// Before ANY docker statistical gate run you must write down (1) the exact
// question the gate answers and (2) why no deterministic in-process test can
// answer it. This script refuses to proceed without both, then:
//   - runs `npm run analyze:latent-blockers` (the corpus already reveals the
//     next masked layer — never spend a gate to learn it);
//   - prints the N-calibration table and the three allowed gate categories.
// It performs NO gate run itself; it is the checklist in executable form.
//
// Usage:
//   npm run gate:preflight -- \
//     --question "<exact question the gate answers>" \
//     --why-not-deterministic "<one-liner>"

import process from 'node:process';
import {spawnSync} from 'node:child_process';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const FLAG_QUESTION = '--question';
const FLAG_WHY_NOT_DETERMINISTIC = '--why-not-deterministic';

const USAGE =
  'usage: npm run gate:preflight -- ' +
  `${FLAG_QUESTION} "<exact question the gate answers>" ` +
  `${FLAG_WHY_NOT_DETERMINISTIC} "<one-liner>"\n` +
  'Both answers are REQUIRED (operational-ground-truth.md: "first write down ' +
  'the exact question and why no in-process test can answer it; if you ' +
  'can\'t, you are not ready to gate").\n';

const ALLOWED_GATE_CATEGORIES = [
  '1. A true pass-RATE / variance question (the statistic itself is the claim).',
  '2. A one-time milestone certification of a landed, already-DT-proven ' +
    'improvement against a sealed bar.',
  '3. Hot failure-path aggregate A/B validation (N>=2 fixed vs N>=2 reverted).',
];

const N_CALIBRATION_TABLE = [
  '| Question                     | N    |',
  '| ---------------------------- | ---- |',
  '| Mechanistic / does-it-engage | 3-4  |',
  '| Rate or variance verdict     | >=8  |',
  '| Sealed-bar certification     | >=15 |',
];

function parseArgs(argv) {
  const options = {question: null, whyNotDeterministic: null};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === FLAG_QUESTION) {
      options.question = argv[++index] ?? null;
    } else if (argument === FLAG_WHY_NOT_DETERMINISTIC) {
      options.whyNotDeterministic = argv[++index] ?? null;
    } else {
      throw new Error(`unknown option: ${argument}`);
    }
  }
  return options;
}

function isNonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n${USAGE}`);
    return EXIT_FAILURE;
  }
  if (!isNonEmpty(options.question) || !isNonEmpty(options.whyNotDeterministic)) {
    process.stderr.write(
      `gate:preflight: refusing to proceed — ${FLAG_QUESTION} and ` +
      `${FLAG_WHY_NOT_DETERMINISTIC} are both required.\n${USAGE}`);
    return EXIT_FAILURE;
  }

  process.stdout.write('# Gate preflight\n\n');
  process.stdout.write(`question: ${options.question.trim()}\n`);
  process.stdout.write(
    `why-not-deterministic: ${options.whyNotDeterministic.trim()}\n\n`);

  process.stdout.write(
    '## Latent-blocker census (do not spend a gate to learn what the ' +
    'corpus already reveals)\n\n');
  const census = spawnSync('npm', ['run', 'analyze:latent-blockers'], {
    stdio: 'inherit',
  });

  process.stdout.write('\n## Allowed gate categories (all others: use a ' +
    'deterministic in-process test)\n');
  for (const category of ALLOWED_GATE_CATEGORIES) {
    process.stdout.write(`${category}\n`);
  }
  process.stdout.write('\n## N calibration (smallest informative N; ' +
    'escalate only when the result forces it)\n');
  for (const row of N_CALIBRATION_TABLE) {
    process.stdout.write(`${row}\n`);
  }
  process.stdout.write(
    '\nSource: docs/steering/operational-ground-truth.md ' +
    '("Deterministic-first; the gate is a LAST RESORT ONLY").\n');

  if (census.status !== 0) {
    process.stderr.write(
      'gate:preflight: analyze:latent-blockers failed — resolve that before ' +
      'queuing any gate.\n');
    return EXIT_FAILURE;
  }
  return EXIT_SUCCESS;
}

process.exitCode = main();
