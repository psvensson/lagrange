/**
 * Owner contract:
 * Owner: every write of a split or merge workflow's durable record - the
 * table's `tables` row transition columns (partition_transition_state,
 * partition_transition_metadata, the epoch columns they carry, and the
 * record GENERATION partition_transition_generation). Owner
 * decision 2026-10-05 (option A): writes are functions of the stored
 * version. The store accepts only "apply this change to the record"; per
 * workflow, at its turn in a queue, each change is applied to the latest
 * acknowledged record and compared against exactly that. No caller passes a
 * pre-built record; there is no rebase.
 * Input: applyRecordChange(owner, workflowId, change, {tableId, kind}) where
 * `change(workflow, stored)` is a pure function over the DECODED record
 * (`workflow`: the owner's decodeWorkflowRecord of it overlaid with this
 * process's non-durable runtime fields, or null when the record does not
 * hold this workflow; `stored`: {bytes, exists, workflowId, state, metadata,
 * claim}) answering the next workflow, RECORD_UNCHANGED (its postcondition
 * already holds), RECORD_CLEARED (the terminal clear) or
 * refuseRecordChange(reason). The caller's expectation is a precondition
 * inside the change, never a record or witness passed in.
 * The turn: base = the latest record this owner ACKNOWLEDGED for the
 * workflow (the exact stored metadata bytes and state), or - with no
 * lineage yet - the row the caller read (a registration) or the owner's
 * view row (a read, never content);
 * next = change(decode(base)); encode; UPDATE ... SET ..., generation =
 * base generation + 1 WHERE metadata = base bytes AND state = base state
 * AND generation = base generation (round 7: the generation strictly
 * increases on every accepted change, the terminal clear included, so a
 * record - a cleared one too - never repeats; a row that predates the
 * column reads 0) (proposed through the table partition's Raft
 * log, evaluated by SQLite at apply time, the proposer answered with that
 * apply's `changes`). One row: the acknowledged record becomes the written
 * bytes and the in-memory workflow is rebuilt from them (a projection)
 * BEFORE the queue releases the next change.
 * Refusal (zero rows, a refused or failed submission): the AUTHORITATIVE
 * re-read (owner.readAuthoritativeWorkflowRecord, else the control plane's
 * owner-RPC leader read) - never the local view, which may lag this owner's
 * own acknowledged write. It decides:
 *   - it holds exactly the bytes this change wrote: a lost acknowledgement,
 *     ACCEPTED;
 *   - no answer: UNCONFIRMED (nothing decided, nothing adopted);
 *   - it lags the base (the base's own record, or a LOWER generation): the
 *     base stands; the same compare-and-swap - the same bytes, encoded once
 *     per base - is retried after a failed submission (bounded; a first
 *     submission that lands late is then recognised as this change's own),
 *     else UNCONFIRMED;
 *   - otherwise it becomes the base (and the projection) and the SAME change
 *     is applied to it: its precondition decides - REFUSED, SUPERSEDED (the
 *     record is not this workflow, or the change refused it as another
 *     owner's: this owner stops driving it, drops its copy, logs ONE WARN),
 *     ALREADY_APPLIED (RECORD_UNCHANGED), or a new compare-and-swap.
 *   Bounded: MAX_COMPARE_AND_SWAP_ATTEMPTS per change. A precondition
 *   refusal decided on an unconfirmed base is confirmed the same way once:
 *   the authoritative record, when it moved past the base, gets the change
 *   re-applied (a refusal never rests on a stale copy alone).
 * Prohibited: a write whose bytes derive from a record other than the one
 * compared; adopting the local view on a refusal; an unconditional UPDATE of
 * these columns; treating a refused write as landed without the
 * authoritative re-read; any exported entry point that takes record content
 * (bytes, metadata or a workflow object) to write.
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
import {
  readWaitClock,
  reportWaitBoundSpent,
} from '../logging/wait-bound-spent.js';

const RECORD_SQL = 'SELECT * FROM tables WHERE table_id = ?';
const STRING_TYPE = 'string';
const OBJECT_TYPE = 'object';
const FUNCTION_TYPE = 'function';
const MAX_COMPARE_AND_SWAP_ATTEMPTS = 3;
// The change's bounded attempts spent undecided (UNCONFIRMED).
const RECORD_CHANGE_ATTEMPTS_WAIT = Object.freeze({
  wait: 'MAX_COMPARE_AND_SWAP_ATTEMPTS',
  awaited: 'the workflow record change decided on the authoritative record',
});
const STATE_COLUMN = 'partition_transition_state';
// The record generation (round 7): strictly increased by every accepted
// change, the terminal clear included, and compared by every
// compare-and-swap; it survives the clear, so a record never repeats. A row
// that predates the column reads 0.
const GENERATION_COLUMN = 'partition_transition_generation';
const READ_BASE_OPTION = 'readBase';

// What one record change came to.
const RECORD_CHANGE_OUTCOME = Object.freeze({
  // Written by this change (or its lost acknowledgement recognised).
  ACCEPTED: 'accepted',
  // The change's postcondition already held on the record: nothing written.
  ALREADY_APPLIED: 'already-applied',
  // The change's precondition is false on the authoritative record.
  REFUSED: 'refused',
  // The record is no longer this owner's workflow.
  SUPERSEDED: 'superseded',
  // Nothing could be decided (no authoritative answer, a lagging read, the
  // bounded attempts spent): nothing written, nothing adopted.
  UNCONFIRMED: 'unconfirmed',
});

const LANDED_OUTCOMES = Object.freeze(new Set([
  RECORD_CHANGE_OUTCOME.ACCEPTED,
  RECORD_CHANGE_OUTCOME.ALREADY_APPLIED,
]));

// How a change's next record is encoded.
const RECORD_CHANGE_KIND = Object.freeze({
  // The owner's full transition payload (state, metadata, epoch columns).
  TRANSITION: 'transition',
  // The metadata only (a claim or a renewal).
  CLAIM: 'claim',
});

const RECORD_UNCHANGED = Symbol('workflow-record-unchanged');
const RECORD_CLEARED = Symbol('workflow-record-cleared');
const REFUSAL = Symbol('workflow-record-refusal');

const RECORD_CHANGE_LOG_MSG = Object.freeze({
  SUPERSEDED: 'Workflow record change refused: another owner holds the ' +
    'record; this owner stops driving the workflow and discards its copy',
});

const RECORD_CHANGE_ERROR_MSG = Object.freeze({
  REFUSED: 'Workflow record change refused: ',
  NOT_A_CHANGE: 'Workflow record writes take a change function of the ' +
    'stored record, never a pre-built record: ',
  UNDECODABLE: 'Workflow record of this workflow does not decode: ',
});

/**
 * A change's refusal: its precondition is false on the record it was given.
 * @param {string} reason
 * @param {Object} [details]
 * @param {boolean} [details.superseded] - The record is another owner's.
 * @return {Object}
 */
