#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {computeSourceFingerprint} from
  '../../src/diagnostics/source-fingerprint.js';
import {analyzeFormationReleaseEvents} from
  './formation-release-handoff-gcp-analysis.js';
import {
  startGcpAffinityCluster,
} from '../../examples/service-data-affinity/gcp-cluster-provider.js';

const arraySort = Function.call.bind(Array.prototype.sort);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayJoin = Function.call.bind(Array.prototype.join);
const bufferFrom = Buffer.from;
const DateConstructor = Date;
const dateToISOString = Function.call.bind(Date.prototype.toISOString);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const stringConstructor = String;
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringReplaceAll = Function.call.bind(String.prototype.replaceAll);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT_ROOT = path.join(
  ROOT,
  'test-output/reports/formation-release-handoff-closure',
);
const FIXED_VARIANT = 'fixed';
const REVERTED_VARIANT = 'reverted';
// Scenario-harness probe surface (scripts/solve/probes/scenario-harness.js):
// the quest doneWhen reads top-level test-output/reports/*.report.json files,
// keyed on the sealed scenario name and a lower-is-better priority metric. The
// per-run report.json (kept for log archaeology) is mirrored there with the
// sealed scenario name plus a scenario entry carrying the priority count.
const PROBE_SCENARIO_NAME = 'formation-release-handoff-closure';
// Distinct negative-control lane. The certification streak reads ONLY
// PROBE_SCENARIO_NAME; the reverted control reports under this separate
// scenario so an expected-failing control can never reset the fixed streak.
const REVERTED_CONTROL_SCENARIO_NAME =
  'formation-release-handoff-closure-reverted-control';
const PROBE_REPORT_BASENAME =
  'formation-release-handoff-closure-live-gcp';
const REVERTED_CONTROL_REPORT_BASENAME =
  'formation-release-handoff-closure-reverted-control-live-gcp';
// Per-run (archaeology) report identity + fidelity scalar owners (§4).
const REPORT_SCENARIO_NAME = 'formation-release-handoff-closure-live-gcp';
const FIDELITY_LIVE_GCP = 'live-gcp';
const PRIORITY_ITEMS_ON_PASS = 0;
const PRIORITY_ITEMS_ON_FAIL = 1;
const FAILED_ON_PASS = 0;
const FAILED_ON_FAIL = 1;
// Named scalar owners (system-guidelines.md §4): hashing/encoding/suffix tags.
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const LOG_FILE_SUFFIX = '.log';
const NEWLINE_SEPARATOR = '\n';
const ENCODING_UTF8 = 'utf8';
// Single deliberate mechanism reverted by the negative control. The reverse
// patch below removes ONLY the capture-vs-retention semantic fix
// (isRetainableAuthority's transient-BLOCKED retention branch); every other
// mechanism (cohort growth, latency, analyzer, instrumentation) is identical.
const REVERTED_MECHANISM =
  'capture-vs-retention-semantic:' +
  'isRetainableAuthority-transient-blocked-retention';
const CANDIDATE_COMMIT = 'cc66e0a04ac5fdd0efcb9d588fd4f5e952dd80cd';
const CONTRACT_RELATIVE_PATH =
  'src/control-plane/formation-release-handoff-contract.js';
const SOURCE_SUBDIR = 'src';
const GIT_COMMAND = 'git';
const WORKTREE_PREFIX = 'formation-release-handoff-reverted-control-';
// Reverse-patch and git-invocation scalar owners (§4).
const PATCH_DELETION_PREFIX = '-';
const PATCH_ADDITION_PREFIX = '+';
const PATCH_OLD_FILE_PREFIX = '--- a/';
const PATCH_NEW_FILE_PREFIX = '+++ b/';
const PATCH_HUNK_HEADER = '@@ retention-capture-vs-retain @@';
const EMPTY_STRING = '';
const SINGLE_SPACE = ' ';
const GIT_SUBCOMMAND_WORKTREE = 'worktree';
const GIT_SUBCOMMAND_ADD = 'add';
const GIT_SUBCOMMAND_REMOVE = 'remove';
const GIT_FLAG_DETACH = '--detach';
const GIT_FLAG_FORCE = '--force';
const WORKTREE_TREE_DIRNAME = 'tree';
const ERROR_REVERT_BLOCK_NOT_FOUND =
  'revert refused: fixed retention block not found verbatim at candidate';
const ERROR_REVERT_NO_CHANGE = 'revert produced no change';
const ERROR_FINGERPRINT_EQUALITY =
  'negative-control refused: reverted source fingerprint equals fixed ' +
  'source fingerprint (no source actually reverted)';
