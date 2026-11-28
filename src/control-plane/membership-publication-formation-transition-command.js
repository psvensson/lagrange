// FORMATION_TRANSITION committed command builders, admission/proposal, and
// state-machine applier on control_plane_publications-p1.
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {deepFreeze} from '../raft/raft-operation-port.js';
import {PLACEMENT_FORMATION_STATE} from
  '../rebalancer/replica-placement-owner-constants.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {eventCdcSourceScope} from '../cdc/cdc-source-scope-evidence.js';
import {
  PARTITION_COMMITTED_COMMAND_ORIGIN,
  registerFormationCommandValidator,
} from '../partition/partition-committed-command-admission.js';
import {
  PARTITION_CDC_ADMISSION_STATE,
  admitCdcOwedWork,
  settleCdcOwedRefusal,
} from '../partition/partition-cdc-owed-admission.js';
import {PARTITION_CDC_EVENT_BUILD_STATE} from
  '../partition/partition-cdc-generator.js';
import {
  ensureCdcObligationLedger,
  insertCdcObligation,
} from '../partition/partition-cdc-obligation-ledger.js';
import {
  ownerCommandPrelude,
  readSettledOwnerCommandIn,
  recordCommittedStatementOutcome,
  trackPendingOwnerCommand,
} from '../partition/partition-committed-statement-outcome.js';
import {
  PARTITION_OWNER_COMMAND_PRELUDE as PRELUDE,
  PARTITION_SETTLED_COMMAND_STATE as SETTLED,
  committedCommandDigest,
} from '../partition/partition-committed-statement-outcome-constants.js';
import {
  advancePartitionWriteGeneration,
  isPartitionReserved,
} from '../partition/partition-participant-transaction-store.js';
import {
  PARTITION_COMMITTED_COMMAND_OUTCOME as APPLY,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_OPERATION as OPERATION,
  PARTITION_WRITE_LEADERSHIP_REFUSAL,
} from '../partition/partition-service-constants.js';
import {
  FORMATION_PUBLICATION_ID,
  FORMATION_PUBLICATION_KIND,
  FORMATION_RECORD_STATUS,
  FORMATION_REFUSAL_REASON,
  FORMATION_TRANSITION_ACTION,
  FORMATION_TRANSITION_OUTCOME,
  FORMATION_TRANSITION_TYPE,
  buildFormationDeclareBody,
  buildFormationLatchBody,
  decodeFormationRecord,
  readFormationRecordIn,
  registerFormationTransitionExecutor,
} from './membership-publication-formation-record.js';

const formationPartitionApplyHooks = {
  partitionWriteLeadershipRefusalOf: null,
  pausedWriteAnswerOf: null,
  recordCommittedOperationCdc: null,
  settleReservedCommittedStatement: null,
  startPartitionRaftWriteCommit: null,
};

function registerFormationPartitionApplyHooks(hooks = {}) {
  Object.assign(formationPartitionApplyHooks, hooks);
}

const FORMATION_RECORD_VERSION = 1;
const FORMATION_RESULT_FIELD = 'formationResult';
const PUBLICATIONS_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS];
const EMPTY_JSON_ARRAY = '[]';
const EVENT_KEY_SEPARATOR = ':';
const FORMATION_ROW_COUNT = 1;
const FORMATION_REASON_DECLARED = 'FORMATION_DECLARED';
const FORMATION_REASON_LATCHED = 'FORMATION_LATCHED';
const DEFAULT_REPLICA_ID = 'r';
const RESERVED_WRITE_REFUSAL_ERROR =
  'Partition write reserved by prepared participant transaction';

const COMMAND_FIELDS = Object.freeze([
  'type',
  'entryId',
  'partitionId',
  'body',
  'bodyText',
  'timestamp',
  'proposedBy',
  'proposedAt',
]);
const INPUT_FIELDS = Object.freeze(['entryId', 'body']);
const DECLARE_BODY_FIELDS = Object.freeze([
  'action',
  'clusterId',
  'declaredHostCount',
  'declaredByNodeId',
  'declaredAt',
]);
const LATCH_BODY_FIELDS = Object.freeze([
  'action',
  'clusterId',
  'declaredHostCount',
  'formedAt',
  'formedByNodeId',
  'formedPublicationEpoch',
  'formedHostIds',
  'formedReadyNodeIds',
  'priorityPartitionVoters',
]);
const OUTCOMES = Object.freeze(
  new Set(Object.values(FORMATION_TRANSITION_OUTCOME)),
);

