// Preparation-side inspection of already materialized, original managed
// executions. A source-run report can contribute evidence only in its
// registered source-test scope. Physical support has its own drill producer.
import {isDeepStrictEqual} from 'node:util';

import {materializedEvidencePath, readMaterializedEvidence} from '../solve/evidence-store.js';
import {executionReportProblems, readExecutionRuns} from '../test-execution-report.js';

const MANAGED_SOURCE_PRODUCER = 'managed-source-shell';
const COMMAND = 'canonical-classified-selected-file';
const CONTROLLED_RUNNER = 'scripts/run-classified-test-files.js';
const COMPLETE = 'COMPLETE';
const SOURCE_SCOPE = 'SOURCE_TEST_EXECUTION';
const PHYSICAL_SCOPE = 'PHYSICAL_UPGRADE_AND_RECOVERY';
const RUNNER_ARGS = Object.freeze([CONTROLLED_RUNNER, '--stdin']);
const RETRY_DISABLED = '0';
const INSPECTION_REASON = Object.freeze({
  ORIGINALS_UNAVAILABLE: 'originals unavailable',
  WRONG_SCOPE: 'missing or incorrect registered source-test scope',
  BINDING_MISMATCH: 'managed execution binding mismatch',
  EMPTY_TAP: 'empty original TAP',
  PHYSICAL_ORIGINALS_UNAVAILABLE: 'physical drill originals unavailable',
});
const INSPECTION = Object.freeze({
  UNAVAILABLE: 'UNAVAILABLE',
  REFUSED: 'REFUSED',
  SOURCE_EXECUTION_VALIDATED: 'SOURCE_EXECUTION_VALIDATED',
});

function refusal(outcome, reason) {
  return {outcome, reason, physicalScope: PHYSICAL_SCOPE, physicalEvidence: INSPECTION.UNAVAILABLE};
}

function completedManagedSource(status) {
  return status.state === COMPLETE && status.exit_code === 0 &&
    status.execution_scope_closed === true && status.source_execution_started === true &&
    status.workload_started === true && status.docker_create_attempted === false;
}

function requestMatchesPlan(status, expected) {
  return status?.job_id === expected.requestId && status.host === expected.host &&
    status.generation === expected.generation && status.intentDigest === expected.intentDigest &&
    status.source?.sha === expected.sha && completedManagedSource(status);
}

function invocationMatchesPlan(invocation, expected) {
  return invocation?.registeredHost === expected.host &&
    isDeepStrictEqual(invocation.selected, expected.requiredFiles) &&
    isDeepStrictEqual(invocation.argv?.slice(1), RUNNER_ARGS) &&
    invocation.env?.LAGRANGE_RETRY_FAILED_ONCE === RETRY_DISABLED &&
    invocation.candidate?.sha === expected.sha && invocation.candidate?.tree === expected.tree;
}

function reportMatchesPlan(report, expected) {
  return report?.producer?.kind === MANAGED_SOURCE_PRODUCER &&
    report.producer.id === expected.producerId &&
    isDeepStrictEqual(report.commands, [{label: COMMAND, exitStatus: 0}]) &&
    isDeepStrictEqual(report.planned, expected.requiredFiles) &&
    isDeepStrictEqual(report.reusedProofs, []);
}

function hasRegisteredSourcePlan(expected) {
  const identity = [
    expected.requestId, expected.host, expected.generation, expected.intentDigest,
    expected.sha, expected.tree, expected.producerId,
  ];
  const files = expected.requiredFiles;
  return expected.scope === SOURCE_SCOPE &&
    identity.every((value) => typeof value === 'string' && value.length > 0) &&
    Array.isArray(files) && files.length > 0 &&
    files.every((file) => typeof file === 'string' && file.length > 0) &&
    new Set(files).size === files.length;
}

function readOriginals(root, refs) {
  const status = JSON.parse(readMaterializedEvidence(root, refs.status));
  const invocation = JSON.parse(readMaterializedEvidence(root, refs.invocation));
  const report = JSON.parse(readMaterializedEvidence(root, refs.report));
  readMaterializedEvidence(root, refs.sections);
  const runs = readExecutionRuns(materializedEvidencePath(root, refs.sections));
  return {status, invocation, report, runs};
}

// expected and its references originate in the already recorded managed
// request/custody owner. No manifest or claimed scope from the report is used
// as the expectation. The result is diagnostic, never a runtime admission input.
function inspectSupportEnvelopeSourceExecution(root, expected) {
  if (!expected?.originals) {
    return refusal(INSPECTION.UNAVAILABLE, INSPECTION_REASON.ORIGINALS_UNAVAILABLE);
  }
  if (!hasRegisteredSourcePlan(expected)) {
    return refusal(INSPECTION.REFUSED, INSPECTION_REASON.WRONG_SCOPE);
  }

  try {
    const {status, invocation, report, runs} = readOriginals(root, expected.originals);
    if (!requestMatchesPlan(status, expected) || !invocationMatchesPlan(invocation, expected) ||
      !reportMatchesPlan(report, expected) || !isDeepStrictEqual(runs, report.runs)) {
      return refusal(INSPECTION.REFUSED, INSPECTION_REASON.BINDING_MISMATCH);
    }
    const {sha, tree, requiredFiles} = expected;
    const result = executionReportProblems(report, {sha, tree, requiredFiles});
    if (result.problems.length > 0) {
      return refusal(INSPECTION.REFUSED, result.problems[0].code);
    }
    for (const file of expected.requiredFiles) {
      const bytes = readMaterializedEvidence(root, expected.originals.rawTap[file]);
      if (bytes.length === 0) return refusal(INSPECTION.REFUSED, INSPECTION_REASON.EMPTY_TAP);
    }
    return {
      ...refusal(INSPECTION.SOURCE_EXECUTION_VALIDATED,
        INSPECTION_REASON.PHYSICAL_ORIGINALS_UNAVAILABLE),
      scope: SOURCE_SCOPE,
      requestId: status.job_id,
      sha: report.candidate.sha,
      selectedFiles: [...expected.requiredFiles],
    };
  } catch (error) {
    return refusal(INSPECTION.REFUSED, error.message);
  }
}

export {inspectSupportEnvelopeSourceExecution};
