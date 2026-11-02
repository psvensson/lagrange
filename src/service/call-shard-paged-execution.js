/**
 * Owner of Call-shard paged execution (Q3: `call-shard-paged-execution`).
 *
 * Implements:
 *   1. Atomic page-transition progress commits and whole-attempt discard
 *      fencing (`createPagedShardProgressTracker`).
 *   2. Sequential per-shard paged accumulator orchestration (`init` ->
 *      `step` -> `finish`) with canonical finite-JSON state validation
 *      (`executePagedShardSlot`).
 *   3. Re-exports deterministic keyset cursor and retained read-view owners.
 */

import {
  normalizeEmittedPartialEntries,
} from './call-cell-routing-contract.js';
import {
  decodeCanonicalPartialValue,
  encodeCanonicalPartialValue,
} from './call-canonical-partial-codec.js';
import {
  COMPARATOR_VERSION,
  CURSOR_VERSION,
  PAGED_CONSISTENCY_SCOPE,
  PAGED_EXECUTION_ERROR_CODE,
  buildKeysetPageCursor,
  buildKeysetPageQuery,
  compareKeyTuples,
  createPagedRoutingError,
  resolveDeterministicKeyColumns,
  sha256Hex,
  validateKeysetPageCursor,
} from './call-shard-read-view-cursor.js';
import {
  createShardReadViewManager,
  executeLocalShardPageRead,
} from './call-shard-read-view-manager.js';

const UTF8_ENCODING = 'utf8';
const SQL_SINGLE_QUOTE_ESCAPE = '\'\'';
const STEPPED_OUTCOME = 'stepped';
const FINISHED_OUTCOME = 'finished';
const DEFAULT_PAGE_ROW_BOUND = 4096;
const DEFAULT_PAGE_BYTE_BOUND = 8388608;
const DEFAULT_MAX_PAGES_PER_SHARD = 256;
const DEFAULT_MAX_SHARD_ROWS = 262144;
const DEFAULT_MAX_SHARD_BYTES = 67108864;
const DEFAULT_MAX_STATE_BYTES = 262144;
const ZERO_NUMBER = 0;
const ONE_NUMBER = 1;
const DEFAULT_ATTEMPT_ID = 'attempt-1';
const DEFAULT_REPLICA_ID = 'local-replica';
const EMPTY_JSON_OBJECT = '{}';
const EMPTY_STRING = '';
const INITIAL_SLOT_PARTIAL_JSON = '[]';
const NULL_LITERAL = 'null';
const ATTEMPT_KEY_SEP = '::';

const PROGRESS_ERROR_MSG = Object.freeze({
  ATTEMPT_FENCED: 'Attempt is fenced or discarded',
  COMPETING_ATTEMPT: 'Stale or competing attempt cannot commit page progress',
  CONDITIONAL_COMMIT_FAILED: 'Conditional durable progress commit failed',
  CONDITIONAL_FINISH_FAILED: 'Conditional finish commit failed',
  CONFLICTING_DELIVERY: 'Conflicting page delivery under existing page identity',
  DEADLINE_DURING_PAGE: 'Invocation deadline expired during paged shard execution',
  FINISH_FENCE_MISMATCH: 'Finish fence or incomplete page sequence on shard slot',
  FINISH_WITHOUT_PAGES: 'Cannot finish shard slot without committed page progress',
  FIRST_PAGE_INDEX_INVALID: 'First committed page must have pageIndex=0 and expectedFencingRevision=0',
  INVALID_OUTCOME_ENVELOPE: 'Component did not return a canonical __lagrangePagedOutcome envelope',
  MAX_BYTES_EXCEEDED: 'Shard cumulative SQL bytes exceeded maxShardBytes',
  MAX_PAGES_EXCEEDED: 'Shard page count exceeded maxPages',
  MAX_ROWS_EXCEEDED: 'Shard cumulative row count exceeded maxShardRows',
  MAX_STATE_BYTES_EXCEEDED: 'Accumulator state bytes exceeded maxStateBytes',
  MISSING_PAGE_META: 'Shard page response is missing retained readViewId metadata',
  READ_VIEW_SWITCH_FORBIDDEN: 'Page transition attempted to switch readViewId mid-shard',
  SEQUENCE_OR_FENCE_VIOLATED: 'Page transition violated sequential pageIndex or fencingRevision',
});