const INSERT_FORMATION_ROW_SQL =
  'INSERT INTO control_plane_publications (' +
  'publication_id, publication_kind, publication_epoch, publisher_node_id, ' +
  'source_topology_epoch, source_snapshot_version, published_active_node_ids, ' +
  'required_ack_node_ids, acknowledged_node_ids, priority_partition_summary, ' +
  'membership_lifecycle_summary, status, reason_code, created_at, updated_at, ' +
  'published_at, closed_at, transition_history, formation_record' +
  ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
const UPDATE_FORMATION_ROW_SQL =
  'UPDATE control_plane_publications SET ' +
  'publication_epoch = ?, publisher_node_id = ?, ' +
  'published_active_node_ids = ?, required_ack_node_ids = ?, ' +
  'acknowledged_node_ids = ?, status = ?, reason_code = ?, ' +
  'updated_at = ?, published_at = ?, transition_history = ?, ' +
  'formation_record = ? WHERE publication_id = ? AND status = ?';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function hasExactBodyFields(record, expectedFields) {
  const keys = Object.keys(record);
  return (
    keys.length === expectedFields.length &&
    expectedFields.every((field) => Object.hasOwn(record, field))
  );
}

function canonicalFormationBody(body) {
  const record = copyStrictOwnDataRecord(body);
  if (record === null) {
    return null;
  }
  if (record.action === FORMATION_TRANSITION_ACTION.DECLARE) {
    return hasExactBodyFields(record, DECLARE_BODY_FIELDS) ?
      buildFormationDeclareBody(record) :
      null;
  }
  if (record.action === FORMATION_TRANSITION_ACTION.LATCH) {
    return hasExactBodyFields(record, LATCH_BODY_FIELDS) ?
      buildFormationLatchBody(record) :
      null;
  }
  return null;
}

function formatServiceTimestamp(service, nowMs) {
  const hlc = service?.hlcClock?.now?.()?.toString?.();
  return isNonEmptyString(hlc) ?
    hlc :
    `${nowMs}:0:${service?.replicaId || DEFAULT_REPLICA_ID}`;
}

function buildFormationTransitionCommand(service, input) {
  const record = copyStrictOwnDataRecord(input);
  if (
    record === null ||
    !INPUT_FIELDS.every((field) => Object.hasOwn(record, field)) ||
    !isNonEmptyString(record.entryId)
  ) {
    return null;
  }
  const canonicalBody = canonicalFormationBody(record.body);
  if (canonicalBody === null) {
    return null;
  }
  const nowMs = service?.timeSource?.now?.() ?? Date.now();
  return Object.freeze({
    type: FORMATION_TRANSITION_TYPE,
    entryId: record.entryId,
    partitionId: service.partitionId,
    body: canonicalBody,
    bodyText: JSON.stringify(canonicalBody),
    timestamp: formatServiceTimestamp(service, nowMs),
    proposedBy: service.replicaId,
    proposedAt: nowMs,
  });
}

function hasValidCommandEnvelope(command) {
  return (
    command !== null &&
    command.type === FORMATION_TRANSITION_TYPE &&
    hasExactBodyFields(command, COMMAND_FIELDS) &&
    isNonEmptyString(command.entryId) &&
    isNonEmptyString(command.partitionId) &&
    isNonEmptyString(command.timestamp) &&
    isNonEmptyString(command.proposedBy) &&
    Number.isFinite(command.proposedAt)
  );
}

function isPinnedFormationTransitionCommand(input) {
  const command = copyStrictOwnDataRecord(input);
  if (!hasValidCommandEnvelope(command)) {
    return false;
  }
  const canonicalBody = canonicalFormationBody(command.body);
  return (
    canonicalBody !== null &&
    JSON.stringify(canonicalBody) === command.bodyText
  );
}

function formationTransitionRowCount() {
  return FORMATION_ROW_COUNT;
}

function buildTransitionDecision(result, rows = [], operation = null) {
  return {result: Object.freeze(result), rows, operation};
}

