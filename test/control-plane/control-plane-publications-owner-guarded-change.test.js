// ControlPlanePublicationsOwner writes a publication row in two ways only:
// an insert-only admission at revision 1 and a change of the durable row
// guarded by its revision. Every write answers one typed outcome (see
// src/control-plane/owners/control-plane-publication-change.js). These tests
// pin each outcome at the owner's gateway seam; committed-state claims over
// the real replicated table are in
// membership-publication-guarded-write-witness.test.js.

import {test} from '../../src/test-helpers/tap.js';
import {
  PUBLICATION_CHANGE_UNCHANGED,
  PUBLICATION_WRITE_OUTCOME,
  PUBLICATION_WRITE_REFUSAL,
  PUBLICATION_WRITE_UNKNOWN_REASON,
  isPublicationWriteLanded,
  isPublicationWriteObligationRetained,
  isPublicationWriteSettled,
  refusePublicationChange,
} from '../../src/control-plane/owners/control-plane-publication-change.js';
import {
  canonicalizeControlPlaneMutation,
} from '../../src/control-plane/control-plane-system-table-gateway-mutation-contracts.js';
import {
  CONTROL_PLANE_GATEWAY_ERROR_CODE,
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';
import {createPublicationStore} from './publication-owner-test-support.js';

const PUBLICATION_ID = 'publication-1';

function candidateRow(overrides = {}) {
  return {
    publication_id: PUBLICATION_ID,
    publication_kind: 'cluster_membership',
    publication_epoch: 1,
    publisher_node_id: 'node-1',
    published_active_node_ids: ['node-1', 'node-2'],
    required_ack_node_ids: ['node-1', 'node-2'],
    acknowledged_node_ids: [],
    status: 'OPEN',
    reason_code: '',
    created_at: 10,
    updated_at: 10,
    transition_history: [],
    ...overrides,
  };
}

const acknowledge = (nodeId) => (row) =>
  (row.acknowledged_node_ids.includes(nodeId) ?
    PUBLICATION_CHANGE_UNCHANGED :
    {...row,
      acknowledged_node_ids: [...row.acknowledged_node_ids, nodeId].sort(),
      updated_at: row.updated_at + 1});

function lostAnswer() {
  const error = new Error('answer lost');
  error.code = 'ROUTER_MESSAGE_TIMEOUT';
  return error;
}

test('admission inserts at revision 1 and never replaces', async (t) => {
  const store = createPublicationStore();
  const first = await store.owner.admitPublication(candidateRow());
  t.equal(first.outcome, PUBLICATION_WRITE_OUTCOME.COMMITTED);
  t.equal(first.row.publication_revision, 1);
  t.equal(store.row(PUBLICATION_ID).publication_revision, 1,
    'the stored revision is the integer 1');
  t.equal(store.writes[0].options.ignoreExisting, true,
    'the insert never replaces');

  const second = await store.owner.admitPublication(candidateRow({
    acknowledged_node_ids: ['node-2'], status: 'ACK_PENDING'}));
  t.equal(second.outcome, PUBLICATION_WRITE_OUTCOME.ALREADY_APPLIED,
    'a second creator is told the row is already present');
  t.same(second.row.acknowledged_node_ids, [],
    'and is answered the durable row, not its own candidate');
  t.same(store.row(PUBLICATION_ID).acknowledged_node_ids, [],
    'the durable row is not replaced');
});

test('admission: a lost answer is resolved by the durable read, or is ' +
  'UNKNOWN when that read is unavailable', async (t) => {
  const confirmed = createPublicationStore();
  confirmed.control.afterWrite = () => {
    confirmed.control.afterWrite = null;
    throw lostAnswer();
  };
  const landed = await confirmed.owner.admitPublication(candidateRow());
  t.equal(landed.outcome, PUBLICATION_WRITE_OUTCOME.COMMITTED,
    'the durable row is exactly the unanswered insert');
  t.equal(confirmed.writes.length, 1, 'nothing is inserted twice');

  const unread = createPublicationStore();
  unread.control.afterWrite = () => {
    unread.control.readsUnavailable = true;
    throw lostAnswer();
  };
  const unknown = await unread.owner.admitPublication(candidateRow());
  t.equal(unknown.outcome, PUBLICATION_WRITE_OUTCOME.UNKNOWN);
  t.equal(unknown.reason,
    PUBLICATION_WRITE_UNKNOWN_REASON.CONFIRMING_READ_UNAVAILABLE);
  t.equal(unknown.publicationId, PUBLICATION_ID);
  t.equal(unknown.writeKey, unread.writes[0].options.idempotencyKey,
    'the outcome names the write that may still apply');
  t.equal(isPublicationWriteObligationRetained(unknown), true);
  t.equal(isPublicationWriteLanded(unknown), false);
});

test('admission: an insert that did not apply is re-sent under its own key',
  async (t) => {
    const store = createPublicationStore();
    store.control.beforeWrite = () => {
      store.control.beforeWrite = null;
      throw lostAnswer();
    };
    const outcome = await store.owner.admitPublication(candidateRow());
    t.equal(outcome.outcome, PUBLICATION_WRITE_OUTCOME.COMMITTED);
    t.equal(store.writes.length, 2);
    t.equal(store.writes[1].options.idempotencyKey,
      store.writes[0].options.idempotencyKey,
      'the re-send is the same entry (one key), never a second insert');
  });

test('a change is a compare-and-set on the revision that sets only the ' +
  'changed columns and the next revision', async (t) => {
  const store = createPublicationStore({rows: [candidateRow()]});
  const outcome = await store.owner.applyPublicationChange(PUBLICATION_ID,
    acknowledge('node-1'));
  t.equal(outcome.outcome, PUBLICATION_WRITE_OUTCOME.COMMITTED);
  const write = store.writes[0];
  t.same(write.whereClause,
    {publication_id: PUBLICATION_ID, publication_revision: 1},
    'guarded by the key and the base revision');
  t.same(write.data, {acknowledged_node_ids: ['node-1'], updated_at: 11,
    publication_revision: 2},
  'only the changed columns, and the next revision as a plain integer');
  t.equal(store.row(PUBLICATION_ID).publication_revision, 2);
  t.same(outcome.row.acknowledged_node_ids, ['node-1']);
  t.equal(outcome.row.publication_revision, 2);
  t.equal(store.reads[0].options.authoritativeReadMode, 'owner_rpc_required',
    'the base is the durable owner\'s strict read');
  t.equal(store.reads[0].options.leaderMode, 'required');
});

test('a change that asks for nothing is UNCHANGED; a refusal is REFUSED ' +
  'with its reason; neither writes', async (t) => {
  const store = createPublicationStore({rows: [candidateRow({
    acknowledged_node_ids: ['node-1']})]});
  const unchanged = await store.owner.applyPublicationChange(PUBLICATION_ID,
    acknowledge('node-1'));
  t.equal(unchanged.outcome, PUBLICATION_WRITE_OUTCOME.UNCHANGED);
  t.same(unchanged.row.acknowledged_node_ids, ['node-1']);
  t.equal(isPublicationWriteSettled(unchanged), true);
  t.equal(isPublicationWriteLanded(unchanged), false);

  const refused = await store.owner.applyPublicationChange(PUBLICATION_ID,
    () => refusePublicationChange('row_is_final'));
  t.equal(refused.outcome, PUBLICATION_WRITE_OUTCOME.REFUSED);
  t.equal(refused.reason, 'row_is_final');
  t.equal(isPublicationWriteObligationRetained(refused), false,
    'the row\'s own refusal is final for this change');
  t.equal(store.writes.length, 0);
});

test('a change that loses the row to another writer is re-applied to the ' +
  'durable row: both changes are kept', async (t) => {
  const store = createPublicationStore({rows: [candidateRow()]});
  store.control.beforeWrite = () => {
    store.control.beforeWrite = null;
    store.changeDurably(PUBLICATION_ID, {acknowledged_node_ids: ['node-2']});
  };
  const outcome = await store.owner.applyPublicationChange(PUBLICATION_ID,
    acknowledge('node-1'));
  t.equal(outcome.outcome, PUBLICATION_WRITE_OUTCOME.COMMITTED);
  t.equal(store.writes[0].affectedRows, 0, 'the stale write affected no row');
  t.same(store.row(PUBLICATION_ID).acknowledged_node_ids,
    ['node-1', 'node-2'], 'the other writer\'s change is not overwritten');
  t.equal(store.row(PUBLICATION_ID).publication_revision, 3,
    'revisions 1, 2, 3: one per landed change');
  t.not(store.writes[1].options.idempotencyKey,
    store.writes[0].options.idempotencyKey,
    'a change of another base is another write');
});

test('a change another writer already applied is ALREADY_APPLIED',
  async (t) => {
    const store = createPublicationStore({rows: [candidateRow()]});
    store.control.beforeWrite = () => {
      store.control.beforeWrite = null;
      store.changeDurably(PUBLICATION_ID,
        {acknowledged_node_ids: ['node-1']});
    };
    const outcome = await store.owner.applyPublicationChange(PUBLICATION_ID,
      acknowledge('node-1'));
    t.equal(outcome.outcome, PUBLICATION_WRITE_OUTCOME.ALREADY_APPLIED);
    t.equal(isPublicationWriteLanded(outcome), true);
    t.equal(store.writes.length, 1);
    t.equal(store.row(PUBLICATION_ID).publication_revision, 2);
  });

test('an unanswered change: found applied it is COMMITTED; found not ' +
  'applied it is re-sent as the same bytes under the same key', async (t) => {
  const applied = createPublicationStore({rows: [candidateRow()]});
  applied.control.afterWrite = () => {
    applied.control.afterWrite = null;
    throw lostAnswer();
  };
  const landed = await applied.owner.applyPublicationChange(PUBLICATION_ID,
    acknowledge('node-1'));
  t.equal(landed.outcome, PUBLICATION_WRITE_OUTCOME.COMMITTED);
  t.equal(applied.writes.length, 1, 'never applied twice');
  t.equal(applied.row(PUBLICATION_ID).publication_revision, 2);

  const unapplied = createPublicationStore({rows: [candidateRow()]});
  unapplied.control.beforeWrite = () => {
    unapplied.control.beforeWrite = null;
    throw lostAnswer();
  };
  const resent = await unapplied.owner.applyPublicationChange(PUBLICATION_ID,
    acknowledge('node-1'));
  t.equal(resent.outcome, PUBLICATION_WRITE_OUTCOME.COMMITTED);
  t.equal(unapplied.writes.length, 2);
  t.equal(unapplied.writes[1].options.idempotencyKey,
    unapplied.writes[0].options.idempotencyKey);
  t.same(unapplied.writes[1].data, unapplied.writes[0].data);
  t.same(unapplied.writes[1].whereClause, unapplied.writes[0].whereClause);
});

test('the durable owner unreadable: REFUSED before any write, UNKNOWN ' +
  'after an unanswered one', async (t) => {
  const store = createPublicationStore({rows: [candidateRow()]});
  store.control.readsUnavailable = true;
  const refused = await store.owner.applyPublicationChange(PUBLICATION_ID,
    acknowledge('node-1'));
  t.equal(refused.outcome, PUBLICATION_WRITE_OUTCOME.REFUSED);
  t.equal(refused.reason,
    PUBLICATION_WRITE_REFUSAL.AUTHORITATIVE_READ_UNAVAILABLE);
  t.equal(isPublicationWriteObligationRetained(refused), true,
    'the writer still owes the change');
  t.equal(store.writes.length, 0, 'no write without a durable base');

  store.control.readsUnavailable = false;
  store.control.afterWrite = () => {
    store.control.readsUnavailable = true;
    throw lostAnswer();
  };
  const unknown = await store.owner.applyPublicationChange(PUBLICATION_ID,
    acknowledge('node-1'));
  t.equal(unknown.outcome, PUBLICATION_WRITE_OUTCOME.UNKNOWN);
  t.equal(unknown.reason,
    PUBLICATION_WRITE_UNKNOWN_REASON.CONFIRMING_READ_UNAVAILABLE);
  t.equal(unknown.writeKey, store.writes[0].options.idempotencyKey);
  t.equal(unknown.publicationId, PUBLICATION_ID);
  t.equal('row' in unknown, false, 'no row is returned as persisted');
});

test('an absent row and an unreadable revision are refused', async (t) => {
  const store = createPublicationStore({rows: [candidateRow({
    publication_revision: null})]});
  const absent = await store.owner.applyPublicationChange('no-such-row',
    acknowledge('node-1'));
  t.equal(absent.reason, PUBLICATION_WRITE_REFUSAL.PUBLICATION_ABSENT);
  const unreadable = await store.owner.applyPublicationChange(PUBLICATION_ID,
    acknowledge('node-1'));
  t.equal(unreadable.outcome, PUBLICATION_WRITE_OUTCOME.REFUSED);
  t.equal(unreadable.reason, PUBLICATION_WRITE_REFUSAL.REVISION_UNREADABLE,
    'a NULL revision is never read as zero');
  t.equal(store.writes.length, 0);
});

test('a row lost to other writers every round ends REFUSED with one ' +
  'wait_bound_spent, never a row returned as persisted', async (t) => {
  const store = createPublicationStore({rows: [candidateRow()]});
  const capture = captureLogger();
  let epoch = 1;
  store.control.beforeWrite = () => {
    epoch += 1;
    store.changeDurably(PUBLICATION_ID, {publication_epoch: epoch});
  };
  const outcome = await store.owner.applyPublicationChange(PUBLICATION_ID,
    acknowledge('node-1'), {logger: capture.logger});
  t.equal(outcome.outcome, PUBLICATION_WRITE_OUTCOME.REFUSED);
  t.equal(outcome.reason, PUBLICATION_WRITE_REFUSAL.CONTENTION_ROUNDS_SPENT);
  t.equal(isPublicationWriteObligationRetained(outcome), true);
  t.equal('row' in outcome, false);
  t.same(store.row(PUBLICATION_ID).acknowledged_node_ids, []);
  const spent = capture.spent();
  t.equal(spent.length, 1);
  t.equal(spent[0].context.wait, 'PUBLICATION_CHANGE_MAX_ROUNDS');
  t.equal(spent[0].context.scope.publicationId, PUBLICATION_ID);
});

test('N interleaved changes leave revisions 1..N+1 with no gap',
  async (t) => {
    const store = createPublicationStore();
    await store.owner.admitPublication(candidateRow({
      required_ack_node_ids: ['a', 'b', 'c', 'd', 'e'],
      published_active_node_ids: ['a', 'b', 'c', 'd', 'e']}));
    const seen = [];
    const update = store.gateway.updateSystemTableRow;
    store.gateway.updateSystemTableRow = async (...args) => {
      const answer = await update(...args);
      if (answer.affectedRows === 1) {
        seen.push(args[2].publication_revision);
      }
      return answer;
    };
    const outcomes = await Promise.all(['a', 'b', 'c', 'd', 'e'].map(
      (nodeId) => store.owner.applyPublicationChange(PUBLICATION_ID,
        acknowledge(nodeId))));
    t.same(outcomes.map((outcome) => outcome.outcome),
      Array(5).fill(PUBLICATION_WRITE_OUTCOME.COMMITTED));
    t.same(seen, [2, 3, 4, 5, 6], 'each landed change is the next integer');
    t.equal(store.row(PUBLICATION_ID).publication_revision, 6);
    t.same(store.row(PUBLICATION_ID).acknowledged_node_ids,
      ['a', 'b', 'c', 'd', 'e']);
  });

// The gateway canonicalizes a publications row through the whole-row
// serializer, which fills a kind, an epoch, a status and empty lists. Until
// 2026-11-11 it did the same to an UPDATE's data and to every predicate, so
// a partial UPDATE of this table would have written those defaults over the
// row (and was in fact refused as a re-home of an empty key).
test('the gateway keeps a partial publication UPDATE and its predicate to ' +
  'the columns the owner named', async (t) => {
  const update = canonicalizeControlPlaneMutation({
    whereClause: {publication_id: PUBLICATION_ID, publication_revision: 1},
    data: {acknowledged_node_ids: ['node-1'], status: 'ack_pending',
      published_at: null, publication_revision: 2},
  }, CONTROL_PLANE_MUTATION_OPERATION.UPDATE, 'control_plane_publications');
  t.same(update.whereClause,
    {publication_id: PUBLICATION_ID, publication_revision: 1},
    'the predicate is the key and the revision, nothing else');
  t.same(update.data, {acknowledged_node_ids: ['node-1'],
    status: 'ACK_PENDING', published_at: null, publication_revision: 2},
  'only the named columns, each canonical; no defaulted column is written');

  const removal = canonicalizeControlPlaneMutation({
    whereClause: {publication_id: PUBLICATION_ID},
  }, CONTROL_PLANE_MUTATION_OPERATION.DELETE, 'control_plane_publications');
  t.same(removal.whereClause, {publication_id: PUBLICATION_ID});
});

test('the gateway refuses an upsert of a publication row', async (t) => {
  const gateway = Object.create(ControlPlaneSystemTableGateway.prototype);
  const error = await t.rejects(gateway.submitMutation({
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
    tableName: 'control_plane_publications',
    row: candidateRow(),
  }));
  t.equal(error.code,
    CONTROL_PLANE_GATEWAY_ERROR_CODE.PUBLICATIONS_UPSERT_FORBIDDEN,
    'no whole-row unconditional write of this table remains');
});
