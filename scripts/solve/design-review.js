// Declaration-bound adversarial design review for newly authored Quests.
//
// Version 2 makes declaration an explicit, read-only-to-work boundary: an
// independent reviewer approves the immutable sealed declaration before any
// executor, measured/non-measuring attempt, park, or terminal can run. Older
// authoring contracts retain their historical behavior.

import crypto from 'node:crypto';

import {
  EVENT_ATTEMPT,
  EVENT_FINDING,
  EVENT_NON_MEASUREMENT,
  EVENT_PARK,
  EVENT_QUEST,
  EVENT_QUEST_DECLARED,
  EVENT_SOLVED,
} from './constants.js';
import {stableStringify} from './probe-spec.js';
import {validVerifierEvidence} from './verification.js';

const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const FINGERPRINT_PREFIX = 'sha256:';
const REVIEW_FINDING_KIND = 'design-review';
const REVIEW_VERDICT_APPROVE = 'approve';
const REVIEW_VERDICT_REJECT = 'reject';
const STATE_NOT_REQUIRED = 'not-required';
const STATE_UNDECLARED = 'undeclared';
const STATE_MISSING = 'missing';
const STATE_READY = 'ready';
const STATE_LATE = 'late';
const STATE_INVALID = 'invalid';
const PROBLEM_RECEIPT_MISSING =
  'design-review finding is missing its structured receipt';
const PROBLEM_QUEST_MISMATCH =
  'design-review receipt names a different Quest';
const PROBLEM_DECLARATION_MISMATCH =
  'design-review receipt does not match the sealed declaration';
const PROBLEM_VERDICT_INVALID =
  'design-review receipt has an invalid verdict';
const PROBLEM_REVIEWER_INVALID =
  'design-review receipt has invalid or conflicting reviewer evidence';
const PROBLEM_FRONTIER_INVALID =
  'design-review receipt has an unknown or conflicting frontier';
const PROBLEM_UNDECLARED =
  'Quest must be explicitly declared before independent design review';
const PROBLEM_PREDECLARATION_EXECUTION =
  'execution or terminal history predates the sealed declaration';
const PROBLEM_MISPLACED =
  'design-review receipt was recorded outside the declaration-to-execution window';
const PROBLEM_BOUNDARY_PRECEDES_REVIEW =
  'first execution or terminal boundary predates design-review approval';
const PROBLEM_REVIEW_REQUIRED =
  'independent design-review approval is required before first execution';
const PROBLEM_REJECTED =
  'latest independent design-review verdict rejects the sealed design';
const ERROR_REQUIRES_DECLARATION =
  'finding: design-review requires an explicitly declared v2 Quest';
const ERROR_REVIEW_LATE =
  'finding: design-review cannot be recorded after execution or terminal';
const ERROR_VERDICT_REQUIRED =
  'finding: --design-review-verdict approve|reject is required';
const ERROR_EVIDENCE_REQUIRED =
  'finding: design-review requires --evidence subagent:<stable-id>';
const ERROR_FRONTIER_INVALID =
  'finding: design-review frontier is not in the sealed declaration';
const ERROR_FINGERPRINT_MISMATCH =
  'finding: --declaration-fingerprint does not match the sealed Quest';
const REVIEW_VERDICTS = Object.freeze([
  REVIEW_VERDICT_APPROVE,
  REVIEW_VERDICT_REJECT,
]);
const EXECUTION_BOUNDARY_TYPES = new Set([
  EVENT_ATTEMPT,
  EVENT_NON_MEASUREMENT,
  EVENT_PARK,
  EVENT_QUEST,
  EVENT_SOLVED,
]);

export const DESIGN_REVIEW_AUTHORING_CONTRACT_VERSION = 2;
export const DESIGN_REVIEW_SCHEMA_VERSION = 1;
export const DESIGN_REVIEW_FINDING_KIND = REVIEW_FINDING_KIND;
export const DESIGN_REVIEW_STATE = Object.freeze({
  NOT_REQUIRED: STATE_NOT_REQUIRED,
  UNDECLARED: STATE_UNDECLARED,
  MISSING: STATE_MISSING,
  READY: STATE_READY,
  LATE: STATE_LATE,
  INVALID: STATE_INVALID,
});

function hash(value) {
  return crypto.createHash(HASH_ALGORITHM).update(value).digest(HASH_ENCODING);
}

