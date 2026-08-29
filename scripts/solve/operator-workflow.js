// Three-verb operator façade over the component Quest machinery.
//
// The human-readable `action.value` is deliberately never parsed or executed.
// Dispatch is limited to stable action codes and validated payloads produced by
// buildNextProjection. Component commands remain available for diagnostics.

import {
  appendFinding,
  loadQuest,
  readLog,
} from './store.js';
import {buildDoctorReport} from './doctor.js';
import {lintQuestCorpus} from './quest-lint.js';
import {buildNextProjection} from './next.js';
import {
  isAttemptRecordActionCode,
  NEXT_ACTION_CODE,
} from './next-action.js';
import {runStep} from './step.js';
import {
  buildVerificationFinding,
  VERIFICATION_CONTRACT_VERSION,
  VERIFICATION_SCOPE,
  verificationState,
} from './verification.js';
import {
  parseRejectionFindings,
  rejectionFindingBarProblem,
  REJECTION_FINDING_USAGE,
} from './rejection-findings.js';
import {autoCommitQuest, runCheckpointCommand} from './handoff.js';
import {auditQuest} from './audit.js';
import {ingestDeclaredProbeEvidence} from './declared-probe-evidence.js';
import {terminalReadiness} from './terminal-readiness.js';
import {
  assertReviewCurrent,
  createReviewRequest,
} from './review-request.js';

const VERDICT_APPROVE = 'approve';
const VERDICT_REJECT = 'reject';
const VERIFIER_APPROVAL = 'verifier-approval';
const VERIFIER_REJECTION = 'verifier-rejection';
const REJECTED_CLAIM_PREFIX = 'independent landing verification rejected';
const REJECTION_FINDING_SEPARATOR = '; ';
const VERDICT_NEEDS_REVIEW = 'needs-review';
const VERDICT_BLOCKED = 'blocked';
const REVIEW_FINGERPRINT_CONFLICT =
  'land: --review supplies the fingerprint; omit --fingerprint';
const INVALID_VERDICT_PROBLEM = 'land: --verdict must be approve|reject';
const RECORDED_AGGREGATE_RECEIPT = 'recorded-aggregate-approval';
const AUTOMATIC_CHECKPOINT_REASON = 'milestone';
const CHECKPOINT_OPERATION = 'checkpoint';
const AUTO_DIFF_ARGUMENT = 'auto-diff';
const REPLACE_REJECTED_OPERATION = 'replace-rejected-attempt';

function requireId(args, command) {
  const id = args.id || args._?.[0];
  if (!id) throw new Error(`${command}: --id <questId> is required`);
  return id;
}

function assertStructuredAction(action, questId) {
  if (!action || typeof action.code !== 'string' ||
    !action.payload || action.payload.questId !== questId) {
    throw new Error(
      'continue: next action lacks a trusted structured code/payload; inspect with solve next',
    );
  }
}

function explicitCommitOptions(args) {
  const changeRef = typeof args.changeRef === 'string' ? args.changeRef : null;
  const summary = typeof args.summary === 'string' ? args.summary.trim() : '';
  const autoDiff = args[AUTO_DIFF_ARGUMENT] === true ||
    (!changeRef && summary.length > 0);
  if (changeRef && autoDiff) {
    throw new Error('continue: pass exactly one of --changeRef or --auto-diff');
  }
  if (!summary) throw new Error('continue: commit requires --summary "<what changed>"');
  return {
    changeRef: changeRef || undefined,
    autoDiff,
    summary,
    theoryRef: typeof args.theoryRef === 'string' ? args.theoryRef :
      (typeof args.theory === 'string' ? args.theory : undefined),
    expectedMovement: typeof args.expectedMovement === 'string' ?
      args.expectedMovement : undefined,
    negativeResultMeans: typeof args.negativeResultMeans === 'string' ?
      args.negativeResultMeans : undefined,
    modelRef: typeof args.modelRef === 'string' ? args.modelRef : undefined,
    modelNotApplicable: typeof args.modelNotApplicable === 'string' ?
      args.modelNotApplicable : undefined,
  };
}

