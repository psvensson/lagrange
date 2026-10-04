/**
 * Owner contract:
 * Owner: whether one REMOVE retires its replica's WHOLE group as a unit
 * (owner decision 2026-10-04, amending ruling F2: a group retired by a
 * durable cutover exits as a unit). A split or merge source dissolved after
 * its cutover, an aborted split child and an aborted merge target are
 * groups whose life ends at a durable workflow transition; none of them is
 * shrunk member by member, so none of them ever reaches a last voter.
 * Inputs: the evidence the workflow owner put on the REMOVE
 * ({kind, workflowId, fenceToken, tableId, reason: group-retired}) and the
 * durable workflow record it names: the table's `tables` row
 * (partition_transition_state, partition_transition_metadata with the
 * workflow id, the workflow fence token, the source/target partition ids,
 * the target epoch and the persisted participants; active_partition_version)
 * read through the control plane's authoritative read.
 * Canonical output: a frozen decision {retire: true, kind} or
 * {retire: false, refusal} (GROUP_RETIREMENT_REFUSAL), never a guess.
 * Prohibited: a missing partition or services row is never retirement
 * evidence (a lossy observation, binding direction M2); the dissolution
 * checkpoint (DISSOLVED_REPLICA_IDS) is never read (it is written after the
 * removals are dispatched); a projection never decides a retirement.
 */