function sqlLiteral(value) {
  return typeof value === 'number' && Number.isFinite(value) ?
    String(value) :
    `'${String(value).replace(/'/gu, SQL_SINGLE_QUOTE_ESCAPE)}'`;
}

function isIdenticalCommittedPage(existing, candidate) {
  return existing.deliveryId === candidate.deliveryId &&
    existing.pageIndex === candidate.pageIndex &&
    existing.readViewId === candidate.readViewId &&
    existing.inputDigest === candidate.inputDigest &&
    existing.parametersDigest === candidate.parametersDigest &&
    existing.stateDigest === candidate.stateDigest &&
    existing.cursorDigest === candidate.cursorDigest;
}

function validatePageSequenceAndCursor(slotState, transition) {
  if (slotState.pages.length === ZERO_NUMBER) {
    if (transition.pageIndex !== ZERO_NUMBER ||
        transition.expectedFencingRevision !== ZERO_NUMBER) {
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.CURSOR_INVALID,
        PROGRESS_ERROR_MSG.FIRST_PAGE_INDEX_INVALID,
      );
    }
    if (transition.nextCursor !== null) {
      validateKeysetPageCursor(transition.nextCursor, {
        keyColumns: transition.keyColumns,
        readViewId: transition.readViewId,
      });
    }
    return;
  }
  const prevPage = slotState.pages[slotState.pages.length - ONE_NUMBER];
  if (transition.readViewId !== prevPage.readViewId) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.READ_VIEW_LOST,
      PROGRESS_ERROR_MSG.READ_VIEW_SWITCH_FORBIDDEN,
    );
  }
  if (transition.pageIndex !== prevPage.pageIndex + ONE_NUMBER ||
      transition.expectedFencingRevision !== slotState.fencingRevision) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.DELIVERY_CONFLICT,
      PROGRESS_ERROR_MSG.SEQUENCE_OR_FENCE_VIOLATED,
    );
  }
  validateKeysetPageCursor(transition.nextCursor, {
    keyColumns: transition.keyColumns,
    previousCursor: prevPage.nextCursor,
    readViewId: transition.readViewId,
  });
}

function buildDurableProgressJson(candidate) {
  return encodeCanonicalPartialValue({
    __lagrangePageProgress: {
      attemptId: candidate.attemptId,
      completed: false,
      counters: candidate.counters,
      cursorDigest: candidate.cursorDigest,
      deliveryId: candidate.deliveryId,
      fencingRevision: candidate.fencingRevision,
      hasMore: candidate.hasMore,
      inputDigest: candidate.inputDigest,
      invocationId: candidate.invocationId,
      nextCursor: candidate.nextCursor ?
        {
          keyColumns: candidate.nextCursor.keyColumns,
          lastKeyTuple: candidate.nextCursor.lastKeyTuple,
          pageIndex: candidate.nextCursor.pageIndex,
          readViewId: candidate.nextCursor.readViewId,
          version: candidate.nextCursor.version,
        } :
        null,
      pageIndex: candidate.pageIndex,
      readViewId: candidate.readViewId,
      slotId: candidate.slotId,
      stateDigest: candidate.stateDigest,
      stateJson: candidate.stateJson,
    },
  });
}