export function designReviewDeclarationFingerprint(declaration) {
  if (!declaration?.sealed) return null;
  return `${FINGERPRINT_PREFIX}${hash(stableStringify(declaration.sealed))}`;
}

function declaredVersion(quest, declaration) {
  return declaration?.sealed?.authoringContractVersion ??
    quest?.authoringContractVersion ?? null;
}

function isExecutionBoundary(event) {
  return EXECUTION_BOUNDARY_TYPES.has(event?.type);
}

export function preDeclarationExecutionBoundary(log) {
  const declarationIndex = log.findIndex(
    (event) => event.type === EVENT_QUEST_DECLARED,
  );
  const limit = declarationIndex < 0 ? log.length : declarationIndex;
  const index = log.findIndex(
    (event, eventIndex) => eventIndex < limit && isExecutionBoundary(event),
  );
  return index < 0 ? null : {index, event: log[index]};
}

function receiptProblem(event, quest, declaration, declarationIndex) {
  const receipt = event?.designReview;
  const fingerprint = designReviewDeclarationFingerprint(declaration);
  if (!receipt || receipt.schemaVersion !== DESIGN_REVIEW_SCHEMA_VERSION) {
    return PROBLEM_RECEIPT_MISSING;
  }
  if (receipt.questId !== quest.id) {
    return PROBLEM_QUEST_MISMATCH;
  }
  if (receipt.declarationFingerprint !== fingerprint ||
    receipt.declarationIndex !== declarationIndex) {
    return PROBLEM_DECLARATION_MISMATCH;
  }
  if (!REVIEW_VERDICTS.includes(receipt.verdict)) {
    return PROBLEM_VERDICT_INVALID;
  }
  if (!validVerifierEvidence(event.evidence) ||
    receipt.reviewer !== event.evidence) {
    return PROBLEM_REVIEWER_INVALID;
  }
  if (!declaration.sealed.frontierIds?.includes(event.frontier) ||
    receipt.frontier !== event.frontier) {
    return PROBLEM_FRONTIER_INVALID;
  }
  return null;
}

function projectionProblem(message, event = null) {
  return {
    message,
    ts: event?.ts || null,
    frontier: event?.frontier || null,
  };
}

