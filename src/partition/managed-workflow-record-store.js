/**
 * Owner contract:
 * Owner: every write of a split or merge workflow's durable record - the
 * table's `tables` row transition columns (partition_transition_state,
 * partition_transition_metadata and the epoch columns they carry). Owner
 * ruling 2026-10-05: claim before register; every transition, participant,
 * provisioning-mark, lease, abort and completion write compare-and-swaps on
 * the record as previously read; a stale owner can never overwrite a current
 * owner's lease, provisioning state, frozen membership, dissolved set or
 * progress; a refusal re-reads and reconciles, never re-applies stale state.
 * Version: the record AS READ - its exact stored transition metadata bytes
 * and transition state (`recordWitness`, carried by the in-memory workflow
 * state the write is derived from). Every write's WHERE clause names that
 * witness next to the row key; the system-table UPDATE is a SQL statement
 * replicated through the table partition's Raft log and evaluated at APPLY
 * time on every replica (partition-service-entry-apply-base.js runs the
 * statement in log order and resolves the proposer with that apply's
 * `changes`), so exactly one of two writes from the same witness lands and
 * the other matches zero rows. The comparison is on full content (every
 * durable fact of the record is inside those two columns, the epoch columns
 * are functions of them), so a match is equality of every fact.
 * Reconcile on a write that did not land (zero rows, a refused or failed
 * submission): re-read the record (the owner's view; when the view still
 * shows the witness, the authoritative read through the control plane) and
 *   - the record now holds exactly this write: its acknowledgement was lost,
 *     the write landed (accepted);
 *   - the record is this workflow under this owner and fence: this owner's
 *     own earlier write landed (a lost acknowledgement): the in-memory
 *     workflow is rebuilt from the record (owner.resyncWorkflowFromRecord),
 *     the current write is NOT re-applied and the caller's step fails once;
 *   - the record still shows the witness: nothing is known to have moved
 *     (a lagging view) - the write failed, nothing is discarded;
 *   - anything else (another owner, another fence, another workflow, a
 *     cleared or deleted record): this owner lost the workflow - it stops
 *     driving it (its re-drive abandons it), logs ONE WARN naming the
 *     workflow, its fence and the record's owner and fence, and discards its
 *     in-memory copy.
 * Lease: a write by the lease holder whose lease is past half its term
 * renews it in the same compare-and-swap (a dead owner still loses it at
 * expiry: it writes nothing).
 * Prohibited: a write without a witness (fail-closed, nothing is written);
 * an unconditional UPDATE of these columns; treating a refused write as
 * landed without re-reading.
 */
import {TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  isAuthoritativeControlPlaneRowReadSuccessful,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {PARTITION_TRANSITION_METADATA_FIELD} from './partition-constants.js';
import {durableOwnershipClaimOf} from './managed-workflow-ownership-core.js';

const RECORD_SQL = 'SELECT * FROM tables WHERE table_id = ?';
const STRING_TYPE = 'string';
const OBJECT_TYPE = 'object';
const FUNCTION_TYPE = 'function';
const LEASE_RENEW_FRACTION = 2;

// What one record write came to.
const RECORD_WRITE_OUTCOME = Object.freeze({
  ACCEPTED: 'accepted',
  // The record holds this write: its acknowledgement was lost.
  ACCEPTED_LOST_ACK: 'accepted-lost-ack',
  // This owner's own earlier write is on the record: rebuilt from it.
  RESYNCED: 'resynced-own-record',
  // Nothing is known to have moved (the re-read shows the witness).
  UNCONFIRMED: 'unconfirmed',
  // Another owner, fence or workflow holds the record, or it is gone.
  SUPERSEDED: 'superseded',
  // The in-memory state carries no witness: nothing was written.
  NO_WITNESS: 'no-witness',
});

const ACCEPTED_OUTCOMES = Object.freeze(new Set([
  RECORD_WRITE_OUTCOME.ACCEPTED,
  RECORD_WRITE_OUTCOME.ACCEPTED_LOST_ACK,
]));

const RECORD_WRITE_LOG_MSG = Object.freeze({
  SUPERSEDED: 'Workflow record write refused: another owner holds the ' +
    'record; this owner stops driving the workflow and discards its copy',
  RESYNCED: 'Workflow record write refused: this owner\'s own earlier ' +
    'write is on the record; the in-memory workflow was rebuilt from it',
  NO_WITNESS: 'Workflow record write refused: the in-memory workflow ' +
    'carries no record witness (fail-closed, nothing written)',
});

const RECORD_WRITE_ERROR_MSG = Object.freeze({
  REFUSED: 'Workflow record compare-and-swap refused: ',
});

/**
 * The exact stored transition metadata of one `tables` row: the string as
 * stored (a view that decoded it to an object re-encodes it), or null.
 * @param {*} raw
 * @return {string|null}
 */
function storedMetadataOf(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }
  return typeof raw === OBJECT_TYPE ? JSON.stringify(raw) : String(raw);
}

/**
 * The record as read: the witness every write of the workflow's record
 * compares against (the record's exact transition metadata and state; an
 * absent record or a cleared transition is null/null).
 * @param {Object|null} tablesRow - The table's `tables` row as read.
 * @return {Object} Frozen {metadata, state}.
 */
function recordWitnessOf(tablesRow) {
  return Object.freeze({
    metadata: storedMetadataOf(tablesRow?.partition_transition_metadata),
    state: tablesRow?.partition_transition_state ?? null,
  });
}

function sameWitness(left, right) {
  return Boolean(left) && Boolean(right) &&
    left.metadata === right.metadata && left.state === right.state;
}

function parseMetadata(raw) {
  if (typeof raw !== STRING_TYPE || raw.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === OBJECT_TYPE ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function affectedRowsOf(result) {
  return Number(result?.partitionResult?.affectedRows ?? result?.affectedRows);
}

// The owner's view of the table's record.
function viewRecordOf(owner, tableId) {
  const rows = typeof owner.listTableInfos === FUNCTION_TYPE ?
    owner.listTableInfos() || [] : [];
  return rows.find((row) => String(row?.table_id ?? row?.tableId ?? '') ===
    String(tableId)) || null;
}

// The control plane's authoritative read of the record, or undefined when it
// did not answer (the view then stands).
async function authoritativeRecordOf(owner, tableId) {
  if (typeof owner.readAuthoritativeWorkflowRecord === FUNCTION_TYPE) {
    // The owner's own authoritative read of the record, when it has one.
    try {
      return await owner.readAuthoritativeWorkflowRecord(tableId) ?? null;
    } catch (_error) {
      return undefined;
    }
  }
  let result = null;
  try {
    result = await readAuthoritativeControlPlaneRows(
      owner.getControlPlaneSystemTableGateway(), TABLES.TABLES, RECORD_SQL,
      [tableId], {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
      });
  } catch (_error) {
    return undefined;
  }
  if (!isAuthoritativeControlPlaneRowReadSuccessful(result) ||
      !Array.isArray(result.rows)) {
    return undefined;
  }
  return result.rows.find((row) =>
    String(row?.table_id || '') === String(tableId)) || null;
}

/**
 * Re-read the workflow's record after a write that did not land: the view,
 * and when the view still shows the witness (it may lag the write that beat
 * this one) the authoritative read.
 * @param {Object} owner
 * @param {string} tableId
 * @param {Object} witness - The refused write's witness.
 * @return {Promise<Object>} {row, witness}.
 */
async function rereadRecord(owner, tableId, witness) {
  let row = viewRecordOf(owner, tableId);
  if (sameWitness(recordWitnessOf(row), witness)) {
    const authoritative = await authoritativeRecordOf(owner, tableId);
    if (authoritative !== undefined) {
      row = authoritative;
    }
  }
  return {row, witness: recordWitnessOf(row)};
}

/**
 * Whether the re-read record is this workflow under this owner at this
 * owner's fence: every write on it since this owner's claim is this owner's.
 * @param {Object} owner
 * @param {Object} workflow - The refused write's state.
 * @param {Object|null} metadata - The re-read record's metadata.
 * @return {boolean}
 */
function isOwnRecord(owner, workflow, metadata) {
  if (!metadata || String(metadata[
    PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] || '') !==
      String(workflow.workflowId)) {
    return false;
  }
  const claim = durableOwnershipClaimOf(metadata);
  return claim.workflowOwnerId === owner.workflowOwnerId &&
    claim.workflowOwnerId === workflow.workflowOwnerId &&
    Number.isInteger(workflow.fenceToken) &&
    claim.fenceToken === workflow.fenceToken;
}

/**
 * This owner lost the workflow: stop driving it, log once (per workflow and
 * fence), discard the in-memory copy.
 * @param {Object} owner
 * @param {Object} workflow - The refused write's state.
 * @param {Object} reread - {row, witness}.
 * @return {void}
 */
function relinquishWorkflow(owner, workflow, reread) {
  const workflowId = String(workflow.workflowId);
  owner.relinquishedWorkflowFences ??= new Set();
  const logKey = `${workflowId}\u0000${workflow.fenceToken ?? ''}`;
  if (!owner.relinquishedWorkflowFences.has(logKey)) {
    owner.relinquishedWorkflowFences.add(logKey);
    owner.logger?.warn?.(RECORD_WRITE_LOG_MSG.SUPERSEDED,
      relinquishFieldsOf(owner, workflow, reread));
  }
  owner.groupRetirementRedrive?.abandon?.(workflowId);
  beginWorkflowRecordLineage(owner, workflowId);
  if (owner.workflowCoordinator?.getWorkflowById?.(workflowId)) {
    owner.workflowCoordinator.removeWorkflow(workflowId);
  }
}

// The lost workflow's WARN: this owner's fence and the record's owner/fence.
function relinquishFieldsOf(owner, workflow, reread) {
  const metadata = parseMetadata(reread.witness.metadata);
  const recordClaim = durableOwnershipClaimOf(metadata);
  return {
    workflowId: String(workflow.workflowId),
    fenceToken: workflow.fenceToken ?? null,
    ownerId: owner.workflowOwnerId,
    recordWorkflowId: metadata?.[
      PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] ?? null,
    recordOwnerId: recordClaim.workflowOwnerId ?? null,
    recordFenceToken: recordClaim.fenceToken ?? null,
    recordState: reread.witness.state,
  };
}

// The effect each refused outcome has on this owner's in-memory state.
const REFUSED_WRITE_EFFECT = Object.freeze({
  [RECORD_WRITE_OUTCOME.RESYNCED]: (owner, workflow, reread) => {
    owner.resyncWorkflowFromRecord?.(String(workflow.workflowId), reread.row);
    owner.logger?.warn?.(RECORD_WRITE_LOG_MSG.RESYNCED, {
      workflowId: workflow.workflowId, fenceToken: workflow.fenceToken,
      recordState: reread.witness.state});
  },
  [RECORD_WRITE_OUTCOME.SUPERSEDED]: relinquishWorkflow,
});

/**
 * Classify a write that did not land (see the owner contract).
 * @param {Object} owner
 * @param {Object} workflow - The refused write's state.
 * @param {Object} written - The write's new {metadata, state}.
 * @return {Promise<Object>} {outcome, reread}.
 */
async function reconcileRefusedWrite(owner, workflow, written) {
  const witness = workflow.recordWitness;
  const reread = await rereadRecord(owner, workflow.tableId, witness);
  const outcome = refusedWriteOutcomeOf(owner, workflow, written, reread);
  REFUSED_WRITE_EFFECT[outcome]?.(owner, workflow, reread);
  return {outcome, reread};
}

// What the re-read record says about a write that did not land: the record
// holds it (lost acknowledgement), still holds the compared version
// (nothing known moved), is this owner's own (its earlier write landed), or
// is another owner's / gone.
function refusedWriteOutcomeOf(owner, workflow, written, reread) {
  if (!reread.row) {
    return RECORD_WRITE_OUTCOME.SUPERSEDED;
  }
  const own = isOwnRecord(owner, workflow,
    parseMetadata(reread.witness.metadata));
  return sameWitness(reread.witness, written) ?
    RECORD_WRITE_OUTCOME.ACCEPTED_LOST_ACK :
    sameWitness(reread.witness, workflow.recordWitness) ?
      RECORD_WRITE_OUTCOME.UNCONFIRMED :
      own ? RECORD_WRITE_OUTCOME.RESYNCED : RECORD_WRITE_OUTCOME.SUPERSEDED;
}

/**
 * The lease holder's renewal riding its own write: a lease past half its
 * term is extended in the same compare-and-swap. Answers a restore for the
 * case the write does not land.
 * @param {Object} owner
 * @param {Object} workflow - The write's state (mutated).
 * @return {Function} () => restores the previous lease.
 */
function renewLeaseOnWrite(owner, workflow) {
  const previous = workflow.leaseExpiresAt;
  const leaseMs = Number(owner.workflowLeaseMs);
  if (workflow.workflowOwnerId !== owner.workflowOwnerId ||
      !Number.isFinite(previous) || !Number.isFinite(leaseMs) ||
      previous - owner.now() > leaseMs / LEASE_RENEW_FRACTION) {
    return () => {};
  }
  workflow.leaseExpiresAt = owner.now() + leaseMs;
  return () => {
    workflow.leaseExpiresAt = previous;
  };
}

function witnessKeyOf(witness) {
  return `${witness?.state ?? ''}\u0000${witness?.metadata ?? ''}`;
}

// This owner's acknowledged writes of one workflow's record since its
// in-memory lineage began (registration or a rebuild from a read).
function writeChainOf(owner, workflowId) {
  owner.workflowRecordWriteChains ??= new Map();
  let chain = owner.workflowRecordWriteChains.get(workflowId);
  if (!chain) {
    chain = {latest: null, acknowledged: new Set()};
    owner.workflowRecordWriteChains.set(workflowId, chain);
  }
  return chain;
}

/**
 * Begin a new in-memory lineage of one workflow (its registration, or its
 * rebuild from a record as read): no earlier write of this owner is a base
 * any later write may be rebased from.
 * @param {Object} owner
 * @param {string} workflowId
 * @return {void}
 */
function beginWorkflowRecordLineage(owner, workflowId) {
  owner.workflowRecordWriteChains?.delete(String(workflowId));
}

/**
 * The version a write compares against. Writes of one owner are serialized
 * per workflow; a write derived from an EARLIER acknowledged write of this
 * same owner and lineage (a candidate built before a concurrent participant
 * flush of the same in-memory workflow landed) compares against this
 * owner's latest acknowledged version - only this owner's own acknowledged
 * writes lie between, exactly as if the two had run in order. Any other
 * witness is compared as read: a foreign write, a re-read, a lost
 * acknowledgement are never rebased over.
 * @param {Object} owner
 * @param {Object} workflow
 * @return {Object} The witness.
 */
function comparedWitnessOf(owner, workflow) {
  const witness = workflow.recordWitness;
  const chain = writeChainOf(owner, String(workflow.workflowId));
  if (chain.latest && !sameWitness(witness, chain.latest) &&
      chain.acknowledged.has(witnessKeyOf(witness))) {
    workflow.recordWitness = chain.latest;
  }
  return workflow.recordWitness;
}

function acknowledgeWrite(owner, workflow, written) {
  workflow.recordWitness = written;
  const chain = writeChainOf(owner, String(workflow.workflowId));
  chain.latest = written;
  chain.acknowledged.add(witnessKeyOf(written));
}

// One owner's writes of one workflow's record run one at a time, in order.
function serializeRecordWrite(owner, workflowId, write) {
  owner.workflowRecordWriteTails ??= new Map();
  const tails = owner.workflowRecordWriteTails;
  const previous = tails.get(workflowId) || Promise.resolve();
  const execution = previous.then(write, write);
  const tail = execution.then(() => {}, () => {});
  tails.set(workflowId, tail);
  tail.then(() => {
    if (tails.get(workflowId) === tail) {
      tails.delete(workflowId);
    }
  });
  return execution;
}

/**
 * Write the workflow's durable record: a compare-and-swap of `data` against
 * the witness the workflow state carries (see the owner contract).
 * @param {Object} owner - The split or merge workflow owner.
 * @param {Object} workflow - The state the write is derived from (its
 *   recordWitness is the compared version; it receives the new one).
 * @param {Function} buildWrite - (workflow) => {data, options}: the
 *   UPDATE's data (it must set partition_transition_metadata, string or
 *   null; a data without partition_transition_state keeps the witness's
 *   state) and the gateway mutation options. Called in this owner's turn,
 *   so a write of the live workflow carries every earlier write's effect.
 * @return {Promise<Object>} {accepted, outcome, result}.
 */
function writeWorkflowRecord(owner, workflow, buildWrite) {
  if (!workflow?.recordWitness ||
      typeof workflow.recordWitness !== OBJECT_TYPE) {
    owner.logger?.warn?.(RECORD_WRITE_LOG_MSG.NO_WITNESS,
      {workflowId: workflow?.workflowId ?? null});
    return Promise.resolve(
      {accepted: false, outcome: RECORD_WRITE_OUTCOME.NO_WITNESS});
  }
  return serializeRecordWrite(owner, String(workflow.workflowId),
    () => writeRecordNow(owner, workflow, buildWrite));
}

async function writeRecordNow(owner, workflow, buildWrite) {
  const witness = comparedWitnessOf(owner, workflow);
  const restoreLease = renewLeaseOnWrite(owner, workflow);
  const built = buildWrite(workflow);
  const data = built.data;
  // A write that leaves the state column alone (a claim or renewal) keeps
  // the compared state.
  const written = recordWitnessOf({
    partition_transition_metadata: data.partition_transition_metadata,
    partition_transition_state:
      Object.hasOwn(data, 'partition_transition_state') ?
        data.partition_transition_state : witness.state,
  });
  let result = null;
  let submitError = null;
  try {
    result = await owner.getControlPlaneSystemTableGateway()
      .updateSystemTableRow(TABLES.TABLES, {
        table_id: workflow.tableId,
        partition_transition_metadata: witness.metadata,
        partition_transition_state: witness.state,
      }, data, built.options);
  } catch (error) {
    submitError = error;
  }
  const outcome = !submitError && result?.success !== false &&
    affectedRowsOf(result) === 1 ? RECORD_WRITE_OUTCOME.ACCEPTED :
    (await reconcileRefusedWrite(owner, workflow, written)).outcome;
  const accepted = ACCEPTED_OUTCOMES.has(outcome);
  if (accepted) {
    acknowledgeWrite(owner, workflow, written);
  } else {
    restoreLease();
  }
  // A submission that failed and moved nothing the re-read can see is the
  // submission's own failure, answered as such.
  if (submitError && outcome === RECORD_WRITE_OUTCOME.UNCONFIRMED) {
    throw submitError;
  }
  return {accepted, outcome, result};
}

/**
 * The typed error a write that must land (registration, updates,
 * participant checkpoints, the terminal clear) throws when it did not:
 * `superseded` when another owner holds the record (group retirement stops
 * re-driving on it).
 * @param {Object} workflow
 * @param {Object} write - writeWorkflowRecord's answer.
 * @return {Error}
 */
function recordWriteRefusedError(workflow, write) {
  return Object.assign(new Error(RECORD_WRITE_ERROR_MSG.REFUSED +
    `${workflow?.workflowId} (${write.outcome})`), {
    recordWriteOutcome: write.outcome,
    superseded: write.outcome === RECORD_WRITE_OUTCOME.SUPERSEDED,
    unacknowledged: [],
    acknowledgedReplicaIds: [],
  });
}

/**
 * writeWorkflowRecord for a write that must land: throws
 * recordWriteRefusedError when it did not.
 * @param {Object} owner
 * @param {Object} workflow
 * @param {Function} buildWrite
 * @return {Promise<Object>} The accepted write's answer.
 */
async function writeWorkflowRecordOrThrow(owner, workflow, buildWrite) {
  const write = await writeWorkflowRecord(owner, workflow, buildWrite);
  if (!write.accepted) {
    throw recordWriteRefusedError(workflow, write);
  }
  return write;
}

/**
 * One workflow update derived from the CURRENT in-memory workflow; when it
 * is refused because this owner's own earlier write is on the record (the
 * workflow was rebuilt from that record), the update is derived ONCE more
 * from the rebuilt workflow - never re-applied from the refused state.
 * @param {Object} owner - The workflow owner (workflowCoordinator).
 * @param {string} workflowId
 * @param {Function} updatesOf - (workflow) => the updateWorkflow updates.
 * @return {Promise<Object>} The updated workflow.
 */
async function updateRecordAdoptingOwnWrite(owner, workflowId, updatesOf) {
  const coordinator = owner.workflowCoordinator;
  try {
    return await coordinator.updateWorkflow(workflowId,
      updatesOf(coordinator.requireWorkflow(workflowId)));
  } catch (error) {
    if (error?.recordWriteOutcome !== RECORD_WRITE_OUTCOME.RESYNCED) {
      throw error;
    }
    return coordinator.updateWorkflow(workflowId,
      updatesOf(coordinator.requireWorkflow(workflowId)));
  }
}

// The record store's start-of-workflow surface (registerWorkflowWithClaim).
const WORKFLOW_RECORD_STORE = Object.freeze({
  beginWorkflowRecordLineage: (owner, workflowId) =>
    beginWorkflowRecordLineage(owner, workflowId),
  recordWitnessOf: (tablesRow) => recordWitnessOf(tablesRow),
});

export {
  RECORD_WRITE_OUTCOME,
  WORKFLOW_RECORD_STORE,
  beginWorkflowRecordLineage,
  recordWitnessOf,
  updateRecordAdoptingOwnWrite,
  writeWorkflowRecord,
  writeWorkflowRecordOrThrow,
};