function executeStructuredContinuation(root, quest, action, args) {
  if (action.code === NEXT_ACTION_CODE.BEGIN_STEP) {
    if (args.changeRef || args[AUTO_DIFF_ARGUMENT] || args.summary) {
      throw new Error('continue: begin-step does not accept commit capture arguments');
    }
    return {executed: true, operation: 'begin-step', result: runStep(root, quest)};
  }
  if (isAttemptRecordActionCode(action.code)) {
    return {
      executed: true,
      operation: NEXT_ACTION_CODE.RECORD_ATTEMPT,
      result: runStep(root, quest, explicitCommitOptions(args)),
    };
  }
  if (action.code === NEXT_ACTION_CODE.REPLACE_REJECTED_ATTEMPT) {
    const phase = action.payload.phase;
    if (phase === 'begin') {
      if (args.changeRef || args[AUTO_DIFF_ARGUMENT] || args.summary) {
        const begin = runStep(root, quest);
        return {
          executed: true,
          operation: REPLACE_REJECTED_OPERATION,
          begin,
          result: runStep(root, quest, explicitCommitOptions(args)),
        };
      }
      return {
        executed: true,
        operation: 'replace-rejected-attempt:begin',
        result: runStep(root, quest),
      };
    }
    if (phase === 'commit') {
      return {
        executed: true,
        operation: 'replace-rejected-attempt:commit',
        result: runStep(root, quest, explicitCommitOptions(args)),
      };
    }
    throw new Error('continue: replacement action has an invalid phase');
  }
  if (action.code === NEXT_ACTION_CODE.CHECKPOINT) {
    return {
      executed: true,
      operation: CHECKPOINT_OPERATION,
      result: runCheckpointCommand(root, {
        id: quest.id,
        reason: AUTOMATIC_CHECKPOINT_REASON,
      }),
    };
  }
  return {executed: false, operation: null, result: null};
}

export function startQuestWorkflow(root, args = {}) {
  const id = requireId(args, 'start');
  const doctor = args.doctor || buildDoctorReport(root);
  const lint = lintQuestCorpus(root, {id});
  const next = lint.status === 'pass' ? buildNextProjection(root, id) : null;
  return {
    schemaVersion: 1,
    ok: doctor.ok && lint.status === 'pass',
    questId: id,
    doctor,
    lint,
    next,
  };
}

export function continueQuestWorkflow(root, args = {}) {
  const id = requireId(args, 'continue');
  const quest = loadQuest(root, id);
  const before = buildNextProjection(root, id);
  assertStructuredAction(before.action, id);
  const execution = executeStructuredContinuation(root, quest, before.action, args);
  const ingestedEvidence = ingestDeclaredProbeEvidence(root, quest);
  return {
    schemaVersion: 1,
    questId: id,
    before: before.action,
    ...execution,
    ingestedEvidence,
    next: buildNextProjection(root, id),
  };
}

function verifierEvidence(verifier) {
  const value = typeof verifier === 'string' ? verifier.trim() : '';
  if (!value) throw new Error('land: --verifier <stable-id> is required');
  return value.startsWith('subagent:') ? value : `subagent:${value}`;
}

function candidateReceipt(state, fingerprint) {
  if (!state.candidate?.ok || state.candidate.fingerprint !== fingerprint) {
    throw new Error('land: rejection fingerprint does not match current candidate bytes');
  }
  return {
    scope: VERIFICATION_SCOPE.CANDIDATE,
    receipt: state.candidate,
  };
}

