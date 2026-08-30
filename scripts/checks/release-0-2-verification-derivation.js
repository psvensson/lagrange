/**
 * Single owner of the release-0-2-verification-v3 verdict derivation.
 *
 * Pure: takes the loaded facts (release-candidate identity, the memory-soak
 * report, the local gate receipts, the GitHub gate receipt) and derives the
 * three frontier scenario reports plus the aggregate, fail-closed, in the
 * scenario-harness report shape (scripts/solve/probes/scenario-harness.js
 * reads standardSummary.scenarios[].current.passed/verdict/verdictReason
 * and optimizationSummary.totalPriorityItems). Every scenario is a decision
 * table evaluated in order; exactly one canonical verdictReason (the first
 * failing condition) is emitted per scenario and every condition's own
 * outcome is carried in detail.conditions. The helpers that produce the
 * receipts record facts only; nothing outside this module decides a verdict.
 */

import {
  GATE_RECEIPT_EXIT_OK,
  GITHUB_REQUIRED_CHECK,
  RELEASE_VERSION,
  REQUIRED_GATE_RECEIPTS,
  SOAK_INSUFFICIENT_REASON_PREFIX,
  SOAK_MIN_SAMPLES_PER_NODE,
  VERIFICATION_FIDELITY,
  VERIFICATION_PRODUCER,
  VERIFICATION_REASON,
  VERIFICATION_SCENARIO,
  VERIFICATION_VERDICT,
} from './release-0-2-verification-constants.js';

// Ambient intrinsics captured at module load (adversarial-js-intrinsics
// guideline item 6) so replaced prototypes cannot invert report admission.
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const NO_SUBJECT = '';
// Subject named when the report-level memoryLeak summary itself fails a
// node-level oracle (not analyzed, or a leak flagged at the summary).
const SOAK_SUMMARY_SUBJECT = 'memoryLeak';
const SUBJECT_SEPARATOR = ', ';
const DETAIL_SEPARATOR = ': ';
const FIRST_SCENARIO_INDEX = 0;

// --- condition evaluation -------------------------------------------------

function evaluateTable(table, context) {
  const conditions = [];
  for (const entry of table) {
    const outcome = entry.evaluate(context);
    conditions.push({
      receipt: entry.receipt,
      reason: entry.reason,
      passed: outcome.passed,
      subjects: outcome.subjects,
    });
  }
  return conditions;
}

function holds(passed) {
  return {passed, subjects: []};
}

function holdsForAll(failingSubjects) {
  return {passed: failingSubjects.length === 0, subjects: failingSubjects};
}

// The one canonical verdict per scenario: the first failing condition in
// table order names the reason; its subjects (receipt names, node ids,
// child scenarios) are appended for the operator.
function decideVerdict(conditions) {
  let failing = conditions.length;
  for (let index = conditions.length - 1; index >= 0; index -= 1) {
    if (!conditions[index].passed) failing = index;
  }
  const passed = failing === conditions.length;
  const reason = passed ?
    VERIFICATION_REASON.VERIFIED :
    conditions[failing].reason;
  const subjects = passed ? [] : conditions[failing].subjects;
  return {
    passed,
    verdict: passed ? VERIFICATION_VERDICT.PASS : VERIFICATION_VERDICT.FAIL,
    verdictReason: reason,
    verdictReasonDetail: subjects.length === 0 ?
      reason :
      reason + DETAIL_SEPARATOR + subjects.join(SUBJECT_SEPARATOR),
  };
}

function countFailing(conditions) {
  let failing = 0;
  for (const condition of conditions) {
    if (!condition.passed) failing += 1;
  }
  return failing;
}

function buildScenarioReport(scenario, conditions, detail, timestamp) {
  const verdict = decideVerdict(conditions);
  const failing = countFailing(conditions);
  return {
    timestamp,
    scenario,
    producer: VERIFICATION_PRODUCER,
    fidelity: VERIFICATION_FIDELITY,
    summary: {
      total: conditions.length,
      passed: conditions.length - failing,
      failed: failing,
    },
    optimizationSummary: {totalPriorityItems: failing},
    standardSummary: {
      scenarios: [
        {
          scenario,
          passed: verdict.passed,
          current: verdict,
          detail: {conditions, ...detail},
        },
      ],
    },
  };
}

// Shared leading condition: nothing passes while the frozen version is not
// the same 0.2.0 in package.json, CLI_VERSION, ENTRYPOINT_VERSION, and the
// Helm chart (epic G5).
const RELEASE_VERSION_CONDITION = Object.freeze({
  receipt: 'versionSources all equal RELEASE_VERSION',
  reason: VERIFICATION_REASON.RELEASE_VERSION_INCONSISTENT,
  evaluate: (ctx) => holds(ctx.identity.versionConsistent === true),
});