import {TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  isAuthoritativeControlPlaneRowReadSuccessful,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {
  MERGE_ACK_MIRROR_REMOVED_SATISFIED_STATUSES,
  buildMergeSourceParticipantKey,
} from './merge-ack-constants.js';
import {
  SPLIT_ACK_MIRROR_REMOVED_SATISFIED_STATUSES,
  SPLIT_PARTICIPANT_PREFIX,
} from './split-ack-constants.js';

const GROUP_RETIREMENT_REASON = 'group-retired';

const GROUP_RETIREMENT_KIND = Object.freeze({
  SPLIT_SOURCE: 'split-source',
  MERGE_SOURCE: 'merge-source',
  SPLIT_ABORTED_CHILD: 'split-aborted-child',
  MERGE_ABORTED_TARGET: 'merge-aborted-target',
});

const GROUP_RETIREMENT_REFUSAL = Object.freeze({
  EVIDENCE_MALFORMED: 'group-retirement-evidence-malformed',
  RECORD_UNAVAILABLE: 'group-retirement-record-unavailable',
  RECORD_ABSENT: 'group-retirement-record-absent',
  WORKFLOW_MISMATCH: 'group-retirement-workflow-mismatch',
  FENCE_MISMATCH: 'group-retirement-fence-mismatch',
  TRANSITION_STATE_MISMATCH: 'group-retirement-transition-state-mismatch',
  GROUP_NOT_NAMED: 'group-retirement-group-not-named',
  EPOCH_MISMATCH: 'group-retirement-epoch-mismatch',
  SOURCE_MIRROR_ACTIVE: 'group-retirement-source-mirror-active',
  RECORD_MALFORMED: 'group-retirement-record-malformed',
  TABLE_MISMATCH: 'group-retirement-table-mismatch',
});

// What the replica's own open/restart read of its record concluded.
const RECORD_EVIDENCE_STATE = Object.freeze({
  RETIRE: 'retire',
  NOT_RETIRED: 'not-retired',
  UNAVAILABLE: 'unavailable',
});

const RECORD_SQL = 'SELECT * FROM tables WHERE table_id = ?';

const WORKFLOW_FAMILY = Object.freeze({SPLIT: 'split', MERGE: 'merge'});
const RETIRING_KINDS_BY_FAMILY = Object.freeze({
  [WORKFLOW_FAMILY.SPLIT]: Object.freeze([
    GROUP_RETIREMENT_KIND.SPLIT_SOURCE,
    GROUP_RETIREMENT_KIND.SPLIT_ABORTED_CHILD,
  ]),
  [WORKFLOW_FAMILY.MERGE]: Object.freeze([
    GROUP_RETIREMENT_KIND.MERGE_SOURCE,
    GROUP_RETIREMENT_KIND.MERGE_ABORTED_TARGET,
  ]),
});
const ABORTED_KINDS = Object.freeze(new Set([
  GROUP_RETIREMENT_KIND.SPLIT_ABORTED_CHILD,
  GROUP_RETIREMENT_KIND.MERGE_ABORTED_TARGET,
]));
const NOT_RETIRING = Object.freeze({retiring: false});
const STRING_TYPE = 'string';

function sourceParticipantOf(metadata, participantKey) {
  const participants =
    metadata?.[PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS];
  return String(participants?.[participantKey]?.status || '');
}

function listOf(metadata, field) {
  const values = metadata?.[field];
  return Array.isArray(values) ? values.map(String) : [];
}

// One row per retiring group: the durable transition state that ends the
// group, whether that transition promoted the target epoch (a cutover) or
// withdrew it (an abort), whether the record names the group in the role,
// and (sources only) the persisted participant that must have finished
// mirroring before its group may end.
const RETIREMENT_RULE_BY_KIND = Object.freeze({
  [GROUP_RETIREMENT_KIND.SPLIT_SOURCE]: Object.freeze({
    states: Object.freeze([
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
      PARTITION_TRANSITION_STATE.SPLIT_SOURCE_DISSOLVING,
    ]),
    epochPromoted: true,
    names: (metadata, partitionId) => String(metadata?.[
      PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID] || '') ===
        partitionId,
    mirrorRemoved: (metadata) => SPLIT_ACK_MIRROR_REMOVED_SATISFIED_STATUSES
      .has(sourceParticipantOf(metadata,
        SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION)),
    participantKey: () => SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
  }),
  [GROUP_RETIREMENT_KIND.MERGE_SOURCE]: Object.freeze({
    states: Object.freeze([PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE]),
    epochPromoted: true,
    names: (metadata, partitionId) => listOf(metadata,
      PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_IDS)
      .includes(partitionId),
    mirrorRemoved: (metadata, partitionId) =>
      MERGE_ACK_MIRROR_REMOVED_SATISFIED_STATUSES.has(sourceParticipantOf(
        metadata, buildMergeSourceParticipantKey(partitionId))),
    participantKey: buildMergeSourceParticipantKey,
  }),
  [GROUP_RETIREMENT_KIND.SPLIT_ABORTED_CHILD]: Object.freeze({
    states: Object.freeze([PARTITION_TRANSITION_STATE.FAILED]),
    epochPromoted: false,
    names: (metadata, partitionId) => listOf(metadata,
      PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS)
      .includes(partitionId),
    mirrorRemoved: () => true,
  }),
  [GROUP_RETIREMENT_KIND.MERGE_ABORTED_TARGET]: Object.freeze({
    states: Object.freeze([PARTITION_TRANSITION_STATE.FAILED]),
    epochPromoted: false,
    names: (metadata, partitionId) => listOf(metadata,
      PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS)[0] ===
        partitionId,
    mirrorRemoved: () => true,
  }),
});

/**
 * The evidence a workflow owner puts on the REMOVE of a replica of a group
 * it retires as a unit.
 * @param {Object} options
 * @param {string} options.kind - GROUP_RETIREMENT_KIND.
 * @param {Object} options.workflow - The workflow snapshot (workflowId,
 *   fenceToken, tableId).
 * @return {Object} Frozen evidence.
 */
function buildGroupRetirementEvidence({kind, workflow}) {
  return Object.freeze({
    reason: GROUP_RETIREMENT_REASON,
    kind,
    workflowId: String(workflow?.workflowId || ''),
    fenceToken: Number.isInteger(workflow?.fenceToken) ?
      workflow.fenceToken : null,
    tableId: String(workflow?.tableId || ''),
  });
}

function refusal(reason) {
  return Object.freeze({retire: false, refusal: reason});
}

function isWellFormedEvidence(evidence) {
  return evidence?.reason === GROUP_RETIREMENT_REASON &&
    Object.hasOwn(RETIREMENT_RULE_BY_KIND, evidence.kind) &&
    typeof evidence.workflowId === STRING_TYPE &&
    evidence.workflowId.length > 0 &&
    Number.isInteger(evidence.fenceToken) &&
    typeof evidence.tableId === STRING_TYPE && evidence.tableId.length > 0;
}

function parseTransitionMetadata(rawMetadata) {
  if (rawMetadata && typeof rawMetadata === 'object') {
    return rawMetadata;
  }
  if (typeof rawMetadata !== STRING_TYPE || rawMetadata.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawMetadata);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

// A partition epoch is a positive safe integer as stored; anything else (a
// null that a Number() decode would read as 0, a string) is a malformed
// record, never an epoch.
function isPartitionEpoch(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function areRecordEpochsWellFormed(tablesRow, metadata) {
  return isPartitionEpoch(tablesRow?.active_partition_version) &&
    isPartitionEpoch(metadata?.[
      PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]);
}

function epochOutcomeOf(rule, tablesRow, metadata) {
  return (tablesRow.active_partition_version === metadata[
    PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]) ===
    rule.epochPromoted;
}

// The record checks, in order: the first that fails is the typed refusal.
// Each reads (evidence, rule, tablesRow, metadata, partitionId).
const RECORD_CHECKS = Object.freeze([
  [(evidence, rule, row, metadata) => String(
    metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] || '') ===
      evidence.workflowId, GROUP_RETIREMENT_REFUSAL.WORKFLOW_MISMATCH],
  [(evidence, rule, row, metadata) => metadata[
    PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_FENCE_TOKEN] ===
      evidence.fenceToken, GROUP_RETIREMENT_REFUSAL.FENCE_MISMATCH],
  [(evidence, rule, row) => rule.states.includes(
    String(row.partition_transition_state)),
  GROUP_RETIREMENT_REFUSAL.TRANSITION_STATE_MISMATCH],
  [(evidence, rule, row, metadata, partitionId) =>
    rule.names(metadata, partitionId),
  GROUP_RETIREMENT_REFUSAL.GROUP_NOT_NAMED],
  [(evidence, rule, row, metadata) =>
    areRecordEpochsWellFormed(row, metadata),
  GROUP_RETIREMENT_REFUSAL.RECORD_MALFORMED],
  [(evidence, rule, row, metadata) => epochOutcomeOf(rule, row, metadata),
    GROUP_RETIREMENT_REFUSAL.EPOCH_MISMATCH],
  [(evidence, rule, row, metadata, partitionId) =>
    rule.mirrorRemoved(metadata, partitionId),
  GROUP_RETIREMENT_REFUSAL.SOURCE_MIRROR_ACTIVE],
]);

/**
 * The group-retirement decision for one REMOVE, from the evidence it
 * carries and the durable workflow record it names (pure).
 * @param {Object|null} evidence - The REMOVE's group-retirement evidence.
 * @param {Object} options
 * @param {string} options.partitionId - The partition the REMOVE names.
 * @param {Object|null} options.tablesRow - The workflow's durable record
 *   (the `tables` row), or null when the authoritative read found none.
 * @return {Object} Frozen {retire: true, kind} | {retire: false, refusal}.
 */
function decideGroupRetirement(evidence, {partitionId, tablesRow}) {
  if (!isWellFormedEvidence(evidence)) {
    return refusal(GROUP_RETIREMENT_REFUSAL.EVIDENCE_MALFORMED);
  }
  const metadata = parseTransitionMetadata(
    tablesRow?.partition_transition_metadata);
  if (!tablesRow || !metadata) {
    return refusal(GROUP_RETIREMENT_REFUSAL.RECORD_ABSENT);
  }
  const rule = RETIREMENT_RULE_BY_KIND[evidence.kind];
  const group = String(partitionId || '');
  const failed = RECORD_CHECKS.find(([holds]) =>
    !holds(evidence, rule, tablesRow, metadata, group));
  return failed ? refusal(failed[1]) :
    Object.freeze({retire: true, kind: evidence.kind});
}

/**
 * The persisted participant status of a source whose group is ending, or
 * null. A source is ending when the record names it as a source of a
 * promoted cutover and its persisted participant has finished mirroring
 * (the dissolution precondition). Such a source never resumes its
 * replication worker - re-running a finished source after the cutover is the
 * orphaned-leader re-drive (run 3, stale_fence); its leader only re-delivers
 * the finished acknowledgement so the workflow owner resumes the
 * dissolution (group-retirement-redrive.js).
 * @param {string} kind - GROUP_RETIREMENT_KIND.SPLIT_SOURCE or MERGE_SOURCE.
 * @param {*} rawMetadata - The record's partition_transition_metadata.
 * @param {string} partitionId - The source partition.
 * @return {Object} Frozen {retiring: false} or {retiring: true,
 *   participantStatus}.
 */
function retiringSourceStatus(kind, rawMetadata, partitionId) {
  const metadata = parseTransitionMetadata(rawMetadata);
  const rule = RETIREMENT_RULE_BY_KIND[kind];
  const group = String(partitionId || '');
  const retiring = Boolean(metadata) && rule.names(metadata, group) &&
    rule.mirrorRemoved(metadata, group);
  return Object.freeze(retiring ? {retiring, participantStatus:
    sourceParticipantOf(metadata, rule.participantKey(group))} : {retiring});
}

/**
 * The control plane's authoritative read of one table's durable workflow
 * record (its `tables` row, read from the record's owner).
 * @param {Object} gateway - The control-plane system-table gateway.
 * @param {string} tableId - The table.
 * @return {Promise<Object>} {available: false} or {available: true,
 *   tablesRow (null when there is none)}.
 */
async function readGroupRetirementRecord(gateway, tableId) {
  let result = null;
  try {
    result = await readAuthoritativeControlPlaneRows(gateway, TABLES.TABLES,
      RECORD_SQL, [tableId], {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
      });
  } catch (_error) {
    return Object.freeze({available: false});
  }
  if (!isAuthoritativeControlPlaneRowReadSuccessful(result) ||
      !Array.isArray(result.rows)) {
    return Object.freeze({available: false});
  }
  return Object.freeze({available: true, tablesRow: result.rows.find((row) =>
    String(row?.table_id || '') === String(tableId)) || null});
}

/**
 * Verify one REMOVE's group-retirement evidence against the durable workflow
 * record, read through the control plane's authoritative read (the record's
 * owner, never a local projection).
 * @param {Object} gateway - The control-plane system-table gateway.
 * @param {Object|null} evidence - The REMOVE's evidence.
 * @param {string} partitionId - The partition the REMOVE names.
 * @return {Promise<Object>} decideGroupRetirement's frozen decision, or the
 *   typed RECORD_UNAVAILABLE refusal when the read did not answer.
 */
async function verifyGroupRetirement(gateway, evidence, partitionId) {
  if (!isWellFormedEvidence(evidence)) {
    return refusal(GROUP_RETIREMENT_REFUSAL.EVIDENCE_MALFORMED);
  }
  const record = await readGroupRetirementRecord(gateway, evidence.tableId);
  if (!record.available) {
    return refusal(GROUP_RETIREMENT_REFUSAL.RECORD_UNAVAILABLE);
  }
  return decideGroupRetirement(evidence,
    {partitionId, tablesRow: record.tablesRow});
}

/**
 * The group-retirement evidence a replica's own durable workflow record
 * carries for it on open or restart (the safety net for a member that missed
 * its REMOVE): the record's own workflow id and fence, the kind whose rule
 * retires the group, or null when no kind does. Never evidence from an
 * absent or unreadable record.
 * @param {Object} gateway - The control-plane system-table gateway.
 * @param {string} tableId - The replica's table.
 * @param {string} partitionId - The replica's partition.
 * @return {Promise<Object>} Frozen {state: RECORD_EVIDENCE_STATE, evidence
 *   (RETIRE only)}.
 */
async function groupRetirementEvidenceFromRecord(gateway, tableId,
  partitionId) {
  if (typeof tableId !== STRING_TYPE || tableId.length === 0) {
    return Object.freeze({state: RECORD_EVIDENCE_STATE.UNAVAILABLE});
  }
  const record = await readGroupRetirementRecord(gateway, tableId);
  if (!record.available) {
    return Object.freeze({state: RECORD_EVIDENCE_STATE.UNAVAILABLE});
  }
  const metadata = parseTransitionMetadata(
    record.tablesRow?.partition_transition_metadata);
  if (!metadata) {
    return Object.freeze({state: RECORD_EVIDENCE_STATE.NOT_RETIRED});
  }
  const workflow = {
    workflowId: metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID],
    fenceToken:
      metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_FENCE_TOKEN],
    tableId,
  };
  const kind = Object.values(GROUP_RETIREMENT_KIND).find((candidate) =>
    decideGroupRetirement(buildGroupRetirementEvidence({kind: candidate,
      workflow}), {partitionId, tablesRow: record.tablesRow}).retire === true);
  return Object.freeze(kind ? {state: RECORD_EVIDENCE_STATE.RETIRE,
    evidence: buildGroupRetirementEvidence({kind, workflow})} :
    {state: RECORD_EVIDENCE_STATE.NOT_RETIRED});
}

/**
 * Whether one durable `tables` record holds a whole-group retirement its
 * workflow owner has not finished (the owner's resume on ownership
 * acquisition): a split or merge whose cutover is active and whose
 * source(s) finished mirroring, or an aborted split or merge (FAILED, its
 * target epoch never promoted) whose never-authoritative targets may still
 * hold replicas.
 * @param {Object|null} tablesRow
 * @return {Object} Frozen {retiring: false} | {retiring: true, family
 *   ('split'|'merge'), aborted, workflowId, retiringPartitionIds}.
 */
function retiringWorkflowOf(tablesRow) {
  const metadata = parseTransitionMetadata(
    tablesRow?.partition_transition_metadata);
  const workflowId = String(
    metadata?.[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] || '');
  if (!metadata || !workflowId ||
      !areRecordEpochsWellFormed(tablesRow, metadata)) {
    return NOT_RETIRING;
  }
  const family = workflowFamilyOf(metadata);
  const workflow = {workflowId, tableId: String(tablesRow.table_id || ''),
    fenceToken: metadata[
      PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_FENCE_TOKEN]};
  const retiring = recordPartitionIdsOf(metadata, family)
    .map((partitionId) => ({partitionId, kind: RETIRING_KINDS_BY_FAMILY[
      family].find((kind) => decideGroupRetirement(
      buildGroupRetirementEvidence({kind, workflow}),
      {partitionId, tablesRow}).retire === true)}))
    .filter((entry) => entry.kind);
  return retiring.length === 0 ? NOT_RETIRING : Object.freeze({
    retiring: true, family, workflowId,
    aborted: retiring.some((entry) => ABORTED_KINDS.has(entry.kind)),
    retiringPartitionIds: Object.freeze(retiring.map((entry) =>
      entry.partitionId))});
}