function aggregateReceipt(state, fingerprint) {
  const attempts = state.attempts.filter((attempt) => attempt.candidateContract);
  if (!state.aggregate?.ok || state.aggregate.fingerprint !== fingerprint ||
    attempts.length === 0) {
    throw new Error('land: approval fingerprint does not match current aggregate bytes');
  }
  return {
    scope: VERIFICATION_SCOPE.AGGREGATE,
    receipt: {
      ...state.aggregate,
      sourcePaths: state.aggregate.paths,
      firstAttemptIndex: attempts[0].index,
      lastAttemptIndex: attempts[attempts.length - 1].index,
    },
  };
}

function receiptForVerdict(state, verdict, fingerprint) {
  if (verdict === VERDICT_APPROVE) return aggregateReceipt(state, fingerprint);
  if (verdict === VERDICT_REJECT) return candidateReceipt(state, fingerprint);
  throw new Error('land: --verdict must be approve|reject');
}

function sameAuditProblem(left, right) {
  return left?.message === right?.message &&
    left?.ts === right?.ts &&
    left?.frontier === right?.frontier;
}

function assertApprovalCanCompleteAudit(root, quest, state) {
  const audit = auditQuest(root, quest);
  const alreadyApproved = state.aggregateProblems.length === 0 &&
    audit.problems.length === 0;
  const expected = state.aggregateProblems.length === 1 ?
    state.aggregateProblems[0] : null;
  const onlyExpectedReceiptProblem = expected !== null &&
    audit.problems.length === 1 &&
    sameAuditProblem(audit.problems[0], expected);
  if (!alreadyApproved && !onlyExpectedReceiptProblem) {
    const residual = audit.problems.filter((item) =>
      !expected || !sameAuditProblem(item, expected));
    const reported = residual.length > 0 ? residual : audit.problems;
    throw new Error(
      'land: terminal audit has non-verification problems: ' +
      (reported.map((item) => item.message).join('; ') ||
        'expected exactly one structured aggregate-approval problem'),
    );
  }
}