function buildCandidatePageRecord(slotState, transition, attemptId) {
  const stateDigest = sha256Hex(transition.stateJson);
  const cursorDigest = transition.nextCursor ?
    transition.nextCursor.cursorDigest :
    sha256Hex(NULL_LITERAL);
  const deliveryId = transition.deliveryId ||
    `page:${transition.invocationId}:${attemptId}:${transition.slotId}:${transition.pageIndex}`;
  return {
    attemptId,
    bindingVersionId: transition.bindingVersionId ?? null,
    completed: false,
    counters: Object.freeze({
      bytesConsumed: transition.bytesConsumed,
      pagesConsumed: transition.pagesConsumed,
      rowsConsumed: transition.rowsConsumed,
    }),
    cursorDigest,
    deliveryId,
    fencingRevision: slotState.fencingRevision + ONE_NUMBER,
    hasMore: Boolean(transition.hasMore),
    inputDigest: transition.inputDigest,
    invocationId: transition.invocationId,
    keyColumns: transition.keyColumns,
    nextCursor: transition.nextCursor,
    operationId: transition.operationId ?? null,
    pageIndex: transition.pageIndex,
    parametersDigest: transition.parametersDigest ?? null,
    partitionId: transition.partitionId,
    previousCursor: slotState.pages.length > ZERO_NUMBER ?
      slotState.pages[slotState.pages.length - ONE_NUMBER].nextCursor :
      null,
    readViewId: transition.readViewId,
    slotId: transition.slotId,
    stateBytes: Buffer.byteLength(transition.stateJson, UTF8_ENCODING),
    stateDigest,
    stateJson: transition.stateJson,
  };
}

function createPagedShardProgressTracker({
  executeInternal = null,
  coordinationTable = null,
  nowProvider = () => Date.now(),
} = {}) {
  const attempts = new Map();

  function attemptKey(invocationId, attemptId) {
    return `${invocationId}${ATTEMPT_KEY_SEP}${attemptId}`;
  }

  function getOrInitAttempt(invocationId, attemptId) {
    const key = attemptKey(invocationId, attemptId);
    let record = attempts.get(key);
    if (!record) {
      record = {
        attemptId,
        discardReason: null,
        fenced: false,
        invocationId,
        slots: new Map(),
      };
      attempts.set(key, record);
    }
    return record;
  }

  async function persistSlotJsonConditionally(
    invocationId, slotId, replicaId, expectedPrevJson, nextJson, isFinished = false,
  ) {
    if (typeof executeInternal !== 'function' || !coordinationTable) {
      return true;
    }
    const computedAt = isFinished ? nowProvider() : ZERO_NUMBER;
    const prevCondition = expectedPrevJson === INITIAL_SLOT_PARTIAL_JSON ?
      `(partial_json = ${sqlLiteral(INITIAL_SLOT_PARTIAL_JSON)} OR partial_json = ${sqlLiteral(EMPTY_STRING)})` :
      `partial_json = ${sqlLiteral(expectedPrevJson)}`;
    const sql =
      `UPDATE ${coordinationTable} ` +
      `SET partial_json = ${sqlLiteral(nextJson)}, ` +
      `computed_at = ${sqlLiteral(computedAt)}, ` +
      `replica_id = ${sqlLiteral(replicaId)} ` +
      `WHERE invocation_id = ${sqlLiteral(invocationId)} ` +
      `AND slot_id = ${sqlLiteral(slotId)} ` +
      `AND ${prevCondition}`;
    const res = await executeInternal(sql);
    const changes = Number(res?.changes ?? res?.rowCount ?? ONE_NUMBER);
    return changes > ZERO_NUMBER;
  }

  async function discardAttempt(invocationId, attemptId, reason) {
    const attempt = getOrInitAttempt(invocationId, attemptId);
    attempt.fenced = true;
    attempt.discardReason = reason;
    for (const slotState of attempt.slots.values()) {
      slotState.fenced = true;
    }
    if (typeof executeInternal === 'function' && coordinationTable) {
      const sql =
        `UPDATE ${coordinationTable} ` +
        `SET partial_json = ${sqlLiteral(INITIAL_SLOT_PARTIAL_JSON)}, ` +
        'computed_at = 0, ' +
        'lease_expires_at = 0 ' +
        `WHERE invocation_id = ${sqlLiteral(invocationId)}`;
      await executeInternal(sql);
    }
    return Object.freeze({
      attemptId,
      discardReason: reason,
      fenced: true,
      invocationId,
    });
  }

  function assertAttemptNotFenced(attempt, transitionAttemptId) {
    if (attempt.fenced || attempt.attemptId !== transitionAttemptId) {
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.ATTEMPT_DISCARDED,
        PROGRESS_ERROR_MSG.ATTEMPT_FENCED,
      );
    }
    const prefix = `${attempt.invocationId}${ATTEMPT_KEY_SEP}`;
    for (const [otherKey, otherAttempt] of attempts.entries()) {
      if (otherKey.startsWith(prefix) &&
          otherAttempt.attemptId !== transitionAttemptId &&
          !otherAttempt.fenced) {
        throw createPagedRoutingError(
          PAGED_EXECUTION_ERROR_CODE.ATTEMPT_DISCARDED,
          PROGRESS_ERROR_MSG.COMPETING_ATTEMPT,
        );
      }
    }
  }

  function getOrInitSlotState(attempt, slotId, readViewId) {
    let slotState = attempt.slots.get(slotId);
    if (!slotState) {
      slotState = {
        completed: false,
        fenced: false,
        fencingRevision: ZERO_NUMBER,
        lastDurableJson: INITIAL_SLOT_PARTIAL_JSON,
        pages: [],
        readViewId,
        slotId,
      };
      attempt.slots.set(slotId, slotState);
    }
    return slotState;
  }

  async function commitPageProgress(transition) {
    const {
      invocationId,
      attemptId = DEFAULT_ATTEMPT_ID,
      slotId,
      replicaId = DEFAULT_REPLICA_ID,
    } = transition;
    const attempt = getOrInitAttempt(invocationId, attemptId);
    assertAttemptNotFenced(attempt, attemptId);
    const slotState = getOrInitSlotState(attempt, slotId, transition.readViewId);
    const candidate = buildCandidatePageRecord(slotState, transition, attemptId);
    const existingAtPage = slotState.pages[transition.pageIndex];
    if (existingAtPage) {
      if (isIdenticalCommittedPage(existingAtPage, candidate)) {
        return Object.freeze({progress: existingAtPage, replayed: true});
      }
      await discardAttempt(
        invocationId, attemptId, PAGED_EXECUTION_ERROR_CODE.DELIVERY_CONFLICT);
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.DELIVERY_CONFLICT,
        PROGRESS_ERROR_MSG.CONFLICTING_DELIVERY,
      );
    }
    try {
      validatePageSequenceAndCursor(slotState, transition);
    } catch (err) {
      await discardAttempt(
        invocationId,
        attemptId,
        err.pagedCode || PAGED_EXECUTION_ERROR_CODE.CURSOR_INVALID,
      );
      throw err;
    }
    const durableProgressJson = buildDurableProgressJson(candidate);
    const updated = await persistSlotJsonConditionally(
      invocationId,
      slotId,
      replicaId,
      slotState.lastDurableJson,
      durableProgressJson,
    );
    if (!updated) {
      await discardAttempt(
        invocationId, attemptId, PAGED_EXECUTION_ERROR_CODE.DELIVERY_CONFLICT);
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.DELIVERY_CONFLICT,
        PROGRESS_ERROR_MSG.CONDITIONAL_COMMIT_FAILED,
      );
    }
    const frozenPage = Object.freeze(candidate);
    slotState.pages.push(frozenPage);
    slotState.fencingRevision = frozenPage.fencingRevision;
    slotState.lastDurableJson = durableProgressJson;
    return Object.freeze({progress: frozenPage, replayed: false});
  }

  async function commitShardFinish({
    invocationId,
    attemptId = DEFAULT_ATTEMPT_ID,
    slotId,
    replicaId = DEFAULT_REPLICA_ID,
    expectedFencingRevision,
    readViewId,
    finalPartialJson,
  }) {
    const attempt = getOrInitAttempt(invocationId, attemptId);
    assertAttemptNotFenced(attempt, attemptId);
    const slotState = attempt.slots.get(slotId);
    if (!slotState || slotState.pages.length === ZERO_NUMBER) {
      await discardAttempt(
        invocationId, attemptId, PAGED_EXECUTION_ERROR_CODE.ATTEMPT_DISCARDED);
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.ATTEMPT_DISCARDED,
        PROGRESS_ERROR_MSG.FINISH_WITHOUT_PAGES,
      );
    }
    const lastPage = slotState.pages[slotState.pages.length - ONE_NUMBER];
    if (lastPage.hasMore ||
        lastPage.readViewId !== readViewId ||
        slotState.fencingRevision !== expectedFencingRevision) {
      await discardAttempt(
        invocationId, attemptId, PAGED_EXECUTION_ERROR_CODE.DELIVERY_CONFLICT);
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.DELIVERY_CONFLICT,
        PROGRESS_ERROR_MSG.FINISH_FENCE_MISMATCH,
      );
    }
    if (slotState.completed && slotState.finalPartialJson === finalPartialJson) {
      return Object.freeze({
        completed: true,
        fencingRevision: slotState.fencingRevision,
        replayed: true,
      });
    }
    const updated = await persistSlotJsonConditionally(
      invocationId,
      slotId,
      replicaId,
      slotState.lastDurableJson,
      finalPartialJson,
      true,
    );
    if (!updated) {
      await discardAttempt(
        invocationId, attemptId, PAGED_EXECUTION_ERROR_CODE.DELIVERY_CONFLICT);
      throw createPagedRoutingError(
        PAGED_EXECUTION_ERROR_CODE.DELIVERY_CONFLICT,
        PROGRESS_ERROR_MSG.CONDITIONAL_FINISH_FAILED,
      );
    }
    slotState.completed = true;
    slotState.fencingRevision += ONE_NUMBER;
    slotState.finalPartialJson = finalPartialJson;
    slotState.lastDurableJson = finalPartialJson;
    return Object.freeze({
      completed: true,
      fencingRevision: slotState.fencingRevision,
      replayed: false,
    });
  }

  function getShardProgress(invocationId, attemptId, slotId) {
    const attempt = attempts.get(attemptKey(invocationId, attemptId));
    if (!attempt || attempt.fenced) return null;
    const slotState = attempt.slots.get(slotId);
    if (!slotState || slotState.pages.length === ZERO_NUMBER) return null;
    const lastPage = slotState.pages[slotState.pages.length - ONE_NUMBER];
    return Object.freeze({
      completed: slotState.completed,
      fencingRevision: slotState.fencingRevision,
      lastPage,
      pageCount: slotState.pages.length,
      pages: Object.freeze([...slotState.pages]),
      readViewId: slotState.readViewId,
    });
  }

  function isAttemptFenced(invocationId, attemptId) {
    const attempt = attempts.get(attemptKey(invocationId, attemptId));
    return Boolean(attempt?.fenced);
  }

  return Object.freeze({
    commitPageProgress,
    commitShardFinish,
    discardAttempt,
    getShardProgress,
    isAttemptFenced,
  });
}

function parsePagedComponentOutcome(componentResult, stateSchema, maxStateBytes) {
  let parsed;
  try {
    parsed = decodeCanonicalPartialValue(String(componentResult ?? EMPTY_STRING));
  } catch (err) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.INVALID_STATE_SCHEMA,
      err.message,
      {cause: err},
    );
  }
  if (!parsed || typeof parsed !== 'object' ||
      (parsed.__lagrangePagedOutcome !== STEPPED_OUTCOME &&
       parsed.__lagrangePagedOutcome !== FINISHED_OUTCOME) ||
      typeof parsed.stateJson !== 'string') {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.INVALID_STATE_SCHEMA,
      PROGRESS_ERROR_MSG.INVALID_OUTCOME_ENVELOPE,
    );
  }
  const stateBytes = Buffer.byteLength(parsed.stateJson, UTF8_ENCODING);
  if (stateBytes > maxStateBytes) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.STATE_BUDGET_EXCEEDED,
      PROGRESS_ERROR_MSG.MAX_STATE_BYTES_EXCEEDED,
    );
  }
  try {
    const decodedState = decodeCanonicalPartialValue(parsed.stateJson, {
      maxValueBytes: maxStateBytes,
      schema: stateSchema,
    });
    const canonicalStateJson = encodeCanonicalPartialValue(decodedState, {
      maxValueBytes: maxStateBytes,
      schema: stateSchema,
    });
    return {
      outcomeKind: parsed.__lagrangePagedOutcome,
      stateBytes,
      stateJson: canonicalStateJson,
    };
  } catch (err) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.STATE_BUDGET_EXCEEDED,
      err.message,
      {cause: err},
    );
  }
}