function applyFormationDeclareIn(db, body, existingRow) {
  if (existingRow !== null) {
    const decoded = decodeFormationRecord(existingRow);
    if (
      decoded.state !== PLACEMENT_FORMATION_STATE.UNAVAILABLE &&
      decoded.clusterId === body.clusterId &&
      decoded.declaredHostCount === body.declaredHostCount
    ) {
      return buildTransitionDecision({
        outcome: FORMATION_TRANSITION_OUTCOME.SETTLED,
        action: FORMATION_TRANSITION_ACTION.DECLARE,
        status: decoded.status,
        clusterId: decoded.clusterId,
        declaredHostCount: decoded.declaredHostCount,
      });
    }
    const reason =
      decoded.clusterId && decoded.clusterId !== body.clusterId ?
        FORMATION_REFUSAL_REASON.CLUSTER_MISMATCH :
        FORMATION_REFUSAL_REASON.ALREADY_DECLARED;
    return buildTransitionDecision({
      outcome: FORMATION_TRANSITION_OUTCOME.REFUSED,
      action: FORMATION_TRANSITION_ACTION.DECLARE,
      reason,
    });
  }
  const formationRecord = {
    version: FORMATION_RECORD_VERSION,
    clusterId: body.clusterId,
    declaredHostCount: body.declaredHostCount,
    declaredByNodeId: body.declaredByNodeId,
    declaredAt: body.declaredAt,
    status: FORMATION_RECORD_STATUS.DECLARED,
    formedAt: null,
    formedByNodeId: null,
    formedPublicationEpoch: null,
    formedHostIds: null,
    formedReadyNodeIds: null,
    priorityPartitionVoters: null,
  };
  const history = JSON.stringify([
    {
      status: FORMATION_RECORD_STATUS.DECLARED,
      at: body.declaredAt,
      by: body.declaredByNodeId,
      declaredHostCount: body.declaredHostCount,
    },
  ]);
  db.prepare(INSERT_FORMATION_ROW_SQL).run(
    FORMATION_PUBLICATION_ID,
    FORMATION_PUBLICATION_KIND,
    0,
    body.declaredByNodeId,
    null,
    null,
    EMPTY_JSON_ARRAY,
    EMPTY_JSON_ARRAY,
    EMPTY_JSON_ARRAY,
    null,
    null,
    FORMATION_RECORD_STATUS.DECLARED,
    FORMATION_REASON_DECLARED,
    body.declaredAt,
    body.declaredAt,
    null,
    null,
    history,
    JSON.stringify(formationRecord),
  );
  return buildTransitionDecision(
    {
      outcome: FORMATION_TRANSITION_OUTCOME.APPLIED,
      action: FORMATION_TRANSITION_ACTION.DECLARE,
      status: FORMATION_RECORD_STATUS.DECLARED,
      clusterId: body.clusterId,
      declaredHostCount: body.declaredHostCount,
    },
    [readFormationRecordIn(db)],
    OPERATION.INSERT,
  );
}

function isIdenticalFormedLatch(decoded, body) {
  return (
    decoded.formedPublicationEpoch === body.formedPublicationEpoch &&
    JSON.stringify(decoded.formedHostIds) ===
      JSON.stringify(body.formedHostIds) &&
    JSON.stringify(decoded.formedReadyNodeIds) ===
      JSON.stringify(body.formedReadyNodeIds)
  );
}

function parsePriorTransitionHistory(rawHistory) {
  let priorHistory = [];
  if (isNonEmptyString(rawHistory)) {
    try {
      const parsed = JSON.parse(rawHistory);
      if (Array.isArray(parsed)) {
        priorHistory = parsed;
      }
    } catch {
      priorHistory = [];
    }
  }
  return priorHistory;
}