// --- memory soak ----------------------------------------------------------

const SOAK_FINGERPRINT_READERS = Object.freeze([
  (report) => report?.metadata?.srcFingerprint,
  (report) => report?.srcFingerprint,
]);

function soakReportFingerprint(report) {
  let fingerprint = NO_SUBJECT;
  for (const read of SOAK_FINGERPRINT_READERS) {
    const value = read(report);
    if (fingerprint === NO_SUBJECT && typeof value === 'string') {
      fingerprint = value;
    }
  }
  return fingerprint;
}

function soakScenarioEntry(soak) {
  const entries = Array.isArray(soak.report?.scenarios) ?
    soak.report.scenarios :
    [];
  return entries[FIRST_SCENARIO_INDEX] || {};
}

function soakNodes(soak) {
  const nodes = soakScenarioEntry(soak)?.memoryLeak?.nodes;
  return Array.isArray(nodes) ? nodes : [];
}

function nodeId(node) {
  return String(node?.nodeId || NO_SUBJECT);
}

function failingNodeIds(soak, violates) {
  const ids = [];
  for (const node of soakNodes(soak)) {
    if (violates(node)) ids.push(nodeId(node));
  }
  return ids;
}

function insufficientReason(node) {
  return typeof node?.reason === 'string' &&
    stringStartsWith(node.reason, SOAK_INSUFFICIENT_REASON_PREFIX);
}

const SOAK_CONDITIONS = Object.freeze([
  RELEASE_VERSION_CONDITION,
  Object.freeze({
    receipt: 'soak report present',
    reason: VERIFICATION_REASON.SOAK_REPORT_MISSING,
    evaluate: (ctx) => holds(ctx.soak.present === true),
  }),
  Object.freeze({
    receipt: 'soak report carries srcFingerprint',
    reason: VERIFICATION_REASON.FINGERPRINT_MISSING,
    evaluate: (ctx) =>
      holds(soakReportFingerprint(ctx.soak.report) !== NO_SUBJECT),
  }),
  Object.freeze({
    receipt: 'soak srcFingerprint equals current sourceFingerprint',
    reason: VERIFICATION_REASON.FINGERPRINT_MISMATCH,
    evaluate: (ctx) => holds(
      soakReportFingerprint(ctx.soak.report) ===
        ctx.identity.sourceFingerprint,
    ),
  }),
  Object.freeze({
    receipt: 'soak scenario passed && summary.failed === 0',
    reason: VERIFICATION_REASON.SOAK_SCENARIO_FAILED,
    evaluate: (ctx) => holds(
      soakScenarioEntry(ctx.soak).passed === true &&
        ctx.soak.report?.summary?.failed === 0,
    ),
  }),
  Object.freeze({
    receipt: 'memoryLeak.analyzed && every node analyzed',
    reason: VERIFICATION_REASON.SOAK_NODE_NOT_ANALYZED,
    evaluate: (ctx) => holdsForAll(
      soakScenarioEntry(ctx.soak)?.memoryLeak?.analyzed === true &&
        soakNodes(ctx.soak).length > 0 ?
        failingNodeIds(ctx.soak, (node) => node?.analyzed !== true) :
        [SOAK_SUMMARY_SUBJECT],
    ),
  }),
  Object.freeze({
    receipt: `every node sampleCount >= ${SOAK_MIN_SAMPLES_PER_NODE}`,
    reason: VERIFICATION_REASON.SOAK_INSUFFICIENT_SAMPLES,
    evaluate: (ctx) => holdsForAll(failingNodeIds(
      ctx.soak,
      (node) => !(Number.isInteger(node?.sampleCount) &&
        node.sampleCount >= SOAK_MIN_SAMPLES_PER_NODE),
    )),
  }),
  Object.freeze({
    receipt: `no node reason starts with ${SOAK_INSUFFICIENT_REASON_PREFIX}`,
    reason: VERIFICATION_REASON.SOAK_INSUFFICIENT_REASON,
    evaluate: (ctx) => holdsForAll(failingNodeIds(ctx.soak, insufficientReason)),
  }),
  Object.freeze({
    receipt: 'no leak detected (report and every node)',
    reason: VERIFICATION_REASON.SOAK_LEAK_DETECTED,
    evaluate: (ctx) => holdsForAll(
      soakScenarioEntry(ctx.soak)?.memoryLeak?.leakDetected === false ?
        failingNodeIds(ctx.soak, (node) => node?.leakDetected !== false) :
        [SOAK_SUMMARY_SUBJECT],
    ),
  }),
]);