function assertShardCumulativeBudgets(counters, limits) {
  if (counters.pagesConsumed > limits.maxPages) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.PAGE_BUDGET_EXCEEDED,
      PROGRESS_ERROR_MSG.MAX_PAGES_EXCEEDED,
    );
  }
  if (counters.rowsConsumed > limits.maxShardRows) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.SHARD_ROW_BUDGET_EXCEEDED,
      PROGRESS_ERROR_MSG.MAX_ROWS_EXCEEDED,
    );
  }
  if (counters.bytesConsumed > limits.maxShardBytes) {
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.SHARD_BYTE_BUDGET_EXCEEDED,
      PROGRESS_ERROR_MSG.MAX_BYTES_EXCEEDED,
    );
  }
}

function resolveSlotInitialProgress(existing) {
  if (!existing) {
    return {
      accumulatorJson: null,
      bytesConsumed: ZERO_NUMBER,
      fencingRevision: ZERO_NUMBER,
      pageCursor: null,
      pageIndex: ZERO_NUMBER,
      pagesConsumed: ZERO_NUMBER,
      readViewId: null,
      rowsConsumed: ZERO_NUMBER,
    };
  }
  return {
    accumulatorJson: existing.lastPage.stateJson,
    bytesConsumed: existing.lastPage.counters.bytesConsumed,
    fencingRevision: existing.fencingRevision,
    pageCursor: existing.lastPage.nextCursor,
    pageIndex: existing.lastPage.pageIndex + ONE_NUMBER,
    pagesConsumed: existing.lastPage.counters.pagesConsumed,
    readViewId: existing.readViewId,
    rowsConsumed: existing.lastPage.counters.rowsConsumed,
  };
}

function resolvePagedSlotLimits(limits = {}) {
  return {
    maxPages: limits.maxPages ?? DEFAULT_MAX_PAGES_PER_SHARD,
    maxShardBytes: limits.maxShardBytes ?? DEFAULT_MAX_SHARD_BYTES,
    maxShardRows: limits.maxShardRows ?? DEFAULT_MAX_SHARD_ROWS,
    maxStateBytes: limits.maxStateBytes ?? DEFAULT_MAX_STATE_BYTES,
    pageByteBound: limits.pageByteBound ?? DEFAULT_PAGE_BYTE_BOUND,
    pageRowBound: limits.pageRowBound ?? DEFAULT_PAGE_ROW_BOUND,
  };
}

async function finalizeShardSlotPartials({
  delivery, request, attemptId, telemetry,
  progressTracker, fencingRevision, readViewId, replicaId, reduceCoordinator,
}) {
  const entries = normalizeEmittedPartialEntries(delivery.partials, {
    attemptId,
    invocationId: request.invocationId,
    shardId: request.shard?.partitionId,
    slotId: request.slotId,
  });
  const finalPartialJson = encodeCanonicalPartialValue(entries);
  if (telemetry) {
    telemetry.bytesEmittedAsPartials +=
      Buffer.byteLength(finalPartialJson, UTF8_ENCODING);
  }
  await progressTracker.commitShardFinish({
    attemptId,
    expectedFencingRevision: fencingRevision,
    finalPartialJson,
    invocationId: request.invocationId,
    readViewId,
    replicaId,
    slotId: request.slotId,
  });
  if (reduceCoordinator?.publishPartial) {
    await reduceCoordinator.publishPartial(
      request.invocationId,
      request.slotId,
      replicaId,
      finalPartialJson,
      Date.now(),
    );
  }
}

