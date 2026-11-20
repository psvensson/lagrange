// The admission statement: the one canonical body of a PLACEMENT_ADMIT
// command (quest replica-placement-admission-owner, design sections 2.5 and
// 2.12 item 2). The owner builds it from an ordered candidate; the partition
// pins and validates the committed command against the same canonical form,
// so every replica's applier reads exactly the fields the owner decided:
// the transition kind, the entity, the class and repair flag, the copy
// capacities (K_src, K_tgt and the level-triggered kSrcForClass), the
// ledger's dispatch hold, the formation latch epoch, the founding intent,
// the planned input positions and the moves.
import {isDeepStrictEqual} from 'node:util';
import {matchesExplicitCreationBindings} from './replica-operation-creation-request.js';
import {placementReplicaIdOf} from '../partition/partition-placement-admission-identity.js';
import {buildRuntimeServiceTargetClaimKey} from './runtime-service-replica-identity.js';
import {ALLOWED_UNIFIED_SERVICE_TYPES, UNIFIED_SERVICE_TYPE} from
  '../constants/unified-service-lifecycle.js';
import {
  copyDenseOwnDataArray,
  copyDenseOwnDataRecordArray,
  copyStrictOwnDataRecord,
} from '../utils/strict-own-data.js';
import {ReplicaOperationField} from './replica-operation-constants.js';
import {OPERATION_METADATA_KEY, OperationType} from './replica-operation-progress.js';
import {
  MEMBERSHIP_PUBLICATION_EPOCH_BINDING_STATE as EPOCH,
  decodeMembershipPublicationEpochBinding,
} from './replica-operation-membership-epoch-binding.js';
import {
  PLACEMENT_CLASS_ORDER,
  PLACEMENT_COPY_CAPACITY,
  PLACEMENT_DISPATCH_HOLD,
  PLACEMENT_CLASS,
  PLACEMENT_FORMATION_GATED_CLASSES,
  PLACEMENT_FULL_SOURCE_CAPACITY_CLASSES,
  PLACEMENT_MOVE_TYPE,
  PLACEMENT_TRANSITION_KIND as KIND,
} from './replica-placement-owner-constants.js';

const STATEMENT_FIELDS = Object.freeze(['transitionKind', 'entityType',
  'entityId', 'partitionId', 'placementClass', 'repair', 'kSrc', 'kTgt',
  'kSrcForClass', 'dispatchHold', 'formationLatchEpoch', 'foundingIntentId',
  'sourceNodeId', 'membershipPublicationEpoch', 'positions', 'moves']);
const MOVE_FIELDS = Object.freeze(['type', 'targetNodeId', 'replicaId',
  'sourceReplicaId', 'copySourceNodeId', 'targetNodeBootIncarnation',
  'targetNodeStorageIncarnation']);
const LEARNER_RETIREMENT = ReplicaOperationField.LEARNER_RETIREMENT;
const VOTER_RETIREMENT = ReplicaOperationField.VOTER_RETIREMENT;
const VOTER_RETIREMENT_MOVE_FIELDS = Object.freeze([...MOVE_FIELDS, VOTER_RETIREMENT]);
const VOTER_RETIREMENT_FIELDS = Object.freeze(['nodeBootIncarnation', 'replicaCreatedAt']);
const LEARNER_RETIREMENT_MOVE_FIELDS = Object.freeze([...MOVE_FIELDS, LEARNER_RETIREMENT]);
const LEARNER_RETIREMENT_FIELDS = Object.freeze([
  'nodeBootIncarnation', 'replicaCreatedAt', 'lifecycleVersion', 'lifecycleVersionColumn',
]);
const LEARNER_RETIREMENT_VERSION_COLUMNS = Object.freeze(new Set([
  'state_entered_at', 'updated_at',
]));
const KINDS = Object.freeze(new Set(Object.values(KIND)));
const MOVE_TYPES = Object.freeze(new Set([
  ...Object.values(OperationType),
  ...Object.values(PLACEMENT_MOVE_TYPE),
]));
const PROMOTE_MOVE_TYPES = Object.freeze(new Set([
  PLACEMENT_MOVE_TYPE.PROMOTE,
  PLACEMENT_MOVE_TYPE.GROWTH_PROMOTE,
]));
const SINGLE_MOVE = 1;
const PLACEMENT_STATEMENT_ERROR = Object.freeze({
  INVALID: 'placement_admission_statement_invalid',
});
// Whether an input is an admission statement: VALID carries the canonical
// statement.
const PLACEMENT_STATEMENT_VALIDITY = Object.freeze({
  VALID: 'valid',
  INVALID: 'invalid',
});
const INVALID_STATEMENT = Object.freeze({
  validity: PLACEMENT_STATEMENT_VALIDITY.INVALID});