// --- local artifacts ------------------------------------------------------

// The recorded integer exit code is the ONLY success fact a gate receipt
// carries; no helper writes a `passed` field and none is honoured here.
function receiptExitCodeRecorded(receipt) {
  return Number.isInteger(receipt?.exitCode);
}

function receiptBoundToIdentity(receipt, identity) {
  return receipt?.sourceFingerprint === identity.sourceFingerprint &&
    receipt?.sourceFingerprintAtFinish === identity.sourceFingerprint;
}

function receiptTreeClean(receipt) {
  return receipt?.treeClean === true && receipt?.treeCleanAtFinish === true;
}

function failingReceiptNames(ctx, violates) {
  const names = [];
  for (const name of REQUIRED_GATE_RECEIPTS) {
    const entry = ctx.receipts[name] || {present: false};
    if (entry.present === true && violates(entry.receipt, ctx.identity)) {
      names.push(name);
    }
  }
  return names;
}

function missingReceiptNames(ctx) {
  const names = [];
  for (const name of REQUIRED_GATE_RECEIPTS) {
    if (ctx.receipts[name]?.present !== true) names.push(name);
  }
  return names;
}

const LOCAL_ARTIFACT_CONDITIONS = Object.freeze([
  RELEASE_VERSION_CONDITION,
  Object.freeze({
    receipt: 'every required gate receipt present',
    reason: VERIFICATION_REASON.RECEIPT_MISSING,
    evaluate: (ctx) => holdsForAll(missingReceiptNames(ctx)),
  }),
  Object.freeze({
    receipt: 'every receipt records an integer exitCode',
    reason: VERIFICATION_REASON.RECEIPT_EXIT_CODE_MISSING,
    evaluate: (ctx) => holdsForAll(failingReceiptNames(
      ctx,
      (receipt) => !receiptExitCodeRecorded(receipt),
    )),
  }),
  Object.freeze({
    receipt: 'every receipt exitCode === 0',
    reason: VERIFICATION_REASON.RECEIPT_FAILED,
    evaluate: (ctx) => holdsForAll(failingReceiptNames(
      ctx,
      (receipt) => receiptExitCodeRecorded(receipt) &&
        receipt.exitCode !== GATE_RECEIPT_EXIT_OK,
    )),
  }),
  Object.freeze({
    receipt: 'every receipt headSha equals current HEAD',
    reason: VERIFICATION_REASON.RECEIPT_SHA_MISMATCH,
    evaluate: (ctx) => holdsForAll(failingReceiptNames(
      ctx,
      (receipt, identity) => receipt?.headSha !== identity.headSha,
    )),
  }),
  Object.freeze({
    receipt: 'every receipt sourceFingerprint (start and finish) equals current',
    reason: VERIFICATION_REASON.RECEIPT_FINGERPRINT_MISMATCH,
    evaluate: (ctx) => holdsForAll(failingReceiptNames(
      ctx,
      (receipt, identity) => !receiptBoundToIdentity(receipt, identity),
    )),
  }),
  Object.freeze({
    receipt: 'every receipt version equals RELEASE_VERSION',
    reason: VERIFICATION_REASON.RECEIPT_VERSION_MISMATCH,
    evaluate: (ctx) => holdsForAll(failingReceiptNames(
      ctx,
      (receipt) => receipt?.version !== RELEASE_VERSION,
    )),
  }),
  Object.freeze({
    receipt: 'every receipt recorded treeClean at start and finish',
    reason: VERIFICATION_REASON.RECEIPT_TREE_DIRTY,
    evaluate: (ctx) => holdsForAll(failingReceiptNames(
      ctx,
      (receipt) => !receiptTreeClean(receipt),
    )),
  }),
]);

// --- remote exact sha -----------------------------------------------------