async function assertPageDeadlineNotExpired(request, attemptId, progressTracker) {
  if (Number.isFinite(request.deadlineMs) && Date.now() >= request.deadlineMs) {
    await progressTracker.discardAttempt(
      request.invocationId,
      attemptId,
      PAGED_EXECUTION_ERROR_CODE.READ_VIEW_EXPIRED,
    );
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.READ_VIEW_EXPIRED,
      PROGRESS_ERROR_MSG.DEADLINE_DURING_PAGE,
    );
  }
}

async function validateAndParsePageOutcome({
  cursorState, delivery, resolvedLimits, request, attemptId, progressTracker,
}) {
  const pageMeta = delivery.pageMeta;
  if (!pageMeta || typeof pageMeta.readViewId !== 'string') {
    await progressTracker.discardAttempt(
      request.invocationId, attemptId, PAGED_EXECUTION_ERROR_CODE.READ_VIEW_LOST);
    throw createPagedRoutingError(
      PAGED_EXECUTION_ERROR_CODE.READ_VIEW_LOST,
      PROGRESS_ERROR_MSG.MISSING_PAGE_META,
    );
  }
  cursorState.readViewId = pageMeta.readViewId;
  cursorState.pagesConsumed += ONE_NUMBER;
  cursorState.rowsConsumed += pageMeta.rowCount;
  cursorState.bytesConsumed += pageMeta.pageBytes;
  try {
    assertShardCumulativeBudgets(cursorState, resolvedLimits);
    return parsePagedComponentOutcome(
      delivery.componentResult,
      request.resolution?.stateSchema,
      resolvedLimits.maxStateBytes,
    );
  } catch (err) {
    await progressTracker.discardAttempt(
      request.invocationId,
      attemptId,
      err.pagedCode || PAGED_EXECUTION_ERROR_CODE.ATTEMPT_DISCARDED,
    );
    throw err;
  }
}

function buildPageTransitionRecord({
  attemptId, cursorState, pageMeta, parsedOutcome, replicaId, request,
}) {
  const res = request.resolution;
  return {
    attemptId,
    bindingVersionId: res?.bindingVersionId ?? null,
    bytesConsumed: cursorState.bytesConsumed,
    expectedFencingRevision: cursorState.fencingRevision,
    hasMore: pageMeta.hasMore,
    inputDigest: pageMeta.inputDigest,
    invocationId: request.invocationId,
    keyColumns: pageMeta.keyColumns,
    nextCursor: pageMeta.nextCursor,
    operationId: res?.handlerId ?? request.name,
    pageIndex: cursorState.pageIndex,
    pagesConsumed: cursorState.pagesConsumed,
    parametersDigest: request.parametersDigest ?? null,
    partitionId: request.shard?.partitionId,
    readViewId: cursorState.readViewId,
    replicaId,
    rowsConsumed: cursorState.rowsConsumed,
    slotId: request.slotId,
    stateJson: parsedOutcome.stateJson,
  };
}

