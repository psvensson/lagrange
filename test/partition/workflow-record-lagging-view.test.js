/**
 * S3: a refused write is decided by the AUTHORITATIVE re-read, never by a
 * local view that lags the owner's own acknowledged write (round-5 verifier
 * H5-A: rereadRecord trusted the view whenever it differed from the witness
 * - a view showing an OLDER record of this owner gave a false "resynced"
 * rebuild, a view showing the record before this owner's claim a false
 * "superseded"). Owner decision 2026-10-05 (option A).
 *
 * The owner's provisioning-mark flip lands but its acknowledgement is lost;
 * at that moment the owner's view lags: it shows (a) this owner's own
 * earlier record (registration), or (b) the record before this owner's
 * claim (another owner's, lapsed). Neither a false rebuild nor a false
 * loss follows: the lost acknowledgement is recognised, the create is sent,
 * the step continues to backfilling, the owner keeps the workflow, no WARN.
 *
 * Real ManagedSplitWorkflow / ManagedMergeWorkflow, production CDC and
 * gateway, real SQLite store (workflow-record-sqlite-world.js).
 */
import {test} from '../../src/test-helpers/tap.js';
import {claimWorkflowOwnershipCore} from
  '../../src/partition/managed-workflow-ownership-core.js';
import {buildWorkflow} from './managed-split-workflow-test-helpers.js';
import {
  FIXTURE_LEFT_PARTITION_ID,
  FIXTURE_RIGHT_PARTITION_ID,
  buildMergeWorkflow,
  createDefaultPartitionInfos,
} from './managed-merge-workflow-test-helpers.js';
import {
  openRecordStore,
  openView,
  parsePartitionTransition,
  readAuthoritativelyFrom,
  recordingLogger,
  turns,
} from './workflow-record-sqlite-world.js';

const SOURCE = 'users-p1';
const DISPATCHED = 'dispatched';

function owner(family, store, name, overrides) {
  const view = openView(store);
  const log = recordingLogger();
  const options = {
    cdcIntegrationService: store.cdcFor(name),
    getTableInfo: () => view.row(),
    listTableInfos: () => view.list(),
    getPartitionInfo: (partitionId) => store.partitionRow(partitionId),
    logger: log.logger,
    groupRetirementScheduler: {setTimeout: () => null, clearTimeout() {}},
    groupRetirementLeaseScheduler: {setTimeout: () => null,
      clearTimeout() {}},
    ...overrides,
  };
  const built = family === 'split' ?
    buildWorkflow({...options, parsePartitionTransition}) :
    buildMergeWorkflow({...options, listTablePartitionRows: () =>
      store.partitionIds().map((id) => store.partitionRow(id))});
  built.workflow.workflowOwnerId = `owner-${name}`;
  readAuthoritativelyFrom(built.workflow, store);
  return {...built, log, view};
}

const FAMILY = {
  split: {
    store: () => openRecordStore({partitions: [{partition_id: SOURCE}]}),
    start: (o) => o.workflow.execute(SOURCE),
    backfilling: 'split_backfilling',
  },
  merge: {
    store: () => openRecordStore({partitions:
      Object.values(createDefaultPartitionInfos()).map((row) => ({...row}))}),
    start: (o) => o.workflow.execute({leftPartitionId: FIXTURE_LEFT_PARTITION_ID,
      rightPartitionId: FIXTURE_RIGHT_PARTITION_ID}),
    backfilling: 'merge_backfilling',
  },
};

// The first applied write of A that makes a target DISPATCHED.
const isFirstFlip = (write) => write.writer === 'A' && write.changes === 1 &&
  /^UPDATE tables/u.test(write.sql) && write.params.some((value) =>
  typeof value === 'string' && value.includes(`":"${DISPATCHED}"`)) &&
  !String(write.params.at(-2) ?? '').includes(`":"${DISPATCHED}"`);

// Seed the record with a lapsed claim of another owner (case b's view).
function seedLapsedForeignClaim(store) {
  store.db.prepare('UPDATE tables SET partition_transition_state = ?, ' +
    'partition_transition_metadata = ? WHERE table_id = ?')
    .run('deferred', JSON.stringify({workflowId: 'wf-previous',
      workflowOwnerId: 'owner-Z', workflowFenceToken: 7,
      workflowLeaseExpiresAt: 1}), store.tableId);
}

