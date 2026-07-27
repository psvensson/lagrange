// Changed-path static quality gate at attempt sealing.
//
// A verifier round spent on machine-checkable violations is a wasted
// independent-review turn (measured 2026-07-27: one candidate rejection cited
// 68 literal-guideline violations, four lint-override directives, and
// complexity thresholds — all reproducible by the existing static tooling).
// This gate runs the two cheapest deterministic checkers — ESLint and the
// literal-guideline audit — over ONLY the attempt's changed source paths
// before the attempt seals, so the full `test:static` battery's latency never
// enters the attempt loop but its most common findings do. A checker that
// exists but fails to RUN blocks like a violation; a checker that is absent
// from the quest root (a fixture or a tree without dev dependencies) is
// skipped — this gate economizes verifier turns, it is not an integrity
// invariant, and the independent verifier still reviews everything. The gate
// is overridable (recorded-reason), matching the other heuristic process
// guards.

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// Only trees the repository's lint configuration actually covers (`lint` and
// `lint:scripts`); gating an unlinted tree would manufacture false blocks.
const LINTED_PATH_PATTERN = /^(?:src|test|scripts)\/.+\.(?:js|mjs|cjs)$/u;
const ESLINT_BIN_SEGMENTS = ['node_modules', 'eslint', 'bin', 'eslint.js'];
const LITERALS_CHECK_SEGMENTS = ['scripts', 'check-guideline-literals.js'];
const OUTPUT_LINE_LIMIT = 20;
const SPAWN_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const ESLINT_LABEL = 'eslint';
const LITERALS_LABEL = 'literal-guideline audit';
const LINE_SEPARATOR = '\n';
const ESLINT_ARGUMENTS = Object.freeze(
  ['--no-warn-ignored', '--no-error-on-unmatched-pattern']);

function boundedOutput(result) {
  const lines = `${result.stdout || ''}${LINE_SEPARATOR}${result.stderr || ''}`
    .split(LINE_SEPARATOR).map((line) => line.trimEnd()).filter(Boolean);
  const shown = lines.slice(0, OUTPUT_LINE_LIMIT);
  if (lines.length > shown.length) {
    shown.push(`... (${lines.length - shown.length} more lines)`);
  }
  return shown.join(LINE_SEPARATOR);
}

function runChecker(root, label, scriptPath, extraArgs, jsPaths) {
  if (!fs.existsSync(scriptPath)) return [];
  const result = spawnSync(
    process.execPath,
    [scriptPath, ...extraArgs, ...jsPaths],
    {cwd: root, encoding: 'utf8', maxBuffer: SPAWN_MAX_BUFFER_BYTES},
  );
  if (result.error) {
    return [`static-quality ${label} could not run: ${result.error.message}`];
  }
  if (result.status !== 0) {
    return [`static-quality ${label} failed over the changed paths:\n` +
      boundedOutput(result)];
  }
  return [];
}

export function staticQualityProblems(root, changedPaths) {
  const jsPaths = [...new Set(changedPaths || [])]
    .filter((filePath) => LINTED_PATH_PATTERN.test(filePath) &&
      fs.existsSync(path.join(root, filePath)))
    .sort();
  if (jsPaths.length === 0) return [];
  return [
    ...runChecker(
      root,
      ESLINT_LABEL,
      path.join(root, ...ESLINT_BIN_SEGMENTS),
      [...ESLINT_ARGUMENTS],
      jsPaths,
    ),
    ...runChecker(
      root,
      LITERALS_LABEL,
      path.join(root, ...LITERALS_CHECK_SEGMENTS),
      [],
      jsPaths,
    ),
  ];
}