async function executePagedShardSlot(options) {
  const {
    request, dispatchPage, progressTracker,
    reduceCoordinator, telemetry, executionEvidence,
  } = options;
  const resolvedLimits = resolvePagedSlotLimits(options.limits);
  const attemptId = request.attemptId || DEFAULT_ATTEMPT_ID;
  const userArguments = JSON.parse(request.argumentsJson || EMPTY_JSON_OBJECT);
  const cursorState = resolveSlotInitialProgress(
    progressTracker.getShardProgress(
      request.invocationId, attemptId, request.slotId));
  let acquiredLease = false;

  for (;;) {
    await assertPageDeadlineNotExpired(request, attemptId, progressTracker);
    const delivery = await dispatchPage({
      ...request, attemptId,
      pageByteBound: resolvedLimits.pageByteBound,
      pageCursor: cursorState.pageCursor,
      pageIndex: cursorState.pageIndex,
      pageRowBound: resolvedLimits.pageRowBound,
      readViewId: cursorState.readViewId,
      stateJson: cursorState.accumulatorJson,
      userArguments,
    });
    if (executionEvidence) executionEvidence.started = true;
    const parsedOutcome = await validateAndParsePageOutcome({
      attemptId, cursorState, delivery, progressTracker, request, resolvedLimits,
    });
    const pageMeta = delivery.pageMeta;
    const replicaId = delivery.replicaId ?? request.resolution?.replicaId;
    if (!acquiredLease && reduceCoordinator?.acquireReduceLease) {
      await reduceCoordinator.acquireReduceLease(
        request.invocationId, replicaId, request.slotId);
      acquiredLease = true;
    }
    const committed = await progressTracker.commitPageProgress(
      buildPageTransitionRecord({
        attemptId, cursorState, pageMeta, parsedOutcome, replicaId, request,
      }));
    cursorState.fencingRevision = committed.progress.fencingRevision;
    cursorState.accumulatorJson = committed.progress.stateJson;
    cursorState.pageCursor = committed.progress.nextCursor;
    if (!pageMeta.hasMore) {
      await finalizeShardSlotPartials({
        attemptId, delivery, fencingRevision: cursorState.fencingRevision,
        progressTracker, readViewId: cursorState.readViewId,
        reduceCoordinator, replicaId, request, telemetry,
      });
      return Object.freeze({
        attemptId, consistencyScope: PAGED_CONSISTENCY_SCOPE,
        pagesConsumed: cursorState.pagesConsumed,
        readViewId: cursorState.readViewId,
        rowsConsumed: cursorState.rowsConsumed, slotId: request.slotId,
      });
    }
    cursorState.pageIndex += ONE_NUMBER;
  }
}

function extractUserArgumentsJson(rawArgumentsJson = EMPTY_JSON_OBJECT) {
  if (typeof rawArgumentsJson !== 'string' ||
      rawArgumentsJson.length === ZERO_NUMBER) {
    return rawArgumentsJson;
  }
  try {
    const parsed = JSON.parse(rawArgumentsJson);
    if (parsed && typeof parsed === 'object' && parsed.__lagrangePagedStep) {
      return JSON.stringify(parsed.arguments ?? {});
    }
  } catch {
    return rawArgumentsJson;
  }
  return rawArgumentsJson;
}

function stampPagedCallArguments(admittedCall, pageMeta) {
  if (!pageMeta || typeof admittedCall?.arguments !== 'string') {
    return admittedCall;
  }
  try {
    const parsed = JSON.parse(admittedCall.arguments);
    if (parsed && typeof parsed === 'object' && parsed.__lagrangePagedStep) {
      return {
        ...admittedCall,
        arguments: JSON.stringify({
          ...parsed,
          __lagrangePagedStep: {
            ...parsed.__lagrangePagedStep,
            isFinalPage: !pageMeta.hasMore,
          },
        }),
      };
    }
  } catch {
    return admittedCall;
  }
  return admittedCall;
}

export {
  COMPARATOR_VERSION,
  CURSOR_VERSION,
  PAGED_CONSISTENCY_SCOPE,
  PAGED_EXECUTION_ERROR_CODE,
  buildKeysetPageCursor,
  buildKeysetPageQuery,
  compareKeyTuples,
  createPagedShardProgressTracker,
  createShardReadViewManager,
  executeLocalShardPageRead,
  executePagedShardSlot,
  extractUserArgumentsJson,
  resolveDeterministicKeyColumns,
  stampPagedCallArguments,
  validateKeysetPageCursor,
};