function applyFormationLatchIn(db, body, existingRow) {
  if (existingRow === null) {
    return buildTransitionDecision({
      outcome: FORMATION_TRANSITION_OUTCOME.REFUSED,
      action: FORMATION_TRANSITION_ACTION.LATCH,
      reason: FORMATION_REFUSAL_REASON.NOT_DECLARED,
    });
  }
  const decoded = decodeFormationRecord(existingRow);
  if (decoded.state === PLACEMENT_FORMATION_STATE.UNAVAILABLE) {
    return buildTransitionDecision({
      outcome: FORMATION_TRANSITION_OUTCOME.REFUSED,
      action: FORMATION_TRANSITION_ACTION.LATCH,
      reason: decoded.reason,
    });
  }
  if (
    decoded.clusterId !== body.clusterId ||
    decoded.declaredHostCount !== body.declaredHostCount
  ) {
    return buildTransitionDecision({
      outcome: FORMATION_TRANSITION_OUTCOME.REFUSED,
      action: FORMATION_TRANSITION_ACTION.LATCH,
      reason: FORMATION_REFUSAL_REASON.CLUSTER_MISMATCH,
    });
  }
  if (decoded.status === FORMATION_RECORD_STATUS.FORMED) {
    return isIdenticalFormedLatch(decoded, body) ?
      buildTransitionDecision({
        outcome: FORMATION_TRANSITION_OUTCOME.SETTLED,
        action: FORMATION_TRANSITION_ACTION.LATCH,
        status: FORMATION_RECORD_STATUS.FORMED,
        clusterId: decoded.clusterId,
        declaredHostCount: decoded.declaredHostCount,
        formedAt: decoded.formedAt,
        formedPublicationEpoch: decoded.formedPublicationEpoch,
      }) :
      buildTransitionDecision({
        outcome: FORMATION_TRANSITION_OUTCOME.REFUSED,
        action: FORMATION_TRANSITION_ACTION.LATCH,
        reason: FORMATION_REFUSAL_REASON.ALREADY_FORMED,
      });
  }
  const formedAt = Math.max(body.formedAt, decoded.declaredAt);
  const formationRecord = {
    version: FORMATION_RECORD_VERSION,
    clusterId: decoded.clusterId,
    declaredHostCount: decoded.declaredHostCount,
    declaredByNodeId: decoded.declaredByNodeId,
    declaredAt: decoded.declaredAt,
    status: FORMATION_RECORD_STATUS.FORMED,
    formedAt,
    formedByNodeId: body.formedByNodeId,
    formedPublicationEpoch: body.formedPublicationEpoch,
    formedHostIds: [...body.formedHostIds],
    formedReadyNodeIds: [...body.formedReadyNodeIds],
    priorityPartitionVoters: body.priorityPartitionVoters,
  };
  const history = JSON.stringify([
    ...parsePriorTransitionHistory(existingRow.transition_history),
    {
      status: FORMATION_RECORD_STATUS.FORMED,
      at: formedAt,
      by: body.formedByNodeId,
      publicationEpoch: body.formedPublicationEpoch,
      formedHostIds: [...body.formedHostIds],
    },
  ]);
  const readyNodesJson = JSON.stringify(body.formedReadyNodeIds);
  db.prepare(UPDATE_FORMATION_ROW_SQL).run(
    body.formedPublicationEpoch,
    body.formedByNodeId,
    readyNodesJson,
    readyNodesJson,
    readyNodesJson,
    FORMATION_RECORD_STATUS.FORMED,
    FORMATION_REASON_LATCHED,
    formedAt,
    formedAt,
    history,
    JSON.stringify(formationRecord),
    FORMATION_PUBLICATION_ID,
    FORMATION_RECORD_STATUS.DECLARED,
  );
  return buildTransitionDecision(
    {
      outcome: FORMATION_TRANSITION_OUTCOME.APPLIED,
      action: FORMATION_TRANSITION_ACTION.LATCH,
      status: FORMATION_RECORD_STATUS.FORMED,
      clusterId: decoded.clusterId,
      declaredHostCount: decoded.declaredHostCount,
      formedAt,
      formedPublicationEpoch: body.formedPublicationEpoch,
    },
    [readFormationRecordIn(db)],
    OPERATION.UPDATE,
  );
}

function decideFormationTransition(db, command) {
  const existingRow = readFormationRecordIn(db);
  const {body} = command;
  return body.action === FORMATION_TRANSITION_ACTION.DECLARE ?
    applyFormationDeclareIn(db, body, existingRow) :
    applyFormationLatchIn(db, body, existingRow);
}

// The identity a formation command's outcome record carries (the outcome
// owner's digest of its type and pinned body text).
function formationCommandDigestOf(command) {
  return committedCommandDigest(command.type, command.bodyText);
}

// The write kernel's answers the owner-command prelude asks (registered by
// the partition layer, partition-service-entry-apply-base.js).
const FORMATION_PRELUDE_KERNEL = Object.freeze({
  leadershipRefusalOf: (service) =>
    formationPartitionApplyHooks.partitionWriteLeadershipRefusalOf(service),
  pausedAnswerOf: (service) => formationPartitionApplyHooks.pausedWriteAnswerOf(service),
});

function refusal(service, failureCode) {
  return {
    success: false,
    admitted: false,
    partitionId: service?.partitionId ?? null,
    failureCode,
  };
}