// Fixed retention block (the deliberate fix) restored to its known-bad form by
// the reverse patch. Derived verbatim from the candidate contract so the patch
// is guaranteed to apply; the reverted source drops the retention branch so a
// transient BLOCKED startup-authority instant now REVOKES the generation.
const FIXED_RETENTION_BLOCK = [
  '  if (evidence.ready === true) return isAuthorityReadyRetainable(evidence);',
  '  // Capture is gated on READY+spread; retention must be monotonic wrt',
  '  // compatible transient recovery (decision-table invariant',
  '  // non-monotone-spread-safe: "Spread is explicitly non-monotone until the',
  '  // captured cohort publishes READY"). A transient BLOCKED instant produced by',
  '  // a compatible recovery while the projection active gate is blocked carries',
  '  // NO recovery disqualifier (empty recoveryReasonCodes) and the spread gap is',
  '  // still open — that is the compatible-reopen case, so the captured generation',
  '  // is retained. A SUBSTANTIVE authority block instead records a concrete',
  '  // non-allowlisted reason (e.g. control_plane_not_writable) and remains fatal',
  '  // via pendingAuthorityIsRetainable\'s reason allowlist below.',
  '  if (',
  '    evidence.state === STARTUP_AUTHORITY_STATE.BLOCKED &&',
  '    evidence.prioritySpreadSatisfied === false &&',
  '    evidence.recoveryReasonCodes.length === 0',
  '  ) {',
  '    return true;',
  '  }',
  '  return pendingAuthorityIsRetainable(evidence);',
].join(NEWLINE_SEPARATOR);
const REVERTED_RETENTION_BLOCK = [
  '  if (evidence.ready === true) return isAuthorityReadyRetainable(evidence);',
  '  return pendingAuthorityIsRetainable(evidence);',
].join(NEWLINE_SEPARATOR);

function sha256(bytes) {
  return createHash(HASH_ALGORITHM).update(bytes).digest(HASH_ENCODING);
}

function execGit(args, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(GIT_COMMAND, args, {cwd}, (error, stdout, stderr) => {
      if (error) {
        rejectPromise(new Error(
          `git ${arrayJoin(args, SINGLE_SPACE)} failed: ` +
          stringTrim(stringConstructor(stderr)),
        ));
        return;
      }
      resolvePromise(stringTrim(stringConstructor(stdout)));
    });
  });
}

// Build the deterministic reverse patch text that restores the known-bad
// retention semantic. Constructed from the verbatim fixed block (so it always
// applies at the candidate) — never from a historical commit.
function buildRevertPatch() {
  const removedLines = arrayJoin(
    arrayMap(
      stringSplit(FIXED_RETENTION_BLOCK, NEWLINE_SEPARATOR),
      (line) => `${PATCH_DELETION_PREFIX}${line}`,
    ),
    NEWLINE_SEPARATOR,
  );
  const addedLines = arrayJoin(
    arrayMap(
      stringSplit(REVERTED_RETENTION_BLOCK, NEWLINE_SEPARATOR),
      (line) => `${PATCH_ADDITION_PREFIX}${line}`,
    ),
    NEWLINE_SEPARATOR,
  );
  return arrayJoin(
    [
      `${PATCH_OLD_FILE_PREFIX}${CONTRACT_RELATIVE_PATH}`,
      `${PATCH_NEW_FILE_PREFIX}${CONTRACT_RELATIVE_PATH}`,
      PATCH_HUNK_HEADER,
      removedLines,
      addedLines,
      EMPTY_STRING,
    ],
    NEWLINE_SEPARATOR,
  );
}

// Apply the single-axis revert to an isolated worktree by direct content
// substitution of the retention block. Refuses unless the fixed block is
// present verbatim, so the control can never silently revert nothing.
async function applyRetentionRevert(sourceRoot) {
  const contractPath = path.join(sourceRoot, CONTRACT_RELATIVE_PATH);
  const source = await fs.readFile(contractPath, ENCODING_UTF8);
  if (!stringIncludes(source, FIXED_RETENTION_BLOCK)) {
    throw new Error(ERROR_REVERT_BLOCK_NOT_FOUND);
  }
  const reverted = stringReplaceAll(
    source,
    FIXED_RETENTION_BLOCK,
    REVERTED_RETENTION_BLOCK,
  );
  if (reverted === source) {
    throw new Error(ERROR_REVERT_NO_CHANGE);
  }
  await fs.writeFile(contractPath, reverted);
}