export function landQuestWorkflow(root, args = {}) {
  const id = requireId(args, 'land');
  const quest = loadQuest(root, id);
  const ingestedEvidence = ingestDeclaredProbeEvidence(root, quest);
  const log = readLog(root, id);
  const before = buildNextProjection(root, id);
  if (!['solved', 'exhausted'].includes(before.quest.status)) {
    throw new Error('land: Quest must be terminal before recording a landing verdict');
  }
  const state = verificationState(root, quest, log);
  if (state.attempts.length === 0) {
    if (args.verifier || args.verdict || args.fingerprint || args.receipt ||
      args.review) {
      throw new Error('land: this candidate has no source changes and needs no verifier');
    }
    const commit = autoCommitQuest(root, id);
    return {
      schemaVersion: 1,
      questId: id,
      verdict: 'not-required',
      fingerprint: null,
      receiptRef: null,
      committed: commit.committed,
      commit,
      ingestedEvidence,
      next: buildNextProjection(root, id),
    };
  }
  const reviewId = typeof args.review === 'string' ? args.review.trim() : '';
  const hasVerdictInput = Boolean(
    args.verifier || args.verdict || args.fingerprint || args.receipt ||
    args.finding || reviewId,
  );
  if (!hasVerdictInput) {
    if (state.aggregateApproval) {
      assertApprovalCanCompleteAudit(root, quest, state);
      const commit = autoCommitQuest(root, id);
      return {
        schemaVersion: 1,
        questId: id,
        verdict: VERDICT_APPROVE,
        fingerprint: state.aggregate.fingerprint,
        receiptRef: RECORDED_AGGREGATE_RECEIPT,
        committed: commit.committed,
        commit,
        ingestedEvidence,
        next: buildNextProjection(root, id),
      };
    }
    const readiness = terminalReadiness(root, quest, state);
    if (!readiness.readyForReview) {
      return {
        schemaVersion: 1,
        questId: id,
        verdict: VERDICT_BLOCKED,
        fingerprint: state.aggregate.fingerprint,
        receiptRef: null,
        committed: false,
        readiness,
        ingestedEvidence,
        next: buildNextProjection(root, id),
      };
    }
    const review = createReviewRequest(root, quest, state);
    return {
      schemaVersion: 1,
      questId: id,
      verdict: VERDICT_NEEDS_REVIEW,
      review,
      fingerprint: null,
      receiptRef: null,
      committed: false,
      readiness,
      ingestedEvidence,
      next: buildNextProjection(root, id),
    };
  }
  const verdict = typeof args.verdict === 'string' ? args.verdict.trim() : '';
  let fingerprint = typeof args.fingerprint === 'string' ?
    args.fingerprint.trim() : '';
  const evidence = verifierEvidence(args.verifier);
  let scope;
  let receipt;
  if (reviewId) {
    if (fingerprint) {
      throw new Error(REVIEW_FINGERPRINT_CONFLICT);
    }
    const request = assertReviewCurrent(root, quest, state, reviewId);
    if (verdict === VERDICT_APPROVE) {
      scope = VERIFICATION_SCOPE.AGGREGATE;
      receipt = request.manifest.aggregate;
    } else if (verdict === VERDICT_REJECT) {
      scope = VERIFICATION_SCOPE.CANDIDATE;
      receipt = request.manifest.candidate;
    } else {
      throw new Error(INVALID_VERDICT_PROBLEM);
    }
    fingerprint = receipt.fingerprint;
  } else {
    ({scope, receipt} = receiptForVerdict(state, verdict, fingerprint));
  }
  const kind = verdict === VERDICT_APPROVE ? VERIFIER_APPROVAL : VERIFIER_REJECTION;
  const latest = receipt.attempts?.at(-1) || state.attempts.at(-1);
  const frontier = latest?.event?.frontier || quest.frontiers?.[0]?.id;
  if (!frontier) throw new Error('land: current candidate has no frontier');
  const receiptRef = typeof args.receipt === 'string' ? args.receipt.trim() : '';
  if (!receiptRef) throw new Error('land: --receipt <verifier-receipt-ref> is required');
  if (verdict === VERDICT_APPROVE) {
    assertApprovalCanCompleteAudit(root, quest, state);
  }
  const rejectionFindings = verdict === VERDICT_REJECT ?
    parseRejectionFindings(args.finding) : [];
  if (verdict === VERDICT_REJECT) {
    if (rejectionFindings.length === 0) {
      throw new Error(
        `land: a rejection requires ${REJECTION_FINDING_USAGE}`);
    }
    const barProblem = rejectionFindingBarProblem(quest, log, rejectionFindings);
    if (barProblem) throw new Error(`land: ${barProblem}`);
  }
  const verification = buildVerificationFinding({
    kind,
    evidence,
    verificationScope: scope,
    verificationFingerprint: fingerprint,
    verificationReceipt: receipt,
    verificationSchemaVersion: VERIFICATION_CONTRACT_VERSION,
    rejectionFindings,
  });
  appendFinding(root, id, {
    frontier,
    claim: verdict === VERDICT_APPROVE ?
      `independent landing verification passed${receiptRef ? ` (${receiptRef})` : ''}` :
      REJECTED_CLAIM_PREFIX +
        `${receiptRef ? ` (${receiptRef})` : ''}: ` +
        rejectionFindings.map(
          (finding) => `${finding.category}: ${finding.summary}`)
          .join(REJECTION_FINDING_SEPARATOR),
    kind,
    evidence,
    verification,
  });
  if (verdict === VERDICT_REJECT) {
    return {
      schemaVersion: 1,
      questId: id,
      verdict,
      fingerprint,
      receiptRef,
      committed: false,
      ingestedEvidence,
      next: buildNextProjection(root, id),
    };
  }
  const commit = autoCommitQuest(root, id);
  return {
    schemaVersion: 1,
    questId: id,
    verdict,
    fingerprint,
    receiptRef,
    committed: commit.committed,
    commit,
    ingestedEvidence,
    next: buildNextProjection(root, id),
  };
}