/**
 * Owner contract:
 * Owner: ControlPlanePublicationsOwner owns every write of a
 *   control_plane_publications row.
 * Inputs: a candidate row to admit, or a pure change of the durable row.
 * Canonical output: the typed outcomes of control-plane-publication-change.js
 *   (COMMITTED / ALREADY_APPLIED / UNCHANGED / REFUSED / UNKNOWN).
 * Prohibited fallbacks: no upsert, no unconditional update, no write whose
 *   base is a cache row, no row returned as persisted without the durable
 *   owner's answer.
 * Primary tests: test/control-plane/control-plane-publications-owner-guarded-
 *   change.test.js, test/control-plane/membership-publication-guarded-write-
 *   witness.test.js.
 */
import {TABLES} from '../../constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane-readiness-constants.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../control-plane-workload-profile.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from '../control-plane-system-table-gateway-constants.js';
import {
  isAuthoritativeControlPlaneRowReadSuccessful,
} from '../control-plane-system-table-gateway.js';
import {mintControlPlaneWriteKey} from '../control-plane-write-identity.js';
import {
  isControlPlaneWriterShutDown,
} from '../control-plane-error-classification.js';
import {reportWaitBoundSpent} from '../../logging/wait-bound-spent.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';
import {
  ADMISSION_REVISION,
  PUBLICATION_CHANGE_UNCHANGED,
  PUBLICATION_ID_COLUMN,
  PUBLICATION_REVISION_COLUMN,
  PUBLICATION_WRITE_REFUSAL,
  PUBLICATION_WRITE_UNKNOWN_REASON,
  alreadyApplied,
  changedPublicationColumns,
  committed,
  decodeDurablePublicationRow,
  durableRowHoldsWrite,
  isPublicationChangeRefusal,
  refused,
  unchanged,
  unknown,
} from './control-plane-publication-change.js';

const CONTROL_PLANE_PUBLICATION_DELIVERY_PRIORITY = 'critical';
const CONTROL_PLANE_PUBLICATIONS_OWNER_NAME =
  'control-plane-publications-owner';
// A change loses a round only to another writer's landed change of the same
// row; a row has at most one acknowledgement per member plus the owner's
// refreshes in flight.
const PUBLICATION_CHANGE_MAX_ROUNDS = 8;
const PUBLICATION_ADMISSION_MAX_ROUNDS = 3;
const PUBLICATION_CHANGE_ROUNDS_WAIT = Object.freeze({
  wait: 'PUBLICATION_CHANGE_MAX_ROUNDS',
  awaited: 'a compare-and-set of the publication row on its revision landing',
});
const LANDED_AFFECTED_ROWS = 1;
const MISSED_AFFECTED_ROWS = 0;
const CHANGE_NOT_A_ROW_MESSAGE =
  'A publication change answers the next row, UNCHANGED or a refusal: ';

// The read a write is computed from and confirmed by: the partition leader's
// own answer, never a cache row and never a fallback read.
const AUTHORITATIVE_ROW_READ = Object.freeze({
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
});

const DURABLE_READ = Object.freeze({
  ANSWERED: 'answered',
  UNAVAILABLE: 'unavailable',
});

// What one submitted write's answer says: it landed (one row), it missed
// (no row: the predicate did not hold, or the row was already present), or
// it was not answered (a failure, or an answer without a row count: the
// write may or may not have applied).
const WRITE_ANSWER = Object.freeze({
  LANDED: 'landed',
  MISSED: 'missed',
  UNANSWERED: 'unanswered',
});

function affectedRowsOf(result) {
  return Number(result?.partitionResult?.affectedRows ?? result?.affectedRows);
}

function classifyWriteAnswer(result) {
  const affectedRows = affectedRowsOf(result);
  if (affectedRows === LANDED_AFFECTED_ROWS) {
    return WRITE_ANSWER.LANDED;
  }
  return affectedRows === MISSED_AFFECTED_ROWS ?
    WRITE_ANSWER.MISSED : WRITE_ANSWER.UNANSWERED;
}

// Apply the change to one decoded durable row: its own answer, classified.
function applyChangeTo(change, row, publicationId) {
  const answer = change(row);
  if (isPublicationChangeRefusal(answer)) {
    return {refusal: answer};
  }
  if (answer === PUBLICATION_CHANGE_UNCHANGED) {
    return {unchanged: true};
  }
  if (!answer || typeof answer !== 'object') {
    throw new TypeError(CHANGE_NOT_A_ROW_MESSAGE + publicationId);
  }
  const data = changedPublicationColumns(row, answer);
  return Object.keys(data).length === 0 ? {unchanged: true} : {data};
}

class ControlPlanePublicationsOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = CONTROL_PLANE_PUBLICATIONS_OWNER_NAME;
  static TABLE_NAME = TABLES.CONTROL_PLANE_PUBLICATIONS;

  buildPublicationMutationOptions(options = {}) {
    const workloadProfile = buildControlPlaneWorkloadProfile(
      CONTROL_PLANE_WORKLOAD_CLASS.PUBLICATION_MUTATION,
    );
    return {
      ...options,
      deliveryPriority: CONTROL_PLANE_PUBLICATION_DELIVERY_PRIORITY,
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      workloadClass: workloadProfile.workloadClass,
      workClass: workloadProfile.workClass,
    };
  }

  buildPublicationReadOptions(options = {}) {
    return {
      ...options,
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    };
  }

  async getPublication(publicationId, options = {}) {
    return this.readByPrimaryKey(
      publicationId,
      this.buildPublicationReadOptions(options),
    );
  }

  async getPublicationFromCache(publicationId, options = {}) {
    return this.readCachedByPrimaryKey(publicationId, options);
  }

  async listPublications(options = {}) {
    return this.listRows(this.buildPublicationReadOptions(options));
  }

  async listPublicationsFromCache(options = {}) {
    return this.listCachedRows(options);
  }

  /**
   * The durable row as the partition leader answers it: ANSWERED with the
   * stored row (null when there is none), or UNAVAILABLE. Only an explicit
   * success is an answer.
   * @param {string} publicationId
   * @param {Object} [options={}] - The caller's delivery options.
   * @return {Promise<{state: string, storedRow: Object|null}>}
   */
  async readDurablePublication(publicationId, options = {}) {
    let result = null;
    try {
      result = await this.readByPrimaryKeyObservation(
        publicationId,
        this.buildPublicationReadOptions({...options,
          ...AUTHORITATIVE_ROW_READ}),
      );
    } catch (error) {
      return {state: DURABLE_READ.UNAVAILABLE, storedRow: null, error};
    }
    if (!isAuthoritativeControlPlaneRowReadSuccessful(result) ||
        !Array.isArray(result.rows)) {
      return {state: DURABLE_READ.UNAVAILABLE, storedRow: null,
        error: result?.error ?? null};
    }
    return {
      state: DURABLE_READ.ANSWERED,
      storedRow: result.rows.find((row) =>
        row?.[PUBLICATION_ID_COLUMN] === publicationId) ?? null,
    };
  }

  // One submitted write under its key: its classified answer. A failure is
  // an unanswered write, never proof that nothing applied.
  async submitPublicationWrite(submit) {
    try {
      return {answer: classifyWriteAnswer(await submit()), error: null};
    } catch (error) {
      return {answer: WRITE_ANSWER.UNANSWERED, error};
    }
  }

  /**
   * Admit a publication row: an insert that never replaces, at revision 1.
   * A second creator of the same row is answered ALREADY_APPLIED with the
   * durable row.
   * @param {Object} row - The candidate row (its revision is the owner's).
   * @param {Object} [options={}] - The caller's delivery options.
   * @return {Promise<Object>} The typed outcome.
   */
  async admitPublication(row, options = {}) {
    const candidate = decodeDurablePublicationRow({
      ...row, [PUBLICATION_REVISION_COLUMN]: ADMISSION_REVISION}).row;
    const publicationId = candidate[PUBLICATION_ID_COLUMN];
    // One key per submitted insert: an unanswered insert is re-sent under
    // its key (the same entry, answered from its outcome), never as a second
    // insert.
    let writeKey = mintControlPlaneWriteKey();
    let unanswered = null;
    for (let round = 0; round < PUBLICATION_ADMISSION_MAX_ROUNDS;
      round += 1) {
      const key = writeKey;
      const {answer, error} = await this.submitPublicationWrite(() =>
        this.insertRow(candidate, this.buildPublicationMutationOptions({
          ...options, ignoreExisting: true, idempotencyKey: key})));
      if (answer === WRITE_ANSWER.LANDED) {
        return committed(candidate);
      }
      if (isControlPlaneWriterShutDown(error)) {
        return unknown(publicationId, key,
          PUBLICATION_WRITE_UNKNOWN_REASON.WRITER_SHUT_DOWN, {error});
      }
      const read = await this.readDurablePublication(publicationId, options);
      if (answer === WRITE_ANSWER.UNANSWERED) {
        unanswered = {writeKey: key, error};
        if (read.state === DURABLE_READ.UNAVAILABLE) {
          return unknown(publicationId, key, PUBLICATION_WRITE_UNKNOWN_REASON
            .CONFIRMING_READ_UNAVAILABLE, {error});
        }
      } else {
        unanswered = null;
        writeKey = mintControlPlaneWriteKey();
        if (read.state === DURABLE_READ.UNAVAILABLE) {
          return refused(PUBLICATION_WRITE_REFUSAL.PRESENT_ROW_UNREADABLE,
            {publicationId});
        }
      }
      if (read.storedRow) {
        const durable = decodeDurablePublicationRow(read.storedRow).row;
        return answer === WRITE_ANSWER.UNANSWERED &&
          durableRowHoldsWrite(durable, candidate) ?
          committed(durable) : alreadyApplied(durable);
      }
    }
    return unanswered ?
      unknown(publicationId, unanswered.writeKey,
        PUBLICATION_WRITE_UNKNOWN_REASON.WRITE_UNRESOLVED,
        {error: unanswered.error}) :
      refused(PUBLICATION_WRITE_REFUSAL.CONTENTION_ROUNDS_SPENT,
        {publicationId});
  }

  /**
   * Apply one change to a publication row as a function of its stored
   * revision (see control-plane-publication-change.js).
   *
   * `change(durableRow)` is pure: it answers the next row, UNCHANGED or a
   * refusal, and is re-applied to every row the durable owner answers. The
   * write is `UPDATE ... WHERE publication_id = ? AND publication_revision =
   * ?`, setting only the columns the change moved and the next revision as
   * a plain parameter; it landed when it affected exactly one row.
   * @param {string} publicationId
   * @param {Function} change - (durableRow) => next row | UNCHANGED | refusal.
   * @param {Object} [options={}] - The caller's delivery options and logger.
   * @return {Promise<Object>} The typed outcome.
   */
  async applyPublicationChange(publicationId, change, options = {}) {
    const {logger = null, ...deliveryOptions} = options;
    // The write submitted against one base revision, encoded once: while the
    // durable row still shows that base, an unanswered write is re-sent as
    // the same bytes under the same key (one entry), never recomputed.
    let pending = null;
    let submitted = false;
    for (let round = 0; round < PUBLICATION_CHANGE_MAX_ROUNDS; round += 1) {
      const read = await this.readDurablePublication(publicationId,
        deliveryOptions);
      if (read.state === DURABLE_READ.UNAVAILABLE) {
        return pending ?
          unknown(publicationId, pending.writeKey,
            PUBLICATION_WRITE_UNKNOWN_REASON.CONFIRMING_READ_UNAVAILABLE,
            {error: pending.error}) :
          refused(PUBLICATION_WRITE_REFUSAL.AUTHORITATIVE_READ_UNAVAILABLE,
            {publicationId, error: read.error});
      }
      if (!read.storedRow) {
        return refused(PUBLICATION_WRITE_REFUSAL.PUBLICATION_ABSENT,
          {publicationId});
      }
      const {row, revision} = decodeDurablePublicationRow(read.storedRow);
      if (revision === null) {
        return refused(PUBLICATION_WRITE_REFUSAL.REVISION_UNREADABLE,
          {publicationId, row});
      }
      if (pending && revision === pending.baseRevision + 1 &&
          durableRowHoldsWrite(row, pending.data)) {
        // The unanswered write is the durable row: its answer was lost.
        return committed(row);
      }
      if (!pending || revision !== pending.baseRevision) {
        const step = applyChangeTo(change, row, publicationId);
        if (step.refusal) {
          return refused(step.refusal.reason, {publicationId, row});
        }
        if (step.unchanged) {
          return submitted ? alreadyApplied(row) : unchanged(row);
        }
        pending = {
          baseRevision: revision,
          baseRow: row,
          data: {...step.data, [PUBLICATION_REVISION_COLUMN]: revision + 1},
          writeKey: mintControlPlaneWriteKey(),
          error: null,
        };
      }
      const write = pending;
      submitted = true;
      const {answer, error} = await this.submitPublicationWrite(() =>
        this.updateWhere(
          {[PUBLICATION_ID_COLUMN]: publicationId,
            [PUBLICATION_REVISION_COLUMN]: write.baseRevision},
          write.data,
          this.buildPublicationMutationOptions({...deliveryOptions,
            idempotencyKey: write.writeKey}),
        ));
      if (answer === WRITE_ANSWER.LANDED) {
        return committed({...write.baseRow, ...write.data});
      }
      if (isControlPlaneWriterShutDown(error)) {
        return unknown(publicationId, write.writeKey,
          PUBLICATION_WRITE_UNKNOWN_REASON.WRITER_SHUT_DOWN, {error});
      }
      // A miss is this write's final answer (its key is spent); an
      // unanswered write stays pending for the next read to resolve.
      pending = answer === WRITE_ANSWER.MISSED ? null : {...write, error};
    }
    if (pending) {
      return unknown(publicationId, pending.writeKey,
        PUBLICATION_WRITE_UNKNOWN_REASON.WRITE_UNRESOLVED,
        {error: pending.error});
    }
    reportWaitBoundSpent(logger, {
      ...PUBLICATION_CHANGE_ROUNDS_WAIT,
      boundMs: null,
      lastObserved: () => ({rounds: PUBLICATION_CHANGE_MAX_ROUNDS}),
      scope: {publicationId},
    });
    return refused(PUBLICATION_WRITE_REFUSAL.CONTENTION_ROUNDS_SPENT,
      {publicationId});
  }

  async removePublication(publicationId, options = {}) {
    return this.deleteByPrimaryKey(
      publicationId,
      this.buildPublicationMutationOptions(options),
    );
  }
}

export {ControlPlanePublicationsOwner};