// Produce the reverted arm: an isolated git worktree rooted at the exact
// candidate commit, with the single deliberate mechanism reversed. The main
// worktree is NEVER mutated. Returns the fingerprints + patch fingerprint.
//
// `work` is an optional deterministic-test seam: when `work.worktreePath`
// points at an already-populated tree, no git worktree is created and the
// revert is applied in place there. When omitted, an isolated temp worktree is
// created at the candidate commit. Either way the fingerprint-equality refusal
// below runs against the deployed tree.
async function prepareRevertedSource(fixedSourceFingerprint, work) {
  const injected = work && typeof work.worktreePath === 'string';
  const workParent = injected ?
    path.dirname(work.worktreePath) :
    await fs.mkdtemp(path.join(os.tmpdir(), WORKTREE_PREFIX));
  const worktreePath = injected ?
    work.worktreePath :
    path.join(workParent, WORKTREE_TREE_DIRNAME);
  const createdWorktree = !injected;
  if (createdWorktree) {
    await execGit(
      [
        GIT_SUBCOMMAND_WORKTREE,
        GIT_SUBCOMMAND_ADD,
        GIT_FLAG_DETACH,
        worktreePath,
        CANDIDATE_COMMIT,
      ],
      ROOT,
    );
  }
  try {
    await applyRetentionRevert(worktreePath);
  } catch (error) {
    if (createdWorktree) await cleanupWorktree(worktreePath, workParent);
    throw error;
  }
  const revertedSourceFingerprint = await computeSourceFingerprint(
    path.join(worktreePath, SOURCE_SUBDIR),
  );
  const revertPatch = buildRevertPatch();
  const revertPatchFingerprint = sha256(bufferFrom(revertPatch));
  // One assertion that would have caught the false-control bug: the two arms
  // MUST deploy different source. Refuse to run otherwise.
  if (fixedSourceFingerprint === revertedSourceFingerprint) {
    if (createdWorktree) await cleanupWorktree(worktreePath, workParent);
    throw new Error(ERROR_FINGERPRINT_EQUALITY);
  }
  return {
    worktreePath,
    workParent,
    createdWorktree,
    revertedSourceFingerprint,
    revertPatchFingerprint,
  };
}

async function cleanupWorktree(worktreePath, workParent) {
  try {
    await execGit(
      [
        GIT_SUBCOMMAND_WORKTREE,
        GIT_SUBCOMMAND_REMOVE,
        GIT_FLAG_FORCE,
        worktreePath,
      ],
      ROOT,
    );
  } catch {
    // Best-effort: a partially-created worktree may not be registered.
  }
  try {
    await fs.rm(workParent, {recursive: true, force: true});
  } catch {
    // Best-effort cleanup of the temp parent.
  }
}

function parseLogLine(line) {
  try {
    const value = jsonParse(line);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

async function readLogEvents(outputDir) {
  const names = arraySort(await fs.readdir(outputDir));
  const events = [];
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    if (!stringIncludes(name, LOG_FILE_SUFFIX)) continue;
    const bytes = await fs.readFile(path.join(outputDir, name), ENCODING_UTF8);
    const lines = stringSplit(bytes, NEWLINE_SEPARATOR);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const event = parseLogLine(lines[lineIndex]);
      if (event) events[events.length] = event;
    }
  }
  return events;
}

function resolveVariant(argv = process.argv.slice(2)) {
  const value = arrayFind(argv, (arg) =>
    arg === `--variant=${FIXED_VARIANT}` ||
    arg === `--variant=${REVERTED_VARIANT}`);
  return value === `--variant=${REVERTED_VARIANT}` ?
    REVERTED_VARIANT : FIXED_VARIANT;
}

// The cluster image + source fingerprint are both keyed off a working
// directory's `src` tree, so deploying the reverted arm is a matter of running
// the cluster from the isolated worktree root. `sourceRoot` is the deployed
// tree; the main tree is used only for the fixed arm.
async function runCluster(outputDir, sourceRoot) {
  let handle = null;
  let error = null;
  const previousCwd = process.cwd();
  try {
    if (sourceRoot && sourceRoot !== previousCwd) process.chdir(sourceRoot);
    handle = await startGcpAffinityCluster({
      verbose: true,
      outputDir,
    });
  } catch (caught) {
    error = caught;
  } finally {
    if (sourceRoot && sourceRoot !== previousCwd) process.chdir(previousCwd);
    if (handle) {
      try {
        await handle.stop();
      } catch (caught) {
        error ||= caught;
      }
    }
  }
  return {error};
}

