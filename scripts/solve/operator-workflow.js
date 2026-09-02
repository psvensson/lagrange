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
import {
  assertReviewCurrent,
  createReviewRequest,
} from './review-request.js';
import {loadVerifierVerdict} from './verifier-verdict.js';
import {
  LANDING_UNION_STATUS,
  landingUnionGuard,
  landingUnionGuardError,
  recordedAttemptUnion,
} from './landing-union-guard.js';
import {spawnSync} from 'node:child_process';

const VERDICT_APPROVE = 'approve';
const VERDICT_REJECT = 'reject';
const VERIFIER_APPROVAL = 'verifier-approval';
const VERIFIER_REJECTION = 'verifier-rejection';
const REJECTED_CLAIM_PREFIX = 'independent landing verification rejected';
const REJECTION_FINDING_SEPARATOR = '; ';
const VERDICT_NEEDS_REVIEW = 'needs-review';
const REVIEW_FINGERPRINT_CONFLICT =
  'land: --review supplies the fingerprint; omit --fingerprint';
const INVALID_VERDICT_PROBLEM = 'land: --verdict must be approve|reject';
const RECORDED_AGGREGATE_RECEIPT = 'recorded-aggregate-approval';
const AUTOMATIC_CHECKPOINT_REASON = 'milestone';
const CHECKPOINT_OPERATION = 'checkpoint';
const AUTO_DIFF_ARGUMENT = 'auto-diff';
const REPLACE_REJECTED_OPERATION = 'replace-rejected-attempt';
const VERDICT_FILE_ARGUMENT = 'verdict-file';
const VERDICT_FILE_CONFLICT_PROBLEM =
  'land: --verdict-file requires --review and replaces ' +
  '--verifier/--verdict/--fingerprint/--receipt/--finding';
const STRUCTURED_VERDICT_REQUIRED_PROBLEM =
  'land: this review has required templates; use --review with --verdict-file';
const GIT_BINARY = 'git';
const GIT_ENCODING = 'utf8';
const GIT_STATUS_ARGUMENTS = Object.freeze(['status', '--porcelain', '--']);
const GIT_INTENT_TO_ADD_ARGUMENTS = Object.freeze(['add', '-N', '--']);
const GIT_UNTRACKED_STATUS_PREFIX = '?? ';
const GIT_STATUS_LINE_SEPARATOR = '\n';
const UNTRACKED_REPAIR_NOTE_PREFIX =
  'land: staged intent-to-add (git add -N) for recorded untracked paths: ';
const UNTRACKED_REPAIR_PATH_SEPARATOR = ', ';
const arrayAt = Function.call.bind(Array.prototype.at);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);

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
  const summary = typeof args.summary === 'string' ? stringTrim(args.summary) : '';
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
  return {
    schemaVersion: 1,
    questId: id,
    before: before.action,
    ...execution,
    next: buildNextProjection(root, id),
  };
}

