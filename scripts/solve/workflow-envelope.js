const SCOPE_PATTERN = /scope-pressure|scope pressure/iu;
const SUMMARY_PATTERN = /requires --summary|commit requires --summary/iu;
const VERIFICATION_PATTERN = /verification|verifier|approval|fingerprint/iu;
const AUDIT_PATTERN = /audit|preflight/iu;
const CODE_SCOPE_GREW = 'scope-grew';
const CATEGORY_SCOPE = 'scope';
const REPAIR_RECORD_COVERED_SCOPE = 'record-covered-scope';
const CODE_SUMMARY_REQUIRED = 'summary-required';
const CATEGORY_INPUT = 'input';
const REPAIR_PROVIDE_ATTEMPT_SUMMARY = 'provide-attempt-summary';
const CODE_VERIFICATION_REQUIRED = 'verification-required';
const CATEGORY_VERIFICATION = 'verification';
const REPAIR_REQUEST_VERIFICATION = 'request-verification';
const CODE_AUDIT_REPAIR_REQUIRED = 'audit-repair-required';
const CATEGORY_AUDIT = 'audit';
const REPAIR_AUDIT = 'repair-audit';
const CODE_OPERATOR_ACTION_REQUIRED = 'operator-action-required';
const CATEGORY_OPERATOR = 'operator';

function errorShape(code, category, message, requiresJudgment, repair) {
  return {
    ok: false,
    error: {code, category, message, requiresJudgment, repair},
  };
}

export function workflowSuccess(result) {
  return {...result, ok: result?.ok !== false};
}

export function workflowFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (SCOPE_PATTERN.test(message)) {
    return errorShape(CODE_SCOPE_GREW, CATEGORY_SCOPE, message, false, {
      code: REPAIR_RECORD_COVERED_SCOPE,
      payload: {
        paths: Array.isArray(error?.scopePaths) ? error.scopePaths : [],
        splitPlan: Array.isArray(error?.scopeSplitPlan) ? error.scopeSplitPlan : [],
      },
    });
  }
  if (SUMMARY_PATTERN.test(message)) {
    return errorShape(CODE_SUMMARY_REQUIRED, CATEGORY_INPUT, message, false, {
      code: REPAIR_PROVIDE_ATTEMPT_SUMMARY,
      payload: {summary: ''},
    });
  }
  if (VERIFICATION_PATTERN.test(message)) {
    return errorShape(
      CODE_VERIFICATION_REQUIRED, CATEGORY_VERIFICATION, message, true, {
        code: REPAIR_REQUEST_VERIFICATION,
        payload: {},
      },
    );
  }
  if (AUDIT_PATTERN.test(message)) {
    return errorShape(CODE_AUDIT_REPAIR_REQUIRED, CATEGORY_AUDIT, message, true, {
      code: REPAIR_AUDIT,
      payload: {},
    });
  }
  return errorShape(
    CODE_OPERATOR_ACTION_REQUIRED, CATEGORY_OPERATOR, message, true, null);
}