async function analyzeClusterOutput(outputDir, sourceFingerprint) {
  try {
    return {
      analysis: analyzeFormationReleaseEvents(
        await readLogEvents(outputDir),
        sourceFingerprint,
      ),
      error: null,
    };
  } catch (error) {
    return {analysis: null, error};
  }
}

async function writeReport(report, outputDir) {
  await fs.mkdir(path.dirname(outputDir), {recursive: true});
  const reportBytes = bufferFrom(`${jsonStringify(report, null, 2)}\n`);
  const reportPath = path.join(path.dirname(outputDir), 'report.json');
  await fs.writeFile(reportPath, reportBytes);
  process.stdout.write(`${jsonStringify({
    ...report,
    report: path.relative(ROOT, reportPath),
    reportSha256: sha256(reportBytes),
  }, null, 2)}\n`);
}

// Mirror the run into the probe-scannable top-level report surface with the
// sealed scenario name and a priority metric the scenario-harness doneWhen can
// read (0 outstanding on pass, 1 on fail).
function probeScenarioForVariant(variant) {
  return variant === REVERTED_VARIANT ?
    REVERTED_CONTROL_SCENARIO_NAME :
    PROBE_SCENARIO_NAME;
}

function probeBasenameForVariant(variant) {
  return variant === REVERTED_VARIANT ?
    REVERTED_CONTROL_REPORT_BASENAME :
    PROBE_REPORT_BASENAME;
}

async function writeProbeReport(report) {
  const scenario = probeScenarioForVariant(report.variant);
  const basename = probeBasenameForVariant(report.variant);
  const probeReport = {
    schemaVersion: 2,
    scenario,
    fidelity: report.fidelity,
    variant: report.variant,
    sourceFingerprint: report.sourceFingerprint,
    fixedSourceFingerprint: report.fixedSourceFingerprint,
    revertedSourceFingerprint: report.revertedSourceFingerprint,
    revertPatchFingerprint: report.revertPatchFingerprint,
    revertedMechanism: report.revertedMechanism,
    timestamp: report.finishedAt,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    passed: report.passed,
    error: report.error,
    optimizationSummary: {
      totalPriorityItems: report.passed ?
        PRIORITY_ITEMS_ON_PASS :
        PRIORITY_ITEMS_ON_FAIL,
    },
    summary: {
      total: 1,
      passed: report.passed ? 1 : 0,
      failed: report.passed ? FAILED_ON_PASS : FAILED_ON_FAIL,
    },
    scenarios: [
      {
        scenario,
        passed: report.passed,
        verdict: report.passed ? 'PASS' : 'FAIL',
      },
    ],
    analysis: report.analysis,
    control: report.control,
    sourceReport: report.logDir,
  };
  const probePath = path.join(
    ROOT,
    'test-output/reports',
    `${basename}-${stringReplaceAll(
      report.finishedAt,
      ':',
      '-',
    )}.report.json`,
  );
  await fs.mkdir(path.dirname(probePath), {recursive: true});
  await fs.writeFile(probePath, bufferFrom(`${jsonStringify(probeReport, null, 2)}\n`));
  return probePath;
}

// The expected negative-control regression, observed from the analyzer's own
// `invariants` (the single classification owner; the runner never re-derives
// a generation class): the deliberately reverted source fails to retain the
// captured generation across the spread reopen, so the underlying product
// closure fails with a stranded generation, a generation retained but never
// completed when its authority tore down, a lost retention-across-reopen, or
// an invalid revocation. One observation feeds both the control block and the
// control verdict; a missing analysis observes nothing.
function observeControlRegression(analysis) {
  const invariants = analysis?.invariants ?? null;
  const retainedAcrossReopen = invariants?.generationRetainedAcrossReopen;
  const strandedGeneration = invariants?.noStrandedGeneration === false;
  const retainedUncompletedAtTeardown =
    invariants?.noRetainedUncompletedAtTeardown === false;
  const retentionLostAcrossReopen = retainedAcrossReopen === false;
  const invalidRevocation = invariants?.noInvalidRevocation === false;
  return {
    strandedGeneration,
    retainedUncompletedAtTeardown,
    generationRetainedAcrossReopen: retainedAcrossReopen === true,
    invalidRevocationCount: analysis?.invalidRevocationCount ?? 0,
    expectedRegressionObserved:
      strandedGeneration ||
      retainedUncompletedAtTeardown ||
      retentionLostAcrossReopen ||
      invalidRevocation,
  };
}