const REMOTE_CONDITIONS = Object.freeze([
  RELEASE_VERSION_CONDITION,
  Object.freeze({
    receipt: 'GitHub gate receipt present',
    reason: VERIFICATION_REASON.REMOTE_RECEIPT_MISSING,
    evaluate: (ctx) => holds(ctx.remote.present === true),
  }),
  Object.freeze({
    receipt: 'GitHub gate receipt recorded on a clean tree',
    reason: VERIFICATION_REASON.REMOTE_RECEIPT_TREE_DIRTY,
    evaluate: (ctx) => holds(ctx.remote.receipt?.treeClean === true),
  }),
  Object.freeze({
    receipt: 'receipt sha and gate job head_sha equal current HEAD',
    reason: VERIFICATION_REASON.REMOTE_SHA_MISMATCH,
    evaluate: (ctx) => holds(
      ctx.remote.receipt?.sha === ctx.identity.headSha &&
        ctx.remote.receipt?.gateJob?.headSha === ctx.identity.headSha,
    ),
  }),
  Object.freeze({
    receipt: `job ${GITHUB_REQUIRED_CHECK.JOB} found for the sha`,
    reason: VERIFICATION_REASON.REMOTE_CHECK_NOT_FOUND,
    evaluate: (ctx) => holds(
      ctx.remote.receipt?.gateJob?.found === true &&
        ctx.remote.receipt?.gateJob?.name === GITHUB_REQUIRED_CHECK.JOB,
    ),
  }),
  Object.freeze({
    receipt: `gate job belongs to ${GITHUB_REQUIRED_CHECK.WORKFLOW_PATH}`,
    reason: VERIFICATION_REASON.REMOTE_WORKFLOW_MISMATCH,
    evaluate: (ctx) => holds(
      ctx.remote.receipt?.gateJob?.workflowPath ===
        GITHUB_REQUIRED_CHECK.WORKFLOW_PATH,
    ),
  }),
  Object.freeze({
    receipt: `${GITHUB_REQUIRED_CHECK.DISPLAY_NAME} conclusion ` +
      GITHUB_REQUIRED_CHECK.SUCCESS_CONCLUSION,
    reason: VERIFICATION_REASON.REMOTE_CHECK_NOT_SUCCESS,
    evaluate: (ctx) => holds(
      ctx.remote.receipt?.gateJob?.conclusion ===
        GITHUB_REQUIRED_CHECK.SUCCESS_CONCLUSION,
    ),
  }),
]);

// --- aggregate ------------------------------------------------------------

function childVerdict(report) {
  return report.standardSummary.scenarios[FIRST_SCENARIO_INDEX];
}

function aggregateConditions(children) {
  const conditions = [];
  for (const child of children) {
    const entry = childVerdict(child);
    conditions.push({
      receipt: entry.scenario,
      reason: VERIFICATION_REASON.CHILD_SCENARIO_FAILED,
      passed: entry.passed,
      subjects: entry.passed ? [] : [entry.scenario],
      verdictReason: entry.current.verdictReason,
    });
  }
  return conditions;
}

// --- provenance -----------------------------------------------------------

function receiptPaths(receipts) {
  const paths = {};
  for (const name of REQUIRED_GATE_RECEIPTS) {
    paths[name] = receipts[name]?.path || NO_SUBJECT;
  }
  return paths;
}

function buildProvenance(facts) {
  return {
    headCommit: facts.identity.headSha,
    treeClean: facts.identity.treeClean === true,
    sourceFingerprint: facts.identity.sourceFingerprint,
    releaseVersion: facts.identity.releaseVersion,
    versionSources: facts.identity.versionSources,
    soakReport: facts.soak.reportPath || NO_SUBJECT,
    soakReportSha256: facts.soak.reportSha256 || NO_SUBJECT,
    soakReportTimestamp: String(facts.soak.report?.timestamp || NO_SUBJECT),
    gateReceipts: receiptPaths(facts.receipts),
    remoteReceipt: facts.remote.path || NO_SUBJECT,
  };
}

/**
 * Derive the three frontier scenario reports and the aggregate from the
 * loaded facts. Deterministic for identical facts and timestamp.
 * @param {Object} facts {identity, soak, receipts, remote, timestamp}
 * @return {{reports: Array<Object>, allPassed: boolean}}
 */
function deriveVerificationReports(facts) {
  const provenance = buildProvenance(facts);
  const {timestamp} = facts;
  const children = [
    buildScenarioReport(
      VERIFICATION_SCENARIO.MEMORY_SOAK,
      evaluateTable(SOAK_CONDITIONS, facts),
      {provenance},
      timestamp,
    ),
    buildScenarioReport(
      VERIFICATION_SCENARIO.LOCAL_ARTIFACTS,
      evaluateTable(LOCAL_ARTIFACT_CONDITIONS, facts),
      {provenance},
      timestamp,
    ),
    buildScenarioReport(
      VERIFICATION_SCENARIO.REMOTE_EXACT_SHA,
      evaluateTable(REMOTE_CONDITIONS, facts),
      {provenance},
      timestamp,
    ),
  ];
  const aggregate = buildScenarioReport(
    VERIFICATION_SCENARIO.AGGREGATE,
    aggregateConditions(children),
    {provenance},
    timestamp,
  );
  return {
    reports: [...children, aggregate],
    allPassed: childVerdict(aggregate).passed,
  };
}

export {deriveVerificationReports};