function formationAnswer(service, result, fields = {}) {
  return {
    success: result.outcome !== FORMATION_TRANSITION_OUTCOME.REFUSED,
    partitionId: service.partitionId,
    [FORMATION_RESULT_FIELD]: result,
    ...fields,
  };
}

function retainedResult(recorded) {
  if (typeof recorded.ownerResultText !== 'string') {
    throw new Error(FORMATION_REFUSAL_REASON.INVALID_COMMAND);
  }
  const result = JSON.parse(recorded.ownerResultText);
  if (!OUTCOMES.has(result?.outcome)) {
    throw new Error(FORMATION_REFUSAL_REASON.INVALID_COMMAND);
  }
  return deepFreeze(result);
}

function recordedAnswer(service, recorded) {
  return formationAnswer(service, retainedResult(recorded), {
    committed: true,
    logIndex: recorded.logIndex,
    term: recorded.term,
  });
}

// The leader-local proposal: the owner-command prelude (leadership,
// admission, exact settled replay, cutover pause, pending join; any other
// record or pending write under the entry is INVALID_COMMAND), then one
// proposal through the write kernel.
async function proposeFormationCommand(service, command) {
  const commandDigest = formationCommandDigestOf(command);
  const prelude = ownerCommandPrelude(service, {
    command,
    commandDigest,
    origin: PARTITION_COMMITTED_COMMAND_ORIGIN.FORMATION_OWNER,
    kernel: FORMATION_PRELUDE_KERNEL,
    answerSettled: (recorded) => recordedAnswer(service, recorded),
    answerCollision: () =>
      refusal(service, FORMATION_REFUSAL_REASON.INVALID_COMMAND),
  });
  if (prelude.state === PRELUDE.ANSWERED) {
    return prelude.answer;
  }
  return trackPendingOwnerCommand(
    service,
    {command, commandDigest},
    formationPartitionApplyHooks.startPartitionRaftWriteCommit(service, {
      entry: command,
      phaseTimings: null,
      applyStartMs: service.timeSource.now(),
      park: isPartitionReserved(service.db),
    }),
  );
}

async function executeFormationTransitionOnService(service, payload) {
  if (
    service?.tableName !== SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS ||
    service?.partitionId !== PUBLICATIONS_PARTITION_ID
  ) {
    return refusal(
      service,
      FORMATION_REFUSAL_REASON.TARGET_PARTITION_INVALID,
    );
  }
  const command = buildFormationTransitionCommand(service, {
    entryId: payload?.entryId,
    body: payload?.body,
  });
  return command === null ?
    refusal(service, FORMATION_REFUSAL_REASON.INVALID_COMMAND) :
    proposeFormationCommand(service, command);
}

function cdcEventsOf(service, {command, index, term, entryKey}, rows, operation) {
  const generator = service.syncCDCGeneratorDependencies?.();
  if (!generator) {
    return [];
  }
  const sourceScope = eventCdcSourceScope(service);
  return rows.flatMap((row, ordinal) => {
    const built = generator.buildEvent(
      {
        type: operation,
        tableName: service.tableName,
        data: {...row},
        whereClause: {publication_id: row.publication_id},
        entryId: command.entryId,
        timestamp: command.timestamp,
        changes: 1,
      },
      {suppressNoOpWrite: true, sourceReplica: command.proposedBy},
    );
    if (built.state !== PARTITION_CDC_EVENT_BUILD_STATE.BUILT) {
      return [];
    }
    return [
      Object.freeze({
        eventKey: `${entryKey}${EVENT_KEY_SEPARATOR}${ordinal}`,
        logIndex: index,
        term,
        ordinal,
        entryId: command.entryId,
        cdcEvent: built.cdcEvent,
        eventJson: JSON.stringify({
          ...built.cdcEvent,
          ...(sourceScope === null ? {} : {sourceScope}),
        }),
      }),
    ];
  });
}

const CDC_CAPACITY_FORMATION_RESULT = Object.freeze({
  outcome: FORMATION_TRANSITION_OUTCOME.REFUSED,
  reason: FORMATION_REFUSAL_REASON.CDC_CAPACITY,
});

function isValidTargetFormationCommand(service, command) {
  return (
    service.tableName === SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS &&
    service.partitionId === PUBLICATIONS_PARTITION_ID &&
    command.partitionId === service.partitionId &&
    isPinnedFormationTransitionCommand(command)
  );
}