function expectedRegressionObserved(analysis) {
  return observeControlRegression(analysis).expectedRegressionObserved;
}

// Derive the report from a completed cluster run + analysis. Pure (no cluster,
// no filesystem) so the control verdict logic is deterministically testable.
// For the fixed arm `passed` IS the product closure; for the reverted control
// `passed` is the control verdict (expected regression reproduced).
function buildRunReport({
  variant,
  fixedSourceFingerprint,
  revertedSourceFingerprint = null,
  revertPatchFingerprint = null,
  deployedSourceFingerprint,
  startedAt,
  cluster,
  analysis,
  logDir,
}) {
  const error = cluster.error || null;
  const underlyingClosurePassed = analysis?.closurePassed === true;
  const observed = observeControlRegression(analysis);
  const control = variant === REVERTED_VARIANT ?
    {underlyingClosurePassed, ...observed} :
    null;
  const passed = error === null &&
    (variant === REVERTED_VARIANT ?
      observed.expectedRegressionObserved :
      underlyingClosurePassed);
  return {
    schemaVersion: 2,
    scenario: REPORT_SCENARIO_NAME,
    fidelity: FIDELITY_LIVE_GCP,
    variant,
    sourceFingerprint: deployedSourceFingerprint,
    fixedSourceFingerprint,
    revertedSourceFingerprint,
    revertPatchFingerprint,
    revertedMechanism: variant === REVERTED_VARIANT ?
      REVERTED_MECHANISM :
      null,
    startedAt: dateToISOString(startedAt),
    finishedAt: dateToISOString(new DateConstructor()),
    passed,
    clusterStartPassed: error === null,
    error: error ? stringConstructor(error.message || error) : null,
    analysis,
    control,
    logDir,
  };
}

async function runFormationReleaseHandoffGcp(options = {}) {
  const variant = options.variant || resolveVariant();
  const fixedSourceFingerprint = await computeSourceFingerprint(
    path.join(ROOT, SOURCE_SUBDIR),
  );
  // Resolve the deployed tree. The reverted arm deploys the isolated-worktree
  // source (candidate commit + single reversed mechanism); the fixed arm
  // deploys the main tree. The fingerprint-refusal lives in
  // prepareRevertedSource and runs BEFORE any cluster start.
  let reverted = null;
  if (variant === REVERTED_VARIANT) {
    reverted = await prepareRevertedSource(
      fixedSourceFingerprint,
      options.revertWork || null,
    );
  }
  const startedAt = new DateConstructor();
  const runId = stringReplaceAll(dateToISOString(startedAt), ':', '-');
  const outputDir = path.join(REPORT_ROOT, runId, 'full-logs');
  let report;
  try {
    const sourceRoot = reverted ? reverted.worktreePath : null;
    const deployedSourceFingerprint = reverted ?
      reverted.revertedSourceFingerprint :
      fixedSourceFingerprint;
    const cluster = options.skipCluster ?
      {error: null} :
      await runCluster(outputDir, sourceRoot);
    const analyzed = await analyzeClusterOutput(
      outputDir,
      deployedSourceFingerprint,
    );
    report = buildRunReport({
      variant,
      fixedSourceFingerprint,
      revertedSourceFingerprint: reverted?.revertedSourceFingerprint ?? null,
      revertPatchFingerprint: reverted?.revertPatchFingerprint ?? null,
      deployedSourceFingerprint,
      startedAt,
      cluster: {error: cluster.error || analyzed.error},
      analysis: analyzed.analysis,
      logDir: path.relative(ROOT, outputDir),
    });
  } finally {
    if (reverted && reverted.createdWorktree) {
      await cleanupWorktree(reverted.worktreePath, reverted.workParent);
    }
  }
  await writeReport(report, outputDir);
  const probePath = await writeProbeReport(report);
  process.stdout.write(`${jsonStringify({probeReport: path.relative(ROOT, probePath)}, null, 0)}\n`);
  if (!report.passed) process.exitCode = 1;
  return report;
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await runFormationReleaseHandoffGcp();
}

export {
  analyzeFormationReleaseEvents,
  buildRevertPatch,
  buildRunReport,
  expectedRegressionObserved,
  prepareRevertedSource,
  probeScenarioForVariant,
  readLogEvents,
  runFormationReleaseHandoffGcp,
  CANDIDATE_COMMIT,
  PROBE_SCENARIO_NAME,
  REVERTED_CONTROL_SCENARIO_NAME,
};