for (const family of Object.keys(FAMILY)) {
  for (const lag of ['own-earlier-record', 'record-before-the-claim']) {
    test(`S3 ${family}: a lost acknowledgement while the view shows the ` +
      `${lag}: no false rebuild, no false loss`, async (t) => {
      const store = FAMILY[family].store();
      if (lag === 'record-before-the-claim') {
        seedLapsedForeignClaim(store);
      }
      const clock = {now: 1000};
      const sent = [];
      let lagging = null;
      const a = owner(family, store, 'A', {
        now: () => clock.now,
        provisionInitialTablePartition: async (context) => {
          sent.push([context.partitionId,
            store.metadata().targetProvisioning?.[context.partitionId]]);
          a.view.thaw();
        },
      });
      const before = store.tablesRow();
      // A's registration lands; its view is then frozen at the record it
      // lags with when the flip's acknowledgement is lost.
      store.observers.push((write) => {
        if (write.writer === 'A' && write.changes === 1 && !lagging &&
            /^UPDATE tables/u.test(write.sql)) {
          lagging = lag === 'own-earlier-record' ? store.tablesRow() : before;
        }
      });
      store.loseAckOnce((write) => {
        if (!isFirstFlip(write)) return false;
        a.view.freeze(lagging);
        return true;
      });
      const result = await FAMILY[family].start(a).then((value) => value,
        (error) => ({threw: error.message}));
      await turns(50);
      t.equal(store.lostAcks.length, 0, 'setup: the flip\'s ack was lost');
      t.ok(lagging, 'setup: the view lagged');
      t.equal(result?.success, true, 'the step continued (no false failure)');
      t.ok(sent.length >= 1 && sent.every(([, mark]) => mark === DISPATCHED),
        'every create was sent after its durable flip');
      t.equal(store.tablesRow().partition_transition_state,
        FAMILY[family].backfilling, 'the record reached backfilling');
      t.equal(store.metadata().workflowOwnerId, 'owner-A', 'A holds it');
      t.equal(a.log.lines.filter((line) => line.level === 'warn').length, 0,
        'no WARN: neither a rebuild nor a loss');
    });
  }
}

// S3c the AUTHORITATIVE read itself lags (a table-partition leader change
// before the new leader applied): it shows the record before this owner's
// claim. A refused change is then UNCONFIRMED - nothing decided, nothing
// adopted, no false loss - and the owner's next change lands.
for (const family of Object.keys(FAMILY)) {
  test(`S3c ${family}: a lagging authoritative read is never a false loss`,
    async (t) => {
      const store = FAMILY[family].store();
      seedLapsedForeignClaim(store);
      const before = store.tablesRow();
      const clock = {now: 1000};
      const a = owner(family, store, 'A', {now: () => clock.now,
        provisionInitialTablePartition: async () => {}});
      let lagOnce = false;
      a.workflow.readAuthoritativeWorkflowRecord = async () => {
        if (lagOnce) {
          lagOnce = false;
          return before;
        }
        return store.tablesRow();
      };
      // The first DISPATCHED flip is refused (zero rows: a racing write is
      // modelled by refusing it once) while the authoritative read lags.
      let refused = false;
      const cdc = a.workflow.getCDCIntegrationService();
      const update = cdc.updateSystemTableRow.bind(cdc);
      cdc.updateSystemTableRow = async (tableName, where, data, options) => {
        if (!refused && String(data?.partition_transition_metadata ?? '')
          .includes(`":"${DISPATCHED}"`)) {
          refused = true;
          lagOnce = true;
          return {success: true, affectedRows: 0};
        }
        return update(tableName, where, data, options);
      };
      const result = await FAMILY[family].start(a).then((value) => value,
        (error) => ({threw: error.message}));
      await turns(50);
      t.ok(refused, 'setup: the flip was refused while the read lagged');
      t.ok(result?.threw || result?.success === false,
        'the step failed on the unconfirmed flip (nothing sent)');
      t.equal(a.log.lines.filter((line) => line.level === 'warn' &&
        /another owner holds the record/u.test(line.message)).length, 0,
      'no false loss: the lagging read decided nothing');
      t.equal(store.metadata().workflowOwnerId, 'owner-A',
        'the record still names A');
      const workflowId = store.metadata().workflowId;
      a.workflow.resolveWorkflowState?.(workflowId);
      const renewed = await claimWorkflowOwnershipCore(a.workflow,
        workflowId, {renew: true});
      t.equal(renewed.accepted, true, 'A\'s next change lands');
    });
}