function settleReservedFormationStatement(service, {command, afterCommit}) {
  if (formationPartitionApplyHooks.settleReservedCommittedStatement) {
    return formationPartitionApplyHooks.settleReservedCommittedStatement(
      service,
      {command, afterCommit},
    );
  }
  afterCommit(() =>
    service.resolveCommittedWrite(command.entryId, {
      success: false,
      error: RESERVED_WRITE_REFUSAL_ERROR,
      failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.RESERVED,
      deferRetry: true,
      outcome: APPLY.RESERVED_REFUSED,
      entryId: command.entryId,
      partitionId: service.partitionId,
    }),
  );
  return APPLY.RESERVED_REFUSED;
}

function recordFormationOperationCdc(service, committed, events) {
  if (formationPartitionApplyHooks.recordCommittedOperationCdc) {
    return formationPartitionApplyHooks.recordCommittedOperationCdc(
      service,
      committed,
      events,
    );
  }
  if (events.length === 0) {
    return 0;
  }
  ensureCdcObligationLedger(service.db);
  for (const event of events) {
    insertCdcObligation(service.db, event);
  }
  committed.afterCommit(() => {
    void service.cdcDelivery?.driveCdcObligations?.();
  });
  return events.length;
}

function applyFormationTransitionCommand(service, committed) {
  const {command, index, term, afterCommit, afterRollback} = committed;
  if (!isValidTargetFormationCommand(service, command)) {
    throw new Error(FORMATION_REFUSAL_REASON.INVALID_COMMAND);
  }
  const entryKey = service.getCommittedEntryKey(command);
  const commandDigest = formationCommandDigestOf(command);
  const settled = readSettledOwnerCommandIn(service.db, {
    entryId: command.entryId,
    commandDigest,
  });
  // Another record under this entry: fails the application closed, the same
  // verdict on every replica (the record is replicated state).
  if (settled.state === SETTLED.OTHER_RECORD) {
    throw new Error(FORMATION_REFUSAL_REASON.INVALID_COMMAND);
  }
  if (settled.state === SETTLED.SAME_COMMAND) {
    const answer = recordedAnswer(service, settled.recorded);
    afterCommit(() => service.resolveCommittedWrite(command.entryId, answer));
    return APPLY.REPLAYED;
  }
  if (isPartitionReserved(service.db)) {
    return settleReservedFormationStatement(service, {command, afterCommit});
  }
  const cdcAdmission = admitCdcOwedWork(service, command);
  if (cdcAdmission.state === PARTITION_CDC_ADMISSION_STATE.REFUSED) {
    return settleCdcOwedRefusal(
      service,
      {command, afterCommit},
      {
        ...cdcAdmission.answer,
        admitted: false,
        [FORMATION_RESULT_FIELD]: CDC_CAPACITY_FORMATION_RESULT,
      },
    );
  }
  try {
    const {result, rows, operation} = decideFormationTransition(
      service.db,
      command,
    );
    recordCommittedStatementOutcome(service, {
      entryKey,
      outcome: APPLY.APPLIED,
      index,
      term,
      result: {
        changes: rows.length,
        lastInsertRowid: null,
      },
      ownerResultText: JSON.stringify(result),
      commandDigest,
    });
    if (rows.length > 0) {
      recordFormationOperationCdc(
        service,
        committed,
        cdcEventsOf(service, {command, index, term, entryKey}, rows, operation),
      );
      advancePartitionWriteGeneration(service.db);
    }
    afterCommit(() =>
      service.resolveCommittedWrite(
        command.entryId,
        formationAnswer(service, result, {
          committed: true,
          logIndex: index,
          term,
        }),
      ),
    );
    afterCommit(() =>
      service.emit(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, {
        partitionId: service.partitionId,
        command,
      }),
    );
    return APPLY.APPLIED;
  } catch (error) {
    afterRollback(() => service.rejectCommittedWrite(command.entryId, error));
    throw error;
  }
}

registerFormationCommandValidator(isPinnedFormationTransitionCommand);
registerFormationTransitionExecutor(executeFormationTransitionOnService);

export {
  applyFormationTransitionCommand,
  buildFormationTransitionCommand,
  executeFormationTransitionOnService,
  formationTransitionRowCount,
  isPinnedFormationTransitionCommand,
  registerFormationPartitionApplyHooks,
};