function refuseRecordChange(reason, details = {}) {
  return Object.freeze({[REFUSAL]: true, reason: String(reason),
    superseded: details.superseded === true, details});
}

function isRefusal(value) {
  return Boolean(value && value[REFUSAL] === true);
}

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
 * The record generation of one `tables` row: a non-negative integer, 0 for a
 * row (or a view of it) that predates the column.
 * @param {Object|null} row
 * @return {number}
 */
function generationOf(row) {
  const generation = Number(row?.[GENERATION_COLUMN] ?? 0);
  return Number.isSafeInteger(generation) && generation > 0 ? generation : 0;
}

/**
 * The compared record of one `tables` row as READ (absent: null/null/0):
 * what a change's precondition may compare a record against. Never written.
 * @param {Object|null} row
 * @return {{metadata: (string|null), state: (string|null),
 *   generation: number}}
 */
function bytesOf(row) {
  return {
    metadata: storedMetadataOf(row?.partition_transition_metadata),
    state: row?.partition_transition_state ?? null,
    generation: generationOf(row),
  };
}

function sameBytes(left, right) {
  const a = bytesOf(left);
  const b = bytesOf(right);
  return a.metadata === b.metadata && a.state === b.state &&
    a.generation === b.generation;
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

/**
 * The decoded record: which workflow it holds, its state, metadata and
 * ownership claim.
 * @param {Object|null} row
 * @return {Object}
 */
function storedRecordOf(row) {
  const bytes = bytesOf(row);
  const metadata = parseMetadata(bytes.metadata);
  return Object.freeze({
    bytes,
    generation: bytes.generation,
    row: row ?? null,
    exists: Boolean(row),
    workflowId: metadata ? String(metadata[
      PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] || '') || null : null,
    state: bytes.state,
    metadata,
    claim: durableOwnershipClaimOf(metadata),
  });
}

/**
 * The transition a `tables` row stores, decoded from its exact bytes (the
 * owners' record decoders start here): {state, metadata} or null when the row
 * holds no transition.
 * @param {Object|null} row
 * @return {{state: string, metadata: Object}|null}
 */
function storedTransitionOf(row) {
  const bytes = bytesOf(row);
  const metadata = parseMetadata(bytes.metadata);
  return bytes.state && metadata ? {state: bytes.state, metadata} : null;
}

function affectedRowsOf(result) {
  return Number(result?.partitionResult?.affectedRows ?? result?.affectedRows);
}

// The owner's view of the table's record (a read; only ever a base).
function viewRecordOf(owner, tableId) {
  const rows = typeof owner.listTableInfos === FUNCTION_TYPE ?
    owner.listTableInfos() || [] : [];
  return rows.find((row) => String(row?.table_id ?? row?.tableId ?? '') ===
    String(tableId)) || null;
}

/**
 * The authoritative read of the record after a refused write: the owner's
 * own authoritative read when it has one, else the control plane's
 * owner-RPC read at the table partition's leader. undefined when it did not
 * answer (nothing is then decided).
 * @param {Object} owner
 * @param {string} tableId
 * @return {Promise<Object|null|undefined>}
 */
async function authoritativeRecordOf(owner, tableId) {
  if (typeof owner.readAuthoritativeWorkflowRecord === FUNCTION_TYPE) {
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

// The acknowledged records of this owner, per workflow.
function lineagesOf(owner) {
  owner.workflowRecordLineages ??= new Map();
  return owner.workflowRecordLineages;
}

/**
 * Forget this owner's acknowledged record of one workflow (its in-memory
 * copy was dropped): its next change starts from a read.
 * @param {Object} owner
 * @param {string} workflowId
 * @return {void}
 */
function forgetWorkflowRecord(owner, workflowId) {
  owner.workflowRecordLineages?.delete(String(workflowId));
}

// The durable fields of a workflow projection: only ever assigned from a
// decoded record.
const DURABLE_FIELDS = Object.freeze(['status', 'metadata', 'participants',
  'fenceToken', 'workflowOwnerId', 'leaseExpiresAt']);

function durableFieldsOf(decoded) {
  const fields = {};
  for (const field of DURABLE_FIELDS) {
    fields[field] = decoded[field];
  }
  return fields;
}

function runtimeFieldsOf(workflow) {
  if (!workflow) {
    return {};
  }
  const runtime = {...workflow};
  for (const field of DURABLE_FIELDS) {
    delete runtime[field];
  }
  return runtime;
}

/**
 * The workflow a change is given: the record decoded by the owner, overlaid
 * on this process's non-durable runtime fields; null when the record does
 * not hold this workflow.
 * @param {Object} owner
 * @param {string} workflowId
 * @param {Object|null} row
 * @return {Object|null}
 */
function decodedWorkflowOf(owner, workflowId, row) {
  const stored = storedRecordOf(row);
  if (!row || stored.workflowId !== workflowId) {
    return null;
  }
  const decoded = owner.decodeWorkflowRecord(workflowId, row);
  if (!decoded) {
    return null;
  }
  const live = owner.workflowCoordinator.getWorkflowById(workflowId);
  return {...decoded, ...runtimeFieldsOf(live), ...durableFieldsOf(decoded)};
}

/**
 * Rebuild the in-memory workflow as a projection of one record: its durable
 * fields from the decoded record, its runtime fields from `runtime` (the
 * change's next workflow) or the live copy.
 * @param {Object} owner
 * @param {string} workflowId
 * @param {Object|null} row
 * @param {Object|null} runtime
 * @return {Object|null} The projection.
 */
function projectWorkflow(owner, workflowId, row, runtime) {
  const coordinator = owner.workflowCoordinator;
  const decoded = row ? owner.decodeWorkflowRecord(workflowId, row) : null;
  if (!decoded) {
    // A record of this workflow its own owner cannot decode: fail-closed.
    throw new Error(RECORD_CHANGE_ERROR_MSG.UNDECODABLE + workflowId);
  }
  const live = coordinator.getWorkflowById(workflowId);
  const next = {...decoded, ...runtimeFieldsOf(live),
    ...runtimeFieldsOf(runtime), ...durableFieldsOf(decoded)};
  if (!live) {
    return coordinator.adoptWorkflowProjection(next);
  }
  for (const key of Object.keys(live)) {
    if (!Object.hasOwn(next, key)) {
      delete live[key];
    }
  }
  Object.assign(live, next);
  return live;
}

/**
 * This owner lost the workflow: stop driving it, log once (per workflow and
 * fence), discard the in-memory copy and its lineage.
 * @param {Object} owner
 * @param {string} workflowId
 * @param {Object|null} row - The authoritative record.
 * @return {void}
 */
function relinquishWorkflow(owner, workflowId, row) {
  const live = owner.workflowCoordinator.getWorkflowById(workflowId);
  owner.relinquishedWorkflowFences ??= new Set();
  const logKey = `${workflowId}\u0000${live?.fenceToken ?? ''}`;
  if (!owner.relinquishedWorkflowFences.has(logKey)) {
    owner.relinquishedWorkflowFences.add(logKey);
    owner.logger?.warn?.(RECORD_CHANGE_LOG_MSG.SUPERSEDED,
      relinquishFieldsOf(owner, workflowId, live, row));
  }
  owner.groupRetirementRedrive?.abandon?.(workflowId);
  forgetWorkflowRecord(owner, workflowId);
  if (live) {
    owner.workflowCoordinator.removeWorkflow(workflowId);
  }
}

// The lost workflow's WARN: this owner's fence and the record's owner/fence.
function relinquishFieldsOf(owner, workflowId, live, row) {
  const stored = storedRecordOf(row);
  return {
    workflowId,
    fenceToken: live?.fenceToken ?? null,
    ownerId: owner.workflowOwnerId,
    recordWorkflowId: stored.workflowId,
    recordOwnerId: stored.claim.workflowOwnerId ?? null,
    recordFenceToken: stored.claim.fenceToken ?? null,
    recordState: stored.state,
  };
}

/**
 * Whether the authoritative re-read lags the base: it holds the base's own
 * record, or a record of a LOWER generation (generations only grow, so it
 * is an older copy - a leader that has not applied the base yet). Anything
 * else - an absent row included (the table is gone) - moved past the base.
 * @param {Object|null} reread
 * @param {Object|null} base
 * @return {boolean}
 */
function rereadLagsBase(reread, base) {
  return sameBytes(reread, base) ||
    (reread !== null && generationOf(reread) < generationOf(base));
}

// Every accepted change advances the generation by one, in the same write
// (the clear included): stamped here, so no encoder can omit it.
function withNextGeneration(encoded, base) {
  return {...encoded, data: {...encoded.data,
    [GENERATION_COLUMN]: generationOf(base) + 1}};
}

// Encode one change's next record into the UPDATE's data and options.
function encodeChange(owner, next, kind, base) {
  if (next === RECORD_CLEARED) {
    return withNextGeneration(owner.encodeWorkflowRecordClear(), base);
  }
  const encoded = withNextGeneration(owner.encodeWorkflowRecord(next, kind),
    base);
  if (!Object.hasOwn(encoded.data, STATE_COLUMN)) {
    // A claim leaves the state column alone: the written state is the base's.
    return {...encoded, writtenState: bytesOf(base).state};
  }
  return {...encoded, writtenState: encoded.data.partition_transition_state};
}

function writtenRowOf(base, encoded, tableId) {
  return {
    ...(base || {table_id: tableId}),
    ...encoded.data,
    partition_transition_metadata:
      encoded.data.partition_transition_metadata ?? null,
    partition_transition_state: encoded.writtenState ?? null,
  };
}

// The compare-and-swap of one encoded change against exactly `base`.
async function compareAndSwap(owner, tableId, base, encoded) {
  const compared = bytesOf(base);
  try {
    const result = await owner.getControlPlaneSystemTableGateway()
      .updateSystemTableRow(TABLES.TABLES, {
        table_id: tableId,
        partition_transition_metadata: compared.metadata,
        partition_transition_state: compared.state,
        [GENERATION_COLUMN]: compared.generation,
      }, encoded.data, encoded.options);
    return {landed: result?.success !== false && affectedRowsOf(result) === 1,
      submitError: null};
  } catch (error) {
    return {landed: false, submitError: error};
  }
}

// Apply the change to one base: the change's own answer, decoded.
function applyChangeTo(owner, workflowId, change, base) {
  const answer = change(decodedWorkflowOf(owner, workflowId, base),
    storedRecordOf(base));
  if (isRefusal(answer)) {
    return {refusal: answer};
  }
  if (answer === RECORD_UNCHANGED) {
    return {unchanged: true};
  }
  if (answer !== RECORD_CLEARED &&
      (!answer || typeof answer !== OBJECT_TYPE)) {
    throw new TypeError(RECORD_CHANGE_ERROR_MSG.NOT_A_CHANGE + workflowId);
  }
  return {next: answer};
}

function settled(outcome, extra = {}) {
  return {outcome, accepted: LANDED_OUTCOMES.has(outcome), ...extra};
}

// The record a landed change leaves: acknowledged, projected (or cleared).
function acknowledge(owner, workflowId, written, next) {
  if (next === RECORD_CLEARED) {
    forgetWorkflowRecord(owner, workflowId);
    return null;
  }
  lineagesOf(owner).set(workflowId, written);
  return projectWorkflow(owner, workflowId, written, next);
}

// A refusal on the authoritative record: SUPERSEDED (relinquish) when the
// record is not this workflow or the change refused it as another owner's.
function settleRefusal(owner, workflowId, refusal, base) {
  const holds = storedRecordOf(base).workflowId === workflowId;
  if (refusal.superseded || !holds) {
    relinquishWorkflow(owner, workflowId, base);
    return settled(RECORD_CHANGE_OUTCOME.SUPERSEDED, {refusal});
  }
  return settled(RECORD_CHANGE_OUTCOME.REFUSED, {refusal});
}

// Adopt an authoritative record that moved past the base: the new base, and
// the projection when it holds this workflow.
function adoptAuthoritative(owner, workflowId, reread) {
  if (storedRecordOf(reread).workflowId === workflowId) {
    lineagesOf(owner).set(workflowId, reread);
    projectWorkflow(owner, workflowId, reread, null);
  }
}

/**
 * What the authoritative re-read says about a write that did not land (see
 * the owner contract): settled (accepted lost acknowledgement, unconfirmed),
 * or the base the change is applied to next (the same, to retry a failed
 * submission; the re-read, adopted, when the record moved past the base).
 * @param {Object} owner
 * @param {string} workflowId
 * @param {Object} attempt - {reread, base, written, next, submitError}.
 * @return {Object} {settled} or {base}.
 */
function decideRefusedWrite(owner, workflowId, attempt) {
  const {reread, base, written, next, submitError} = attempt;
  if (reread === undefined) {
    return {settled: settled(RECORD_CHANGE_OUTCOME.UNCONFIRMED,
      {submitError})};
  }
  if (reread && sameBytes(reread, written)) {
    // A lost acknowledgement: the record holds exactly this change.
    return {settled: settled(RECORD_CHANGE_OUTCOME.ACCEPTED, {
      lostAcknowledgement: true,
      workflow: acknowledge(owner, workflowId, reread, next)})};
  }
  if (rereadLagsBase(reread, base)) {
    return submitError && sameBytes(reread, base) ? {base} :
      {settled: settled(RECORD_CHANGE_OUTCOME.UNCONFIRMED, {submitError})};
  }
  adoptAuthoritative(owner, workflowId, reread);
  return {base: reread};
}

/**
 * The authoritative record when it moved past `base` (adopted as the new
 * base and projection), else null (no answer, the same record, or a read
 * that lags the base: the base stands).
 * @param {Object} owner
 * @param {string} workflowId
 * @param {string} tableId
 * @param {Object|null} base
 * @return {Promise<Object|null>}
 */
async function movedRecordOf(owner, workflowId, tableId, base) {
  const reread = await authoritativeRecordOf(owner, tableId);
  if (reread === undefined || rereadLagsBase(reread, base)) {
    return null;
  }
  adoptAuthoritative(owner, workflowId, reread);
  return reread;
}

/**
 * One change at its turn (see the owner contract).
 * @param {Object} owner
 * @param {string} workflowId
 * @param {Function} change
 * @param {Object} options - {tableId, kind}.
 * @return {Promise<Object>} {outcome, accepted, workflow, refusal}.
 */
async function runChange(owner, workflowId, change, options) {
  const turn = {owner, workflowId, change, tableId: String(options.tableId),
    kind: options.kind || RECORD_CHANGE_KIND.TRANSITION,
    base: initialBaseOf(owner, workflowId, options), confirmed: false,
    // The write of this turn, encoded ONCE per base: a retry of the same
    // compare-and-swap after a failed submission resubmits the same bytes,
    // so a first submission that lands late is recognised as this change's
    // own.
    write: null};
  let submitError = null;
  const startedAtMs = readWaitClock(owner);
  for (let attempt = 0; attempt < MAX_COMPARE_AND_SWAP_ATTEMPTS;
    attempt += 1) {
    const step = turn.write?.base === turn.base ? null :
      await applyAtTurn(turn);
    if (step?.settled) {
      return step.settled;
    }
    if (step?.moved) {
      continue;
    }
    const {base, write} = turn;
    const swap = await compareAndSwap(owner, turn.tableId, base, write.encoded);
    submitError = swap.submitError;
    if (swap.landed) {
      return settled(RECORD_CHANGE_OUTCOME.ACCEPTED, {
        workflow: acknowledge(owner, workflowId, write.written, write.next)});
    }
    const reread = await authoritativeRecordOf(owner, turn.tableId);
    const decided = decideRefusedWrite(owner, workflowId,
      {reread, base, written: write.written, next: write.next, submitError});
    if (decided.settled) {
      return decided.settled;
    }
    turn.confirmed = true;
    turn.base = decided.base;
  }
  reportWaitBoundSpent(owner.logger, {
    ...RECORD_CHANGE_ATTEMPTS_WAIT,
    boundMs: null,
    elapsedMs: readWaitClock(owner) - startedAtMs,
    lastObserved: () => ({attempts: MAX_COMPARE_AND_SWAP_ATTEMPTS,
      kind: turn.kind, baseState: turn.base?.[STATE_COLUMN] ?? null,
      baseGeneration: turn.base?.[GENERATION_COLUMN] ?? null,
      submitError: submitError ? String(submitError.message ?? submitError) :
        null}),
    scope: {workflowId, tableId: turn.tableId},
  });
  return settled(RECORD_CHANGE_OUTCOME.UNCONFIRMED, {submitError});
}

// A change's first base: this owner's acknowledged record of the workflow,
// else the row the caller read (a registration), else the owner's view row
// (a read, never content).
function initialBaseOf(owner, workflowId, options) {
  if (lineagesOf(owner).has(workflowId)) {
    return lineagesOf(owner).get(workflowId);
  }
  return Object.hasOwn(options, READ_BASE_OPTION) ? options.readBase :
    viewRecordOf(owner, String(options.tableId));
}

/**
 * Apply the turn's change to its base: settled (a confirmed refusal, or
 * already applied), moved (a refusal decided on an unconfirmed base whose
 * authoritative record moved past it: the change is applied again to that),
 * or null with the turn's write encoded.
 * @param {Object} turn - The change's turn (see runChange).
 * @return {Promise<Object|null>}
 */
async function applyAtTurn(turn) {
  const {owner, workflowId, base} = turn;
  const applied = applyChangeTo(owner, workflowId, turn.change, base);
  if (applied.refusal) {
    // A refusal decided on an unconfirmed base (this owner's acknowledged
    // record or a view) is confirmed against the authoritative record once.
    const moved = turn.confirmed ? null :
      await movedRecordOf(owner, workflowId, turn.tableId, base);
    turn.confirmed = true;
    if (!moved) {
      return {settled: settleRefusal(owner, workflowId, applied.refusal,
        base)};
    }
    turn.base = moved;
    return {moved: true};
  }
  if (applied.unchanged) {
    return {settled: settled(RECORD_CHANGE_OUTCOME.ALREADY_APPLIED, {
      workflow: owner.workflowCoordinator.getWorkflowById(workflowId)})};
  }
  turn.write = encodedWriteOf(owner, applied.next,
    {kind: turn.kind, base, tableId: turn.tableId});
  return null;
}

// One change's write against `base`: its encoded UPDATE and the row it
// leaves (what a lost acknowledgement's re-read must hold exactly).
function encodedWriteOf(owner, next, {kind, base, tableId}) {
  const encoded = encodeChange(owner, next, kind, base);
  return {base, next, encoded, written: writtenRowOf(base, encoded, tableId)};
}

// One owner's changes of one workflow run one at a time, in order.
function enqueueChange(owner, workflowId, run) {
  owner.workflowRecordChangeTails ??= new Map();
  const tails = owner.workflowRecordChangeTails;
  const previous = tails.get(workflowId) || Promise.resolve();
  const execution = previous.then(run, run);
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
 * Apply one change to the workflow's durable record (see the owner
 * contract).
 * @param {Object} owner - The split or merge workflow owner
 *   (decodeWorkflowRecord, encodeWorkflowRecord, encodeWorkflowRecordClear,
 *   workflowCoordinator, getControlPlaneSystemTableGateway, listTableInfos,
 *   workflowOwnerId, now).
 * @param {string} workflowId
 * @param {Function} change - (workflow|null, stored) => next |
 *   RECORD_UNCHANGED | RECORD_CLEARED | refuseRecordChange(...).
 * @param {Object} options
 * @param {string} options.tableId - The table whose record it is.
 * @param {string} [options.kind] - RECORD_CHANGE_KIND (TRANSITION default).
 * @param {Object|null} [options.readBase] - With no lineage, the row the
 *   caller READ (its registration derived from it): the first compared
 *   base instead of the view. Only ever compared, never written.
 * @return {Promise<Object>} {outcome, accepted, workflow, refusal}.
 */
function applyRecordChange(owner, workflowId, change, options) {
  if (typeof change !== FUNCTION_TYPE) {
    throw new TypeError(RECORD_CHANGE_ERROR_MSG.NOT_A_CHANGE +
      String(workflowId));
  }
  const id = String(workflowId);
  return enqueueChange(owner, id,
    () => runChange(owner, id, change, options));
}

/**
 * The typed error a change that must land throws when it did not:
 * `superseded` when another owner holds the record (group retirement stops
 * re-driving on it), `unconfirmed` when nothing could be decided.
 * @param {string} workflowId
 * @param {Object} write - applyRecordChange's answer.
 * @return {Error}
 */
function recordChangeRefusedError(workflowId, write) {
  return Object.assign(new Error(RECORD_CHANGE_ERROR_MSG.REFUSED +
    `${workflowId} (${write.outcome}` +
    `${write.refusal ? `: ${write.refusal.reason}` : ''})`), {
    recordChangeOutcome: write.outcome,
    refusal: write.refusal ?? null,
    superseded: write.outcome === RECORD_CHANGE_OUTCOME.SUPERSEDED,
    unacknowledged: [],
    acknowledgedReplicaIds: [],
  });
}

export {
  RECORD_CHANGE_KIND,
  RECORD_CHANGE_OUTCOME,
  RECORD_CLEARED,
  RECORD_UNCHANGED,
  applyRecordChange,
  bytesOf as recordBytesOf,
  forgetWorkflowRecord,
  isRefusal as isRecordRefusal,
  recordChangeRefusedError,
  storedTransitionOf,
  refuseRecordChange,
};