function verifierEvidence(verifier) {
  const value = typeof verifier === 'string' ? stringTrim(verifier) : '';
  if (!value) throw new Error('land: --verifier <stable-id> is required');
  return stringStartsWith(value, 'subagent:') ? value : `subagent:${value}`;
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
  const attempts = arrayFilter(
    state.attempts, (attempt) => attempt.candidateContract);
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

// A recorded candidate path that is untracked in the worktree (a git reset
// dropped its intent-to-add; measured 2026-09-01, one full diagnose/repair
// cycle) makes canonicalSourceDelta refuse to fingerprint. The path set is a
// recorded quest fact, so staging intent (git add -N — no content enters the
// index) is a safe repair. Done ONCE here, before the landing projection and
// nowhere else: canonicalSourceDelta itself stays read-only for its other
// callers. The action is named on stdout, never silent.
function stageRecordedUntrackedPaths(root, quest, log) {
  const union = recordedAttemptUnion(root, quest, log);
  if (union.length === 0) return;
  const status = spawnSync(GIT_BINARY, [...GIT_STATUS_ARGUMENTS, ...union],
    {cwd: root, encoding: GIT_ENCODING});
  if (status.status !== 0) return;
  const untracked = [];
  for (const line of String(status.stdout || '')
    .split(GIT_STATUS_LINE_SEPARATOR)) {
    if (stringStartsWith(line, GIT_UNTRACKED_STATUS_PREFIX)) {
      untracked.push(stringTrim(line.slice(GIT_UNTRACKED_STATUS_PREFIX.length)));
    }
  }
  if (untracked.length === 0) return;
  const added = spawnSync(GIT_BINARY,
    [...GIT_INTENT_TO_ADD_ARGUMENTS, ...untracked],
    {cwd: root, encoding: GIT_ENCODING});
  if (added.status !== 0) return;
  process.stdout.write(UNTRACKED_REPAIR_NOTE_PREFIX +
    arrayJoin(untracked, UNTRACKED_REPAIR_PATH_SEPARATOR) +
    GIT_STATUS_LINE_SEPARATOR);
}

function assertApprovalCanCompleteAudit(root, quest, state) {
  const audit = auditQuest(root, quest);
  // An aggregate approval recorded before `land` (the boot.md flow: verify,
  // record the structured finding, then land) leaves zero audit problems;
  // that is as landable as the single pending receipt problem `land` itself
  // discharges by recording the approval.
  const alreadyApproved = state.aggregateProblems.length === 0 &&
    audit.problems.length === 0;
  const expected = state.aggregateProblems.length === 1 ?
    state.aggregateProblems[0] : null;
  const onlyExpectedReceiptProblem = expected !== null &&
    audit.problems.length === 1 &&
    sameAuditProblem(audit.problems[0], expected);
  if (!alreadyApproved && !onlyExpectedReceiptProblem) {
    const residual = arrayFilter(audit.problems, (item) =>
      !expected || !sameAuditProblem(item, expected));
    const reported = residual.length > 0 ? residual : audit.problems;
    // verificationState and auditQuest project the same underlying failure;
    // report each distinct message once.
    const messages = [...new Set(arrayMap(reported, (item) => item.message))];
    throw new Error(
      'land: terminal audit has non-verification problems: ' +
      (arrayJoin(messages, '; ') ||
        'expected exactly one structured aggregate-approval problem'),
    );
  }
}

function resolveVerdictSubmission(root, args, quest, state, log) {
  let reviewId = typeof args.review === 'string' ? stringTrim(args.review) : '';
  const verdictFile = typeof args[VERDICT_FILE_ARGUMENT] === 'string' ?
    stringTrim(args[VERDICT_FILE_ARGUMENT]) : '';
  if (verdictFile && (!reviewId || args.verifier || args.verdict ||
    args.fingerprint || args.receipt || args.finding)) {
    throw new Error(VERDICT_FILE_CONFLICT_PROBLEM);
  }
  let verdict = typeof args.verdict === 'string' ? stringTrim(args.verdict) : '';
  let fingerprint = typeof args.fingerprint === 'string' ?
    stringTrim(args.fingerprint) : '';
  let evidence;
  let receiptRef = typeof args.receipt === 'string' ? stringTrim(args.receipt) : '';
  let structuredVerdict = null;
  let scope;
  let receipt;
  let request;
  if (!reviewId) {
    // Compatibility flags are only an adapter into the immutable review
    // interaction; they never derive candidate facts or bypass preflight.
    request = createReviewRequest(root, quest, state, log);
    reviewId = request.id;
    if (fingerprint) receiptForVerdict(state, verdict, fingerprint);
  } else {
    if (fingerprint) throw new Error(REVIEW_FINGERPRINT_CONFLICT);
    request = assertReviewCurrent(root, quest, state, reviewId, log);
  }
  if (verdictFile) {
    structuredVerdict = loadVerifierVerdict(root, verdictFile, request);
    verdict = structuredVerdict.verdict;
    evidence = verifierEvidence(structuredVerdict.verifierId);
    receiptRef = structuredVerdict.externalReceiptRef;
  } else {
    if ((request.manifest.requiredReviewTemplates || []).length > 0) {
      throw new Error(STRUCTURED_VERDICT_REQUIRED_PROBLEM);
    }
    evidence = verifierEvidence(args.verifier);
  }
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
  return {reviewId, verdict, fingerprint, evidence, receiptRef,
    structuredVerdict, scope, receipt};
}

export function landQuestWorkflow(root, args = {}) {
  const id = requireId(args, 'land');
  const quest = loadQuest(root, id);
  const log = readLog(root, id);
  const before = buildNextProjection(root, id);
  if (!arrayIncludes(['solved', 'exhausted'], before.quest.status)) {
    throw new Error('land: Quest must be terminal before recording a landing verdict');
  }
  stageRecordedUntrackedPaths(root, quest, log);
  const state = verificationState(root, quest, log);
  // Before any branch and before any commit: every dirty path outside solve/
  // must be covered by a recorded attempt. A refused attempt record (for
  // example a scope-pressure blocked-scope gate-decision) leaves its paths
  // uncovered, and a green doneWhen receipt never authorizes a source
  // landing — the typed block names the paths; nothing is committed and no
  // verdict is recorded.
  const unionGuard = landingUnionGuard(root, quest, log);
  if (unionGuard.status === LANDING_UNION_STATUS.UNCOVERED) {
    throw landingUnionGuardError(unionGuard);
  }
  if (state.attempts.length === 0) {
    // Evidence-only landing: no recorded source attempt and (guard above)
    // no uncovered source delta, so no verifier is required.
    if (args.verifier || args.verdict || args.fingerprint || args.receipt ||
      args.review || args[VERDICT_FILE_ARGUMENT]) {
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
      next: buildNextProjection(root, id),
    };
  }
  const reviewId = typeof args.review === 'string' ? stringTrim(args.review) : '';
  const verdictFile = typeof args[VERDICT_FILE_ARGUMENT] === 'string' ?
    stringTrim(args[VERDICT_FILE_ARGUMENT]) : '';
  const hasVerdictInput = Boolean(
    args.verifier || args.verdict || args.fingerprint || args.receipt ||
    args.finding || reviewId || verdictFile,
  );
  if (!hasVerdictInput) {
    assertApprovalCanCompleteAudit(root, quest, state);
    if (state.aggregateApproval) {
      const commit = autoCommitQuest(root, id);
      return {
        schemaVersion: 1,
        questId: id,
        verdict: VERDICT_APPROVE,
        fingerprint: state.aggregate.fingerprint,
        receiptRef: RECORDED_AGGREGATE_RECEIPT,
        committed: commit.committed,
        commit,
        next: buildNextProjection(root, id),
      };
    }
    const review = createReviewRequest(root, quest, state, log);
    return {
      schemaVersion: 1,
      questId: id,
      verdict: VERDICT_NEEDS_REVIEW,
      review,
      fingerprint: null,
      receiptRef: null,
      committed: false,
      next: buildNextProjection(root, id),
    };
  }
  const {verdict, fingerprint, evidence, receiptRef, structuredVerdict,
    scope, receipt} = resolveVerdictSubmission(root, args, quest, state, log);
  const kind = verdict === VERDICT_APPROVE ? VERIFIER_APPROVAL : VERIFIER_REJECTION;
  const latest = (receipt.attempts ? arrayAt(receipt.attempts, -1) : null) ||
    arrayAt(state.attempts, -1);
  const frontier = latest?.event?.frontier || quest.frontiers?.[0]?.id;
  if (!frontier) throw new Error('land: current candidate has no frontier');
  if (!receiptRef) throw new Error('land: --receipt <verifier-receipt-ref> is required');
  if (verdict === VERDICT_APPROVE) {
    assertApprovalCanCompleteAudit(root, quest, state);
  }
  // The durable claim must carry the verifier's category-complete finding
  // list, never only a receipt pointer: the amendment excerpt rule,
  // `theory option --from-rejection`, and any later post-mortem all read this
  // event, and a pointer satisfies them mechanically with zero content.
  const rejectionFindings = verdict === VERDICT_REJECT ?
    (structuredVerdict?.findings || parseRejectionFindings(args.finding)) : [];
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
  if (reviewId) {
    verification.reviewEnvelope = {
      reviewId,
      verdictFile: structuredVerdict?.file || null,
      completedTemplateItems: structuredVerdict?.completedTemplateItems || [],
    };
  }
  appendFinding(root, id, {
    frontier,
    claim: verdict === VERDICT_APPROVE ?
      `independent landing verification passed${receiptRef ? ` (${receiptRef})` : ''}` :
      REJECTED_CLAIM_PREFIX +
        `${receiptRef ? ` (${receiptRef})` : ''}: ` +
        arrayJoin(arrayMap(rejectionFindings,
          (finding) => `${finding.category}: ${finding.summary}`),
        REJECTION_FINDING_SEPARATOR),
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
    next: buildNextProjection(root, id),
  };
}
