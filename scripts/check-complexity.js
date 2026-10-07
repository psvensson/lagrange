/**
 * Runs eslint with the complexity rule and reports only complexity
 * violations, ignoring other lint errors.
 *
 * Default mode: fails if violations exceed the current baseline count.
 * --strict mode: fails if any function exceeds the target threshold (12).
 *
 * The baseline count should be ratcheted down as complex functions
 * are refactored. Update BASELINE_COUNT when violations are fixed.
 */

import {LegacyESLint} from 'eslint/use-at-your-own-risk';

import {
  collectRuleViolations,
  writeJsonReport,
} from './metric-check-helpers.js';


const TARGET_THRESHOLD = 12;
// Measured after the proof-integrity cutover. Ratchet DOWN only from here.
// 2026-07-19: tightened 1855 -> 1847 (measured; taking the ratchet down per
// the release-gate one-way-baseline rule).
// 2026-08-10: tightened 1842 -> 1841 (six new-debt functions refactored
// below the threshold; measured with the checker's tightening hint).
// 2026-08-10: tightened 1841 -> 1839 (checkRebalance tail scheduling and
// the topology-settling gate log-context extracted while landing
// user-table-leader-placement-spread; one-way-baseline rule).
// 2026-08-14: tightened 1839 -> 1838 after authoritative readiness-repair
// permission moved into its canonical reconciler owner.
// 2026-08-21: tightened 1838 -> 1831 after deleting the runtime compatibility
// reconciler, consolidating rebalancer entity/read-model ownership, and
// removing the duplicate heartbeat/reconcile ownership path.
// 2026-08-21: tightened 1831 -> 1826 after retiring the bootstrap formation
// placement/drain re-derivation and duplicate read-authority paths.
// 2026-08-29: tightened 1824 -> 1823 after the release-branch ratchet repair
// (active-gate evidence probes, formation-barrier snapshot projection,
// formation-release contract identity, coordinator move request decoration).
// 2026-09-04: tightened 1823 -> 1822 after liveness predicate extraction.
// 2026-09-15: tightened 1822 -> 1820 after the priority-recovery planning-read
// split retired both generic getPriorityRecoveryPlanningSnapshot methods and
// the gateway queue-metadata, attribution execution-node assertion and
// superseded host-fixpoint settler were extracted or removed.
// 2026-09-19: tightened 1819 -> 1818 after the learner-promotion count check
// moved its arithmetic into its own owner (measured with the checker's
// tightening hint).
// 2026-09-19: tightened 1818 -> 1817 after the lease sweeper's disconnect loop
// became its own method (sweepExpiredLeases 13 -> 4), measured with the hint.
// 2026-09-19: tightened 1817 -> 1816 after the learner promotion's in-flight
// operation read lost its over-threshold method (spread-cure authorization
// carrier), measured with the hint.
// 2026-09-23: tightened 1816 -> 1814 on the checker's hint after the rs-raft
// single-path cutover removed the write path's direct-execution branch and the
// runtime owner's status shaping moved beside it.
// 2026-09-24: tightened 1814 -> 1813 on the checker's hint after the ready
// node's publication advancement read its published set from the snapshot
// owner instead of normalizing the row itself (cutover seed parity).
// 2026-09-25: tightened 1813 -> 1811 on the checker's hint after the REPLACE
// owner deleted the replacement-leader retarget resolution (H-B', quest
// replace-source-removal-owner).
// 2026-09-26: tightened 1811 -> 1810 on the checker's hint on the O1
// committed-read branch (the partition row branch of the creation stamp
// deleted; the peer-cache reconcile's expected-peer loop extracted).
// 2026-09-26: tightened 1810 -> 1805 on the hint (fix-f1: the per-leg
// handoff evidence and escalation deleted).
// 2026-09-26: tightened 1810 -> 1809 on the checker's hint (fix-f4: the
// readiness service-row readers share one authoritative-read helper,
// readAllNodeServiceRows drops below the threshold).
// 2026-09-26 (integration 2): the two merged at the lower (1805), then
// tightened to 1804 on the checker's hint.
// 2026-09-28: tightened 1804 -> 1797 on the checker's hint (node lifecycle
// owner: the dispatch node-state queue, deferred retry and in-write
// follow-up branches deleted).
// 2026-09-29: tightened 1797 -> 1796 on the checker's hint (census walker
// split into named node predicates).
// 2026-09-30: tightened 1796 -> 1795 on the checker's hint (the boot
// lifecycle components no longer branch on a missing incarnation).
// 2026-10-03: tightened 1795 -> 1773 on the checker's hint after the
// origin/main ec63fbb00 merge and the native-append inference deletion.
// 2026-10-04: tightened 1773 -> 1770 on the checker's hint after the
// origin/main d60c30921 merge (consensus-cutover closeout tree).
// 2026-10-04: tightened 1770 -> 1765 on the checker's hint after the
// message-group MOVE_REPLICA selection and execution were deleted.
// 2026-10-04: tightened 1765 -> 1764 on the checker's hint (the convergence
// snapshot classifier's voter checks moved into convergence-voter-targets).
// 2026-10-04 (quest/one-spread-authority): tightened 1770 -> 1767 on the
// checker's hint after the one-spread-authority deletion (closure synthesis,
// D9 ranking, D3 latch).
// 2026-10-05: merge of quest/one-spread-authority keeps the lower value,
// then tightened 1764 -> 1761 on the checker's hint for the merged tree.
// 2026-10-05 (quest/pgwire-dml-row-counts): tightened 1761 -> 1760 on the
// checker's hint (the PG-wire mapper's three `changes ?? rowCount ?? 0`
// fallbacks became one call to the result-count owner).
// 2026-10-05 (quest/group-retirement-as-a-unit): tightened 1770 -> 1769 on
// the checker's hint (the group-retired tombstone record's text fields go
// through one helper).
// 2026-10-05: tightened 1769 -> 1768 on the checker's hint (the record
// store's change functions and the split decoder extracted helpers).
// 2026-10-05: tightened 1768 -> 1767 on the checker's hint (round 7: the
// record store's turn and the SQLite witness world extracted helpers).
// 2026-10-05: merge of quest/group-retirement-as-a-unit keeps the lower
// value, then tightened 1760 -> 1757 on the checker's hint for the merged
// tree (the merge persistence's same-owner re-sync left with the record
// store redesign).
// 2026-10-07: the composed identity admission extraction tightened the
// combined bound from 1757 to 1756; the START owner extraction and removal
// of its legacy inline handler tighten the combined bound from 1756 to 1755.
const BASELINE_COUNT = 1755;
const STRICT_FLAG = '--strict';
const SCOPED_FLAG = '--scoped';
const ARG_SEPARATOR = '--';
const LOCAL_STR_TEST_GITKEEP = 'test/.gitkeep';
const LOCAL_STR_COMPLEXITY = 'complexity';
const LOCAL_STR_ERROR = 'error';
const DEFAULT_LINT_TARGETS = ['src/', 'test/'];
const REPORT_RELATIVE_PATH = 'test-output/analysis/complexity-src-test.json';
const SCOPED_REPORT_RELATIVE_PATH =
  'test-output/analysis/complexity-scoped.json';
