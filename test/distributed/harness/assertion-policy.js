import {
  ASSERTION_POLICY,
  ASSERTION_STATUS,
  CONSISTENCY_VERDICT,
  VERIFICATION_CONFIDENCE,
} from './constants.js';
import {summarizeInvariantBreaches} from './invariant-breaches.js';

const ZERO = 0;
const POLICY_KEY_INSUFFICIENT_EVIDENCE = 'insufficientEvidence';
const POLICY_DEFAULT_INSUFFICIENT_EVIDENCE = ASSERTION_POLICY.SOFT;
const HARD_FAILURE_CODE_INCONSISTENT = 'inconsistent';
const HARD_FAILURE_CODE_INSUFFICIENT_EVIDENCE = 'insufficient_evidence';
const HARD_FAILURE_CODE_INVALID_LOAD_METRICS = 'invalid_load_metrics';
const HARD_FAILURE_CODE_ZERO_SUCCESS = 'zero_successful_operations';
const HARD_FAILURE_CODE_LOAD_FAILED_OPERATIONS = 'load_failed_operations';
const HARD_FAILURE_CODE_LOAD_OPERATION_ERRORS = 'load_operation_errors';
const HARD_FAILURE_CODE_INVARIANT_BREACH = 'hard_invariant_breach';

function hasFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function normalizeInsufficientEvidencePolicy(policy) {
  const configured = policy && typeof policy === 'object' ?
    policy[POLICY_KEY_INSUFFICIENT_EVIDENCE] :
    null;
  if (configured === ASSERTION_POLICY.HARD || configured === ASSERTION_POLICY.SOFT) {
    return configured;
  }
  return POLICY_DEFAULT_INSUFFICIENT_EVIDENCE;
}

function collectLoadMetricHardFailures(loadMetrics) {
  const hardFailures = [];
  if (!loadMetrics || typeof loadMetrics !== 'object' ||
      !hasFiniteNumber(loadMetrics.total) ||
      !hasFiniteNumber(loadMetrics.success) ||
      !hasFiniteNumber(loadMetrics.failed) ||
      !hasFiniteNumber(loadMetrics.errors) ||
      !hasFiniteNumber(loadMetrics.opsPerSec)) {
    hardFailures.push({
      code: HARD_FAILURE_CODE_INVALID_LOAD_METRICS,
      message: 'load metrics are missing or invalid',
    });
    return hardFailures;
  }

  if (Number(loadMetrics.success) <= ZERO) {
    hardFailures.push({
      code: HARD_FAILURE_CODE_ZERO_SUCCESS,
      message: 'load run completed with zero successful operations',
    });
    return hardFailures;
  }

  if (Number(loadMetrics.failed) > ZERO) {
    hardFailures.push({
      code: HARD_FAILURE_CODE_LOAD_FAILED_OPERATIONS,
      message: 'load run completed with failed operations',
    });
  }
  if (Number(loadMetrics.errors) > ZERO) {
    hardFailures.push({
      code: HARD_FAILURE_CODE_LOAD_OPERATION_ERRORS,
      message: 'load run completed with operation errors',
    });
  }
  return hardFailures;
}

function evaluateAssertionPolicy(options = {}) {
  const policy = {
    [POLICY_KEY_INSUFFICIENT_EVIDENCE]: normalizeInsufficientEvidencePolicy(
      options.policy,
    ),
  };
  const hardFailures = [];
  const softWarnings = [];
  const loadMetrics = options.loadMetrics || null;
  const invariantBreaches = summarizeInvariantBreaches(options.invariants);

  hardFailures.push(...collectLoadMetricHardFailures(loadMetrics));

  const consistencyVerdict = String(
    options.consistencyVerdict || CONSISTENCY_VERDICT.CONSISTENT,
  );
  if (consistencyVerdict === CONSISTENCY_VERDICT.INCONSISTENT) {
    hardFailures.push({
      code: HARD_FAILURE_CODE_INCONSISTENT,
      message: 'consistency evaluator reported invariant mismatches',
    });
  } else if (consistencyVerdict === CONSISTENCY_VERDICT.INSUFFICIENT_EVIDENCE) {
    if (policy[POLICY_KEY_INSUFFICIENT_EVIDENCE] === ASSERTION_POLICY.HARD) {
      hardFailures.push({
        code: HARD_FAILURE_CODE_INSUFFICIENT_EVIDENCE,
        message: 'insufficient consistency evidence escalated to hard failure',
      });
    } else {
      softWarnings.push({
        code: HARD_FAILURE_CODE_INSUFFICIENT_EVIDENCE,
        message: 'insufficient consistency evidence (soft warning)',
      });
    }
  }

  if (invariantBreaches.hardCount > ZERO) {
    hardFailures.push({
      code: HARD_FAILURE_CODE_INVARIANT_BREACH,
      message: 'hard invariant breaches reported by runtime or harness diagnostics',
      invariantBreaches: invariantBreaches.hardBreaches,
    });
  }

  if (hardFailures.length > ZERO) {
    return {
      passed: false,
      status: ASSERTION_STATUS.FAILED,
      verificationConfidence: VERIFICATION_CONFIDENCE.LOW,
      hardFailures,
      softWarnings,
      policy,
      loadMetrics,
      invariantBreaches,
    };
  }

  if (softWarnings.length > ZERO) {
    return {
      passed: true,
      status: ASSERTION_STATUS.PASSED_WITH_WARNINGS,
      verificationConfidence: VERIFICATION_CONFIDENCE.MEDIUM,
      hardFailures,
      softWarnings,
      policy,
      loadMetrics,
      invariantBreaches,
    };
  }

  return {
    passed: true,
    status: ASSERTION_STATUS.PASSED,
    verificationConfidence: VERIFICATION_CONFIDENCE.HIGH,
    hardFailures,
    softWarnings,
    policy,
    loadMetrics,
    invariantBreaches,
  };
}

export {evaluateAssertionPolicy, collectLoadMetricHardFailures};