/**
 * Whether one group is being retired as a unit according to the durable
 * record as this node's view holds it (the partitions row names its table,
 * the table's `tables` row its workflow): the fence every membership change
 * of the group checks (a member added after the frozen set would never be
 * retired). A group whose record the view does not hold is not retiring.
 * @param {Object|null} cache - The system-table cache (get).
 * @param {string} partitionId - The group.
 * @return {boolean}
 */
function isGroupRetiringInView(cache, partitionId) {
  const group = String(partitionId || '');
  if (!group || typeof cache?.get !== 'function') {
    return false;
  }
  const tableId = cache.get(TABLES.PARTITIONS, group)?.table_id;
  const tablesRow = tableId ? cache.get(TABLES.TABLES, tableId) : null;
  const retiring = retiringWorkflowOf(tablesRow);
  return retiring.retiring === true &&
    retiring.retiringPartitionIds.includes(group);
}

function workflowFamilyOf(metadata) {
  return Object.hasOwn(metadata,
    PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_IDS) ?
    WORKFLOW_FAMILY.MERGE : WORKFLOW_FAMILY.SPLIT;
}

// Every partition a split or merge record names, sources then targets.
function recordPartitionIdsOf(metadata, family) {
  const sources = family === WORKFLOW_FAMILY.SPLIT ?
    [String(metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID] ||
      '')] :
    listOf(metadata, PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_IDS);
  return [...sources, ...listOf(metadata,
    PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS)];
}

export {
  GROUP_RETIREMENT_KIND,
  GROUP_RETIREMENT_REASON,
  GROUP_RETIREMENT_REFUSAL,
  RECORD_EVIDENCE_STATE,
  WORKFLOW_FAMILY,
  buildGroupRetirementEvidence,
  groupRetirementEvidenceFromRecord,
  isGroupRetiringInView,
  retiringSourceStatus,
  retiringWorkflowOf,
  verifyGroupRetirement,
};