const PRINT_LIMIT = 40;
const FILTERED_FLAGS = new Set([
  STRICT_FLAG,
  SCOPED_FLAG,
  ARG_SEPARATOR,
]);
const ESLINT_OVERRIDE_CONFIG = {
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: [LOCAL_STR_TEST_GITKEEP],
  rules: {
    [LOCAL_STR_COMPLEXITY]: [LOCAL_STR_ERROR, TARGET_THRESHOLD],
  },
};
const args = process.argv.slice(2);
const strict = args.includes(STRICT_FLAG);
const scoped = args.includes(SCOPED_FLAG);
const scopedTargets = args.filter((arg) => !FILTERED_FLAGS.has(arg));

if (scoped && scopedTargets.length === 0) {
  console.error(
    'Usage: npm run test:complexity:scoped -- <file-or-directory> [...]',
  );
  process.exit(1);
}

const lintTargets = scoped ? scopedTargets : DEFAULT_LINT_TARGETS;
const reportRelativePath = scoped ?
  SCOPED_REPORT_RELATIVE_PATH :
  REPORT_RELATIVE_PATH;

// Self-contained like check-cognitive-complexity.js: without this, the
// checker resolves a repo eslintrc that no longer exists and silently lints
// nothing, emptying the complexity report the owner-debt inventory pins.
const eslint = new LegacyESLint({
  cwd: process.cwd(),
  useEslintrc: false,
  overrideConfig: ESLINT_OVERRIDE_CONFIG,
});
const results = await eslint.lintFiles(lintTargets);
const violations = collectRuleViolations(results, LOCAL_STR_COMPLEXITY);

const count = violations.length;

writeJsonReport(reportRelativePath, {
  targetThreshold: TARGET_THRESHOLD,
  baselineCount: BASELINE_COUNT,
  scoped,
  targets: lintTargets,
  count,
  violations,
});

function printViolations(entries) {
  for (const violation of entries.slice(0, PRINT_LIMIT)) {
    console.log(
      `${violation.filePath}:${violation.line}:${violation.column} ` +
      `${violation.message}`,
    );
  }
  if (entries.length > PRINT_LIMIT) {
    console.log(
      `... ${entries.length - PRINT_LIMIT} more violation(s). ` +
      `Full report: ${reportRelativePath}.`,
    );
  }
}

if (strict) {
  if (count > 0) {
    console.log(
      `Complexity violations (threshold: ${TARGET_THRESHOLD}):\n`,
    );
    printViolations(violations);
    console.log(`\n${count} violation(s) found.`);
    process.exit(1);
  }
  console.log(
    `No complexity violations (threshold: ${TARGET_THRESHOLD}).`,
  );
} else if (scoped) {
  console.log(
    `Scoped complexity ratchet: ${count} violation(s) in ` +
    `${lintTargets.length} target(s) (threshold: ${TARGET_THRESHOLD}).`,
  );
  if (count > 0) {
    printViolations(violations);
  }
  console.log(`Saved complexity report to ${reportRelativePath}.`);
} else {
  if (count > BASELINE_COUNT) {
    console.log(
      `Complexity ratchet FAILED: ${count} violations ` +
      `exceeds baseline of ${BASELINE_COUNT}.\n`,
    );
    printViolations(violations);
    process.exit(1);
  }
  console.log(
    `Complexity ratchet OK: ${count}/${BASELINE_COUNT} ` +
    `violations (threshold: ${TARGET_THRESHOLD}).`,
  );
  console.log(`Saved complexity report to ${reportRelativePath}.`);
  if (count < BASELINE_COUNT) {
    console.log(
      `Baseline can be tightened from ${BASELINE_COUNT} ` +
      `to ${count} in scripts/check-complexity.js.`,
    );
  }
}