function isText(value) {
  return typeof value === 'string' && value.length > 0;
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isNullOrPositiveInteger(value) {
  return value === null || isPositiveInteger(value);
}

// The planning epoch the dispatch gate fences on: null (unbound) or bound.
function isNullOrEpoch(value) {
  return value === null ||
    (Number.isSafeInteger(value) &&
      decodeMembershipPublicationEpochBinding(value).state === EPOCH.BOUND);
}

function hasExactFields(record, fields) {
  return record !== null && Object.keys(record).length === fields.length &&
    fields.every((field) => Object.hasOwn(record, field));
}

function ordered(record, fields) {
  return Object.freeze(Object.fromEntries(fields.map((field) =>
    [field, record[field]])));
}

function canonicalPositions(value) {
  const positions = copyStrictOwnDataRecord(value);
  if (positions === null) return null;
  const names = Object.keys(positions).sort();
  const valid = names.every((name) => positions[name] === null ||
    isText(positions[name]) || Number.isSafeInteger(positions[name]));
  return valid ? ordered(positions, names) : null;
}

function isValidMoveSourceReplica(move) {
  if (move.type === OperationType.REPLACE) return isText(move.sourceReplicaId);
  if (move.type === PLACEMENT_MOVE_TYPE.GROWTH_PROMOTE) {
    return move.sourceReplicaId === null || isText(move.sourceReplicaId);
  }
  return move.sourceReplicaId === null;
}

// What a move carries for its transition kind and type: a copy names its
// copy source; a REMOVE names the replica it removes; a REPLACE names its
// source replica; a new replica's identity is derived at apply, except a
// runtime-service target, whose identity its owner supplies.
function isMoveShapeValid(kind, move) {
  const runtimeService = kind === KIND.RUNTIME_SERVICE;
  const isPromote = PROMOTE_MOVE_TYPES.has(move.type);
  const copies = kind === KIND.PLACEMENT &&
    move.type !== OperationType.REMOVE && !isPromote;
  const identityGiven =
    move.type === OperationType.REMOVE || isPromote || runtimeService;
  return isText(move.targetNodeId) &&
    (identityGiven ? isText(move.replicaId) : move.replicaId === null) &&
    isValidMoveSourceReplica(move) &&
    (copies ? isText(move.copySourceNodeId) : move.copySourceNodeId === null) &&
    isNullOrPositiveInteger(move.targetNodeBootIncarnation) &&
    isNullOrPositiveInteger(move.targetNodeStorageIncarnation);
}

function canonicalVoterRetirement(value) {
  const scope = copyStrictOwnDataRecord(value);
  return hasExactFields(scope, VOTER_RETIREMENT_FIELDS) &&
    isPositiveInteger(scope.nodeBootIncarnation) &&
    isPositiveInteger(scope.replicaCreatedAt) ? ordered(scope, VOTER_RETIREMENT_FIELDS) : null;
}

function canonicalMove(kind, value) {
  const move = copyStrictOwnDataRecord(value);
  if (move === null || !MOVE_TYPES.has(move.type) || !isMoveShapeValid(kind, move)) return null;
  if (Object.hasOwn(move, VOTER_RETIREMENT)) {
    const scope = canonicalVoterRetirement(move[VOTER_RETIREMENT]);
    return kind === KIND.PLACEMENT && move.type === OperationType.REMOVE &&
      hasExactFields(move, VOTER_RETIREMENT_MOVE_FIELDS) && scope !== null ?
      ordered({...move, [VOTER_RETIREMENT]: scope}, VOTER_RETIREMENT_MOVE_FIELDS) : null;
  }
  if (!Object.hasOwn(move, LEARNER_RETIREMENT)) {
    return hasExactFields(move, MOVE_FIELDS) ? ordered(move, MOVE_FIELDS) : null;
  }
  const retirement = copyStrictOwnDataRecord(move.learnerRetirement);
  if (!hasExactFields(move, LEARNER_RETIREMENT_MOVE_FIELDS) || kind !== KIND.PLACEMENT ||
      move.type !== OperationType.REMOVE ||
      !hasExactFields(retirement, LEARNER_RETIREMENT_FIELDS) ||
      !isPositiveInteger(retirement.nodeBootIncarnation) ||
      !isPositiveInteger(retirement.replicaCreatedAt) ||
      !isPositiveInteger(retirement.lifecycleVersion) ||
      !LEARNER_RETIREMENT_VERSION_COLUMNS.has(retirement.lifecycleVersionColumn)) return null;
  return ordered({...move, learnerRetirement: ordered(retirement, LEARNER_RETIREMENT_FIELDS)},
    LEARNER_RETIREMENT_MOVE_FIELDS);
}

// FOUND admits the whole founding set: one ADD per founder, on distinct
// targets. Every other kind admits exactly one move.
function areMovesValidForKind(kind, moves) {
  if (kind !== KIND.FOUND) return moves.length === SINGLE_MOVE;
  return moves.length > 0 &&
    moves.every((move) => move.type === OperationType.ADD) &&
    new Set(moves.map((move) => move.targetNodeId)).size === moves.length;
}

function canonicalMoves(kind, value) {
  const records = copyDenseOwnDataRecordArray(value);
  if (records === null) return null;
  const moves = records.map((record) => canonicalMove(kind, record));
  return moves.every((move) => move !== null) &&
    areMovesValidForKind(kind, moves) ? Object.freeze(moves) : null;
}

function isEntityValid(statement) {
  if (!ALLOWED_UNIFIED_SERVICE_TYPES.has(statement.entityType) ||
      !isText(statement.entityId) || !isText(statement.partitionId)) {
    return false;
  }
  return statement.transitionKind === KIND.RUNTIME_SERVICE ?
    statement.entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE :
    statement.entityType === UNIFIED_SERVICE_TYPE.PARTITION &&
      statement.entityId === statement.partitionId;
}

// K travels in the command (design section 2.5 step 7): classes 1-2 and
// repairs use all of kSrc; other moves get kSrc, or kSrc - 1 while a repair
// waits on their source.
function isCapacityValid(statement) {
  const {kSrc, kTgt, kSrcForClass} = statement;
  if (!isPositiveInteger(kSrc) || !isPositiveInteger(kTgt) ||
      !Number.isSafeInteger(kSrcForClass)) {
    return false;
  }
  return isFullSourceCapacity(statement.placementClass, statement.repair) ?
    kSrcForClass === kSrc : kSrcForClass === kSrc || kSrcForClass === kSrc - 1;
}

function isClassFieldsValid(statement) {
  const ledger = statement.placementClass === PLACEMENT_CLASS.LEDGER;
  const gated = PLACEMENT_FORMATION_GATED_CLASSES.has(statement.placementClass);
  return PLACEMENT_CLASS_ORDER.includes(statement.placementClass) &&
    typeof statement.repair === 'boolean' &&
    statement.dispatchHold === (ledger ?
      PLACEMENT_DISPATCH_HOLD.LEDGER_AWAITING_COPY_IDLE : null) &&
    (gated ? Number.isSafeInteger(statement.formationLatchEpoch) :
      statement.formationLatchEpoch === null ||
        Number.isSafeInteger(statement.formationLatchEpoch));
}

function isStatementScalarsValid(statement) {
  return KINDS.has(statement.transitionKind) && isEntityValid(statement) &&
    isClassFieldsValid(statement) && isCapacityValid(statement) &&
    (statement.transitionKind === KIND.FOUND ?
      isText(statement.foundingIntentId) : statement.foundingIntentId === null) &&
    isText(statement.sourceNodeId) &&
    isNullOrEpoch(statement.membershipPublicationEpoch);
}

/**
 * The canonical admission statement of a raw input: exact fields, typed
 * values, the moves its kind admits.
 * @param {*} input - A candidate statement (plain own data).
 * @return {Object} Frozen {validity: VALID, statement} or {validity: INVALID}.
 */
function canonicalPlacementStatement(input) {
  const statement = copyStrictOwnDataRecord(input);
  if (!hasExactFields(statement, STATEMENT_FIELDS) ||
      !isStatementScalarsValid(statement)) {
    return INVALID_STATEMENT;
  }
  const positions = canonicalPositions(statement.positions);
  const moves = canonicalMoves(statement.transitionKind, statement.moves);
  if (positions === null || moves === null) return INVALID_STATEMENT;
  return Object.freeze({validity: PLACEMENT_STATEMENT_VALIDITY.VALID,
    statement: ordered({...statement, positions, moves}, STATEMENT_FIELDS)});
}

/**
 * Whether a class and repair flag may use all of K_src.
 * @param {string} placementClass - A PLACEMENT_CLASS.
 * @param {boolean} repair - Whether the move repairs a deficit.
 * @return {boolean} Whether the full source capacity applies.
 */
function isFullSourceCapacity(placementClass, repair) {
  return repair === true ||
    PLACEMENT_FULL_SOURCE_CAPACITY_CLASSES.has(placementClass);
}

/**
 * The source capacity a move is admitted against (owner decision D2,
 * level-triggered repair reservation): all of K_src for classes 1-2 and
 * repairs; for the other moves one slot less only while the owner's pass
 * saw a repair candidate waiting on that copy source.
 * @param {Object} input - {placementClass, repair, copySourceNodeId,
 *   repairWaitingSourceNodeIds (a Set), kSrc}.
 * @return {number} kSrcForClass.
 */
const MOVE_ALLOWED_KEYS = Object.freeze(new Set([
  ...LEARNER_RETIREMENT_MOVE_FIELDS,
  VOTER_RETIREMENT,
  'promoteReplicaIds',
]));
const CANDIDATE_REQUIRED_FIELDS = Object.freeze([
  'partitionId', 'placementClass', 'repair', 'move',
]);
const CANDIDATE_ALLOWED_KEYS = Object.freeze(new Set([
  ...CANDIDATE_REQUIRED_FIELDS, 'deficitKind', 'distinctHostCount', 'voterCount',
]));
const CONTEXT_FIELDS = Object.freeze([
  'sourceNodeId', 'repairWaitingSourceNodeIds', 'formationLatchEpoch',
  'membershipPublicationEpoch', 'positions',
]);
const FOUNDING_FIELDS = Object.freeze([
  'partitionId', 'placementClass', 'foundingIntentId', 'targetNodeIds',
  'sourceNodeId', 'formationLatchEpoch', 'positions',
]);

function invalidStatementError() {
  const error = new Error(PLACEMENT_STATEMENT_ERROR.INVALID);
  error.code = PLACEMENT_STATEMENT_ERROR.INVALID;
  return error;
}

function resolveSourceCapacityForClass(input) {
  const record = copyStrictOwnDataRecord(input);
  if (record === null ||
      !(record.repairWaitingSourceNodeIds instanceof Set) ||
      !PLACEMENT_CLASS_ORDER.includes(record.placementClass) ||
      typeof record.repair !== 'boolean' ||
      !isPositiveInteger(record.kSrc)) {
    throw invalidStatementError();
  }
  const {placementClass, repair, copySourceNodeId,
    repairWaitingSourceNodeIds, kSrc} = record;
  if (isFullSourceCapacity(placementClass, repair)) return kSrc;
  return repairWaitingSourceNodeIds.has(copySourceNodeId) ? kSrc - 1 : kSrc;
}

function requireStatement(raw) {
  const canonical = canonicalPlacementStatement(raw);
  if (canonical.validity !== PLACEMENT_STATEMENT_VALIDITY.VALID) {
    throw invalidStatementError();
  }
  return canonical.statement;
}

function moveOf(value) {
  const move = copyStrictOwnDataRecord(value);
  if (move === null ||
      !Object.keys(move).every((field) => MOVE_ALLOWED_KEYS.has(field))) {
    return null;
  }
  return {type: move.type, targetNodeId: move.targetNodeId,
    replicaId: move.replicaId ?? null,
    sourceReplicaId: move.sourceReplicaId ?? null,
    copySourceNodeId: move.copySourceNodeId ?? null,
    targetNodeBootIncarnation: move.targetNodeBootIncarnation ?? null,
    targetNodeStorageIncarnation: move.targetNodeStorageIncarnation ?? null,
    ...(Object.hasOwn(move, VOTER_RETIREMENT) ?
      {[VOTER_RETIREMENT]: move[VOTER_RETIREMENT]} : {}),
    ...(Object.hasOwn(move, LEARNER_RETIREMENT) ?
      {learnerRetirement: move.learnerRetirement} : {})};
}

function isValidCandidateRecord(record) {
  return record !== null &&
    CANDIDATE_REQUIRED_FIELDS.every((field) => Object.hasOwn(record, field)) &&
    Object.keys(record).every((field) => CANDIDATE_ALLOWED_KEYS.has(field));
}

function buildPlacementAdmissionStatement(candidate, context) {
  const candidateRecord = copyStrictOwnDataRecord(candidate);
  const contextRecord = copyStrictOwnDataRecord(context);
  const move = moveOf(candidateRecord?.move);
  if (!isValidCandidateRecord(candidateRecord) ||
      !hasExactFields(contextRecord, CONTEXT_FIELDS) ||
      move === null ||
      (move.type === OperationType.REMOVE && move[LEARNER_RETIREMENT] === undefined &&
        move[VOTER_RETIREMENT] === undefined) ||
      !(contextRecord.repairWaitingSourceNodeIds instanceof Set)) {
    return requireStatement(null);
  }
  const kSrc = PLACEMENT_COPY_CAPACITY.K_SRC;
  const ledger = candidateRecord.placementClass === PLACEMENT_CLASS.LEDGER;
  return requireStatement({
    transitionKind: KIND.PLACEMENT,
    entityType: UNIFIED_SERVICE_TYPE.PARTITION,
    entityId: candidateRecord.partitionId,
    partitionId: candidateRecord.partitionId,
    placementClass: candidateRecord.placementClass,
    repair: candidateRecord.repair,
    kSrc,
    kTgt: PLACEMENT_COPY_CAPACITY.K_TGT,
    kSrcForClass: resolveSourceCapacityForClass({
      placementClass: candidateRecord.placementClass,
      repair: candidateRecord.repair,
      copySourceNodeId: move.copySourceNodeId,
      repairWaitingSourceNodeIds: contextRecord.repairWaitingSourceNodeIds,
      kSrc,
    }),
    dispatchHold: ledger ? PLACEMENT_DISPATCH_HOLD.LEDGER_AWAITING_COPY_IDLE : null,
    formationLatchEpoch: contextRecord.formationLatchEpoch,
    foundingIntentId: null,
    sourceNodeId: contextRecord.sourceNodeId,
    membershipPublicationEpoch: contextRecord.membershipPublicationEpoch,
    positions: contextRecord.positions,
    moves: [move],
  });
}

function buildFoundingAdmissionStatement(founding) {
  const foundingRecord = copyStrictOwnDataRecord(founding);
  const targetNodeIds = copyDenseOwnDataArray(foundingRecord?.targetNodeIds);
  if (!hasExactFields(foundingRecord, FOUNDING_FIELDS) || targetNodeIds === null) {
    return requireStatement(null);
  }
  return requireStatement({
    transitionKind: KIND.FOUND,
    entityType: UNIFIED_SERVICE_TYPE.PARTITION,
    entityId: foundingRecord.partitionId,
    partitionId: foundingRecord.partitionId,
    placementClass: foundingRecord.placementClass,
    repair: false,
    kSrc: PLACEMENT_COPY_CAPACITY.K_SRC,
    kTgt: PLACEMENT_COPY_CAPACITY.K_TGT,
    kSrcForClass: PLACEMENT_COPY_CAPACITY.K_SRC,
    dispatchHold: null,
    formationLatchEpoch: foundingRecord.formationLatchEpoch,
    foundingIntentId: foundingRecord.foundingIntentId,
    sourceNodeId: foundingRecord.sourceNodeId,
    membershipPublicationEpoch: null,
    positions: foundingRecord.positions,
    moves: targetNodeIds.map((targetNodeId) => moveOf({
      type: OperationType.ADD, targetNodeId})),
  });
}

const RUNTIME_SERVICE_FIELDS = Object.freeze([
  'serviceId', 'sourceNodeId', 'formationLatchEpoch', 'membershipPublicationEpoch',
  'positions', 'move',
]);

function buildRuntimeServiceAdmissionStatement(input) {
  const record = copyStrictOwnDataRecord(input);
  const move = moveOf(record?.move);
  if (!hasExactFields(record, RUNTIME_SERVICE_FIELDS) || move === null) {
    return requireStatement(null);
  }
  return requireStatement({
    transitionKind: KIND.RUNTIME_SERVICE,
    entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    entityId: record.serviceId,
    partitionId: record.serviceId,
    placementClass: PLACEMENT_CLASS.SYSTEM,
    repair: false,
    kSrc: PLACEMENT_COPY_CAPACITY.K_SRC,
    kTgt: PLACEMENT_COPY_CAPACITY.K_TGT,
    kSrcForClass: PLACEMENT_COPY_CAPACITY.K_SRC,
    dispatchHold: null,
    formationLatchEpoch: record.formationLatchEpoch,
    foundingIntentId: null,
    sourceNodeId: record.sourceNodeId,
    membershipPublicationEpoch: record.membershipPublicationEpoch,
    positions: record.positions,
    moves: [move],
  });
}

function matchesCommittedSinglePlacementStatement(operation, requested, admitted) {
  const [move] = requested.moves;
  const operationAdmission = operation.stepsHistory?.[0]?.[OPERATION_METADATA_KEY.PLACEMENT_ADMISSION];
  const replicaId = move.replicaId ?? placementReplicaIdOf(operation.operationId);
  const claimKey =
    requested.entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE &&
    move.type !== OperationType.REMOVE ?
      buildRuntimeServiceTargetClaimKey(replicaId, requested.entityId) : null;
  return requested.sourceNodeId === admitted.sourceNodeId &&
    requested.membershipPublicationEpoch === admitted.membershipPublicationEpoch &&
    isDeepStrictEqual(requested.moves, admitted.moves) &&
    operation.sourceNodeId === requested.sourceNodeId &&
    (operation.membershipPublicationEpoch ?? null) === requested.membershipPublicationEpoch &&
    operation.replicaId === replicaId &&
    matchesExplicitCreationBindings(operation, move, {complete: true}) &&
    (operation.targetClaimKey ?? null) === claimKey &&
    isDeepStrictEqual(operationAdmission?.learnerRetirement, move.learnerRetirement) &&
    isDeepStrictEqual(operationAdmission?.voterRetirement, move.voterRetirement);
}

export {
  PLACEMENT_STATEMENT_VALIDITY,
  buildFoundingAdmissionStatement,
  buildPlacementAdmissionStatement,
  buildRuntimeServiceAdmissionStatement,
  canonicalPlacementStatement,
  canonicalVoterRetirement,
  matchesCommittedSinglePlacementStatement,
  resolveSourceCapacityForClass,
};