export function designReviewProjection(quest, log) {
  const declarationIndex = log.findIndex(
    (event) => event.type === EVENT_QUEST_DECLARED,
  );
  const declaration = declarationIndex < 0 ? null : log[declarationIndex];
  const version = declaredVersion(quest, declaration);
  if (version === null || version === 1) {
    return {
      required: false,
      state: DESIGN_REVIEW_STATE.NOT_REQUIRED,
      ready: true,
      problems: [],
      declarationFingerprint: null,
      declarationIndex,
      receipt: null,
    };
  }
  if (version !== DESIGN_REVIEW_AUTHORING_CONTRACT_VERSION) {
    return {
      required: true,
      state: DESIGN_REVIEW_STATE.INVALID,
      ready: false,
      problems: [projectionProblem(
        `unsupported sealed authoring contract version: ${version}`,
      )],
      declarationFingerprint: null,
      declarationIndex,
      receipt: null,
    };
  }
  if (!declaration) {
    return {
      required: true,
      state: DESIGN_REVIEW_STATE.UNDECLARED,
      ready: false,
      problems: [projectionProblem(
        PROBLEM_UNDECLARED,
      )],
      declarationFingerprint: null,
      declarationIndex: -1,
      receipt: null,
    };
  }

  const priorBoundary = preDeclarationExecutionBoundary(log);
  if (priorBoundary) {
    return {
      required: true,
      state: DESIGN_REVIEW_STATE.LATE,
      ready: false,
      problems: [projectionProblem(
        PROBLEM_PREDECLARATION_EXECUTION,
        priorBoundary.event,
      )],
      declarationFingerprint: designReviewDeclarationFingerprint(declaration),
      declarationIndex,
      receipt: null,
    };
  }

  const fingerprint = designReviewDeclarationFingerprint(declaration);
  const boundaryIndex = log.findIndex(
    (event, index) => index > declarationIndex && isExecutionBoundary(event),
  );
  const reviewEntries = log
    .map((event, index) => ({event, index}))
    .filter(({event}) => event.type === EVENT_FINDING &&
      event.kind === DESIGN_REVIEW_FINDING_KIND);
  const misplaced = reviewEntries.find(({index}) => index < declarationIndex ||
    (boundaryIndex >= 0 && index > boundaryIndex));
  if (misplaced) {
    return {
      required: true,
      state: DESIGN_REVIEW_STATE.LATE,
      ready: false,
      problems: [projectionProblem(
        PROBLEM_MISPLACED,
        misplaced.event,
      )],
      declarationFingerprint: fingerprint,
      declarationIndex,
      receipt: misplaced.event.designReview || null,
    };
  }

  const eligible = reviewEntries.filter(({index}) =>
    index > declarationIndex && (boundaryIndex < 0 || index < boundaryIndex));
  const latest = eligible.length > 0 ? eligible[eligible.length - 1] : null;
  if (!latest) {
    const late = boundaryIndex >= 0;
    return {
      required: true,
      state: late ? DESIGN_REVIEW_STATE.LATE : DESIGN_REVIEW_STATE.MISSING,
      ready: false,
      problems: [projectionProblem(late ?
        PROBLEM_BOUNDARY_PRECEDES_REVIEW : PROBLEM_REVIEW_REQUIRED,
      boundaryIndex >= 0 ? log[boundaryIndex] : declaration)],
      declarationFingerprint: fingerprint,
      declarationIndex,
      receipt: null,
    };
  }
  const structuralProblem = receiptProblem(
    latest.event, quest, declaration, declarationIndex);
  if (structuralProblem) {
    return {
      required: true,
      state: DESIGN_REVIEW_STATE.INVALID,
      ready: false,
      problems: [projectionProblem(structuralProblem, latest.event)],
      declarationFingerprint: fingerprint,
      declarationIndex,
      receipt: latest.event.designReview || null,
    };
  }
  if (latest.event.designReview.verdict !== REVIEW_VERDICT_APPROVE) {
    return {
      required: true,
      state: DESIGN_REVIEW_STATE.INVALID,
      ready: false,
      problems: [projectionProblem(
        PROBLEM_REJECTED,
        latest.event,
      )],
      declarationFingerprint: fingerprint,
      declarationIndex,
      receipt: latest.event.designReview,
    };
  }
  return {
    required: true,
    state: DESIGN_REVIEW_STATE.READY,
    ready: true,
    problems: [],
    declarationFingerprint: fingerprint,
    declarationIndex,
    receipt: latest.event.designReview,
  };
}

export function assertDesignReviewReady(quest, log) {
  const projection = designReviewProjection(quest, log);
  if (!projection.ready) {
    const detail = projection.problems.map((item) => item.message).join('; ');
    throw new Error(`design-review admission refused (${projection.state}): ${detail}`);
  }
  return projection;
}

export function buildDesignReviewReceipt(quest, log, args) {
  const projection = designReviewProjection(quest, log);
  if (!projection.required || projection.state === DESIGN_REVIEW_STATE.UNDECLARED) {
    throw new Error(ERROR_REQUIRES_DECLARATION);
  }
  if (projection.state === DESIGN_REVIEW_STATE.LATE) {
    throw new Error(ERROR_REVIEW_LATE);
  }
  const executionStarted = log.some((event, index) =>
    index > projection.declarationIndex && isExecutionBoundary(event));
  if (executionStarted) throw new Error(ERROR_REVIEW_LATE);
  const frontier = typeof args.frontier === 'string' ? args.frontier : '';
  const evidence = typeof args.evidence === 'string' ? args.evidence : '';
  const verdict = typeof args.verdict === 'string' ? args.verdict : '';
  if (!REVIEW_VERDICTS.includes(verdict)) {
    throw new Error(ERROR_VERDICT_REQUIRED);
  }
  if (!validVerifierEvidence(evidence)) {
    throw new Error(ERROR_EVIDENCE_REQUIRED);
  }
  const declaration = log[projection.declarationIndex];
  if (!declaration.sealed.frontierIds?.includes(frontier)) {
    throw new Error(ERROR_FRONTIER_INVALID);
  }
  if (args.declarationFingerprint !== projection.declarationFingerprint) {
    throw new Error(ERROR_FINGERPRINT_MISMATCH);
  }
  return {
    schemaVersion: DESIGN_REVIEW_SCHEMA_VERSION,
    questId: quest.id,
    declarationFingerprint: projection.declarationFingerprint,
    declarationIndex: projection.declarationIndex,
    verdict,
    reviewer: evidence,
    frontier,
  };
}
