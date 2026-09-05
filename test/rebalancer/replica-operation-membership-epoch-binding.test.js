/**
 * Membership-epoch NULL rehydration (quest membership-epoch-null-rehydration).
 *
 * A replica_operations row persisted with membership_publication_epoch =
 * SQL NULL (a direct, unbound create) must rehydrate as an UNBOUND operation
 * and dispatch under the existing unbound rule. `Number(null)` is 0, so a
 * local numeric reinterpretation manufactures a false epoch-zero binding
 * and the dispatch fence rejects the operation as "Stale dispatch for
 * published membership epoch 0". The decode now lives in one owner
 * (replica-operation-membership-epoch-binding.js) and every behaviour-
 * changing reader consumes it.
 *
 * Receipts:
 * - E1-null-round-trip: SQL NULL -> unbound (never 0) through the real
 *   repository read path (SQL and cache routes).
 * - E2-epoch-zero-preserved: SQL 0 -> in-memory 0 (zero is not a NULL
 *   sentinel).
 * - E3-positive-epoch-preserved: SQL 2 -> in-memory 2.
 * - E4-unbound-dispatch-follows-unbound-rule: NULL row, current epoch 2,
 *   dispatch proceeds through the real epoch gate without a stale failure.
 * - E5-stale-bound-still-rejected: bound 1 vs current 2 -> stale rejection.
 * - E6-current-bound-accepted: bound 2 vs current 2 -> dispatches with the
 *   epoch carried in the executor request.
 * - E7-malformed-durable-fails-closed: text, negative, fractional, and empty
 *   durable values throw a typed error instead of becoming an epoch.
 * - E8-single-decoder-inventory: every src reader of the field is
 *   classified; behaviour-changing readers import the decode owner and no
 *   src file reinterprets the field numerically.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  REPLICA_OPERATIONS_SCHEMA,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {NUM} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from
  '../../src/partition/partition-service.js';
import {
  REBALANCE_COORDINATOR_SHARED,
} from '../../src/rebalancer/rebalance-coordinator-shared.js';
import {ReplicaOperationField} from
  '../../src/rebalancer/replica-operation-constants.js';
import {
  INVALID_MEMBERSHIP_PUBLICATION_EPOCH_BINDING,
  MEMBERSHIP_PUBLICATION_EPOCH_BINDING_STATE,
  decodeMembershipPublicationEpochBinding,
} from '../../src/rebalancer/replica-operation-membership-epoch-binding.js';
import {createMockCache} from './test-helpers.js';
import {
  TEST_NODE_ID,
  TEST_TARGET_NODE_ID,
  buildEpochBoundAddMove,
  createEpochCoordinator,
  grantEpochCoordinatorStorageAdmission,
  wireEpochDispatchProbe,
} from './epoch-fence-test-harness.js';

const {SQL} = REBALANCE_COORDINATOR_SHARED;
const {BOUND, UNBOUND, INVALID} = MEMBERSHIP_PUBLICATION_EPOCH_BINDING_STATE;
const EPOCH_FIELD = ReplicaOperationField.MEMBERSHIP_PUBLICATION_EPOCH;

const CURRENT_EPOCH_ZERO = 0;
const CURRENT_EPOCH_ONE = 1;
const CURRENT_EPOCH_TWO = 2;
const TEMP_DIR_PREFIX = 'membership-epoch-null-rehydration-';
const DURABLE_DB_FILE = 'replica-operations.db';
const DURABLE_PARTITION_ID = 'replica_operations-p1';
const DURABLE_REPLICA_ID = 'replica_operations-p1-r1';
const SELECT_DURABLE_ROW_SQL =
  'SELECT * FROM replica_operations WHERE operation_id = ?';
const STALE_DISPATCH_PATTERN =
  /Stale dispatch for published membership epoch 1; current epoch is 2/;
const STALE_DISPATCH_ANY_PATTERN = /Stale dispatch for published membership/;
const MALFORMED_STATUS = 'pending';
const MALFORMED_WORKFLOW_STEP = 'PENDING';
const MALFORMED_TYPE = 'ADD';
const MALFORMED_ENTITY_TYPE = 'partition';
const EMPTY_STEPS_HISTORY = '[]';
const NUMERIC_TEXT_TWO = '2';

const SRC_ROOT = path.resolve(process.cwd(), 'src');
const DECODER_MODULE =
  'src/rebalancer/replica-operation-membership-epoch-binding.js';
const DECODER_IMPORT_PATTERN =
  /from '\.\/replica-operation-membership-epoch-binding\.js'/;
const FIELD_TOKEN_PATTERN =
  /membershipPublicationEpoch|membership_publication_epoch|MEMBERSHIP_PUBLICATION_EPOCH/;
const NUMERIC_REINTERPRETATION_PATTERN =
  /\b(?:Number|parseInt|parseFloat|Math\.\w+)\(\s*[^;]*?(?:membershipPublicationEpoch|membership_publication_epoch|MEMBERSHIP_PUBLICATION_EPOCH)/;
const LOCAL_DOMAIN_PREDICATE_PATTERN =
  /Number\.isInteger\(\s*[^;]*?(?:membershipPublicationEpoch|membership_publication_epoch|MEMBERSHIP_PUBLICATION_EPOCH)/;
const ZERO_SENTINEL_PATTERN =
  /(?:membershipPublicationEpoch|membership_publication_epoch|MEMBERSHIP_PUBLICATION_EPOCH)[^\n;]*(?:\?\?|\|\|)\s*0\b/;
const BLOCK_COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT_PATTERN = /\/\/[^\n]*/g;

// Behaviour-changing readers of the operation's membership-epoch binding:
// each must consume the single decode owner.
const DECODE_CONSUMERS = Object.freeze([
  'src/rebalancer/replica-operation-repository-row-methods.js',
  'src/rebalancer/operation-workflow-dispatch-epoch-gate.js',
  'src/rebalancer/rebalance-coordinator-owner-delegation-methods.js',
  'src/rebalancer/replica-status.js',
  'src/rebalancer/unified-rebalancer-move-execution.js',
  'src/rebalancer/operation-workflow-dispatch-response-reconcile.js',
  'src/rebalancer/unified-rebalancer-rebalance-loop.js',
]);
// Encode, SQL-text, schema, and pass-through sites: they mention the field
// but never interpret its value.
const ENCODE_OR_SCHEMA_PASSTHROUGH = Object.freeze([
  'src/rebalancer/replica-operation-constants.js',
  'src/rebalancer/replica-operation-repository.js',
  'src/rebalancer/rebalance-coordinator-shared.js',
  'src/rebalancer/replica-operation-repository-mutation-row-methods.js',
  'src/rebalancer/replica-operation-repository-mutation-persistence-methods.js',
  'src/rebalancer/rebalance-coordinator-operation-creation.js',
  'src/bootstrap/system-table-runtime-schema-definitions.js',
  'src/partition/partition-service-constants.js',
  'src/partition/partition-service-entry-apply-base.js',
]);

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: TEST_NODE_ID},
    rebalancer: {
      minimumReplicaBytes: NUM.TEN,
      partitionReplicaOverheadBytes: NUM.FIVE,
    },
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

/**
 * A SQL engine over the real SQLite replica_operations partition so the
 * repository's INSERT encodes SQL NULL and its SELECT rehydrates a real
 * NULL, not a JavaScript stand-in. Reads against other system tables
 * (services, nodes) answer empty, as the in-memory harness engine does.
 */
function createSqliteQueryEngine(db) {
  return {
    async executeQuery(sql, params = []) {
      if (!sql.includes(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS)) {
        return {success: true, rows: [], changes: 0};
      }
      const statement = db.prepare(sql);
      if (statement.reader) {
        return {success: true, rows: statement.all(...params), changes: 0};
      }
      const info = statement.run(...params);
      return {success: true, rows: [], changes: info.changes};
    },
  };
}

let sharedDurable = null;

async function openSharedDurableReplicaOperations() {
  if (sharedDurable) {
    return sharedDurable;
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_DIR_PREFIX));
  const partition = new PartitionService({
    partitionId: DURABLE_PARTITION_ID,
    tableId: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    schema: REPLICA_OPERATIONS_SCHEMA,
    replicaId: DURABLE_REPLICA_ID,
    nodeId: TEST_NODE_ID,
    dbPath: path.join(tempDir, DURABLE_DB_FILE),
  });
  await partition.initialize();
  sharedDurable = {
    partition,
    tempDir,
    db: partition.db,
    sqlQueryEngine: createSqliteQueryEngine(partition.db),
  };
  return sharedDurable;
}

function readDurableRow(db, operationId) {
  return db.prepare(SELECT_DURABLE_ROW_SQL).get(operationId);
}

async function createDurableCoordinator(currentEpoch) {
  const durable = await openSharedDurableReplicaOperations();
  const handles = createEpochCoordinator({
    currentEpoch,
    sqlQueryEngine: durable.sqlQueryEngine,
  });
  grantEpochCoordinatorStorageAdmission(handles.coordinator);
  return {...handles, durable};
}

function buildAddMove(partitionId, epoch) {
  return buildEpochBoundAddMove(epoch, {partitionId, entityId: partitionId});
}

function insertMalformedDurableRow(db, operationId, partitionId, rawEpoch) {
  const now = Date.now();
  db.prepare(SQL.INSERT_OPERATION).run(
    operationId,
    MALFORMED_TYPE,
    partitionId,
    `${partitionId}-r1`,
    null,
    TEST_NODE_ID,
    TEST_TARGET_NODE_ID,
    MALFORMED_STATUS,
    MALFORMED_WORKFLOW_STEP,
    now,
    now,
    null,
    null,
    EMPTY_STEPS_HISTORY,
    MALFORMED_ENTITY_TYPE,
    partitionId,
    rawEpoch,
  );
}

async function expectInvalidBindingRejection(t, readOperation, label) {
  try {
    await readOperation();
    t.fail(`${label}: a malformed durable epoch must not rehydrate`);
  } catch (error) {
    t.equal(
      error?.code,
      INVALID_MEMBERSHIP_PUBLICATION_EPOCH_BINDING,
      `${label}: rehydration fails closed with the typed binding error`,
    );
  }
}

// --- E1-null-round-trip ---

test('E1-null-round-trip: a durable SQL NULL epoch rehydrates as unbound, ' +
  'never as epoch 0, through the SQL and cache read routes',
async (t) => {
  initializeEnvironment();
  const {coordinator, durable} =
    await createDurableCoordinator(CURRENT_EPOCH_TWO);
  try {
    const created = await coordinator.createOperation(
      buildAddMove('p-null-e1', undefined),
    );
    const durableRow = readDurableRow(durable.db, created.operationId);
    t.equal(
      durableRow.membership_publication_epoch,
      null,
      'the unbound create persists membership_publication_epoch as SQL NULL',
    );

    const rehydrated =
      await coordinator.repository.queryOperationById(created.operationId);
    t.ok(rehydrated, 'the SQL route rehydrates the operation');
    t.equal(
      rehydrated[EPOCH_FIELD],
      undefined,
      'SQL NULL rehydrates with no bound epoch (field absent)',
    );
    t.ok(
      rehydrated[EPOCH_FIELD] !== 0,
      'SQL NULL never rehydrates as epoch 0',
    );
    t.equal(
      decodeMembershipPublicationEpochBinding(rehydrated[EPOCH_FIELD]).state,
      UNBOUND,
      'the canonical decode of the rehydrated field is UNBOUND',
    );

    // Cache route: the same row observed through the system-table cache
    // (as CDC delivers it, JSON round-trip preserves null).
    const cacheRow = JSON.parse(JSON.stringify(durableRow));
    const cached = createEpochCoordinator({
      currentEpoch: CURRENT_EPOCH_TWO,
      systemTableCache: createMockCache({replicaOperations: [cacheRow]}),
    });
    try {
      const fromCache = await cached.coordinator.repository.queryOperationById(
        created.operationId,
      );
      t.ok(fromCache, 'the cache route rehydrates the operation');
      t.equal(
        fromCache[EPOCH_FIELD],
        undefined,
        'the cache route rehydrates NULL as unbound too',
      );
    } finally {
      await cached.coordinator.shutdown();
    }
  } finally {
    await coordinator.shutdown();
  }
});

// --- E2-epoch-zero-preserved ---

test('E2-epoch-zero-preserved: a durable epoch 0 rehydrates as bound epoch ' +
  '0, not as an unbound sentinel',
async (t) => {
  initializeEnvironment();
  const {coordinator, durable} =
    await createDurableCoordinator(CURRENT_EPOCH_ZERO);
  try {
    const created = await coordinator.createOperation(
      buildAddMove('p-zero-e2', CURRENT_EPOCH_ZERO),
    );
    t.equal(
      readDurableRow(durable.db, created.operationId)
        .membership_publication_epoch,
      CURRENT_EPOCH_ZERO,
      'the bound-zero create persists integer 0',
    );
    const rehydrated =
      await coordinator.repository.queryOperationById(created.operationId);
    t.equal(rehydrated[EPOCH_FIELD], CURRENT_EPOCH_ZERO,
      'SQL 0 rehydrates as in-memory 0');
    t.same(
      decodeMembershipPublicationEpochBinding(rehydrated[EPOCH_FIELD]),
      {state: BOUND, epoch: CURRENT_EPOCH_ZERO},
      'the canonical decode is BOUND 0',
    );
  } finally {
    await coordinator.shutdown();
  }
});

// --- E3-positive-epoch-preserved ---

test('E3-positive-epoch-preserved: a durable epoch 2 rehydrates as bound ' +
  'epoch 2',
async (t) => {
  initializeEnvironment();
  const {coordinator, durable} =
    await createDurableCoordinator(CURRENT_EPOCH_TWO);
  try {
    const created = await coordinator.createOperation(
      buildAddMove('p-two-e3', CURRENT_EPOCH_TWO),
    );
    t.equal(
      readDurableRow(durable.db, created.operationId)
        .membership_publication_epoch,
      CURRENT_EPOCH_TWO,
      'the bound create persists integer 2',
    );
    const rehydrated =
      await coordinator.repository.queryOperationById(created.operationId);
    t.equal(rehydrated[EPOCH_FIELD], CURRENT_EPOCH_TWO,
      'SQL 2 rehydrates as in-memory 2');
  } finally {
    await coordinator.shutdown();
  }
});

// --- E4-unbound-dispatch-follows-unbound-rule ---

test('E4-unbound-dispatch-follows-unbound-rule: a rehydrated NULL-epoch ADD ' +
  'dispatches under the unbound rule when the current epoch is 2',
async (t) => {
  initializeEnvironment();
  const {coordinator} = await createDurableCoordinator(CURRENT_EPOCH_TWO);
  try {
    const created = await coordinator.createOperation(
      buildAddMove('p-null-e4', undefined),
    );
    const rehydrated =
      await coordinator.repository.queryOperationById(created.operationId);
    const {deliveredRequests, failedOperations, dispatch} =
      wireEpochDispatchProbe(coordinator);

    await dispatch(rehydrated);

    t.equal(
      failedOperations.length,
      0,
      'the unbound operation is not failed as a stale epoch-0 dispatch',
    );
    t.notOk(
      failedOperations.some((failure) =>
        STALE_DISPATCH_ANY_PATTERN.test(String(failure.message))),
      'no stale-dispatch failure is recorded for an unbound operation',
    );
    t.equal(
      deliveredRequests.length,
      1,
      'the unbound ADD reaches the executor (existing unbound rule)',
    );
    t.equal(
      deliveredRequests[0]?.[EPOCH_FIELD],
      undefined,
      'the executor request carries no fabricated epoch',
    );
  } finally {
    await coordinator.shutdown();
  }
});

// --- E5-stale-bound-still-rejected ---

test('E5-stale-bound-still-rejected: a rehydrated epoch-1 ADD is rejected ' +
  'as stale when the current epoch is 2',
async (t) => {
  initializeEnvironment();
  const {coordinator, setCurrentEpoch} =
    await createDurableCoordinator(CURRENT_EPOCH_ONE);
  try {
    const created = await coordinator.createOperation(
      buildAddMove('p-stale-e5', CURRENT_EPOCH_ONE),
    );
    const rehydrated =
      await coordinator.repository.queryOperationById(created.operationId);
    t.equal(rehydrated[EPOCH_FIELD], CURRENT_EPOCH_ONE,
      'the bound epoch rehydrates as 1');
    setCurrentEpoch(CURRENT_EPOCH_TWO);
    const {deliveredRequests, failedOperations, dispatch} =
      wireEpochDispatchProbe(coordinator);

    const result = await dispatch(rehydrated);

    t.equal(result?.success, false, 'the stale bound ADD does not dispatch');
    t.equal(deliveredRequests.length, 0,
      'the executor never receives the stale request');
    t.equal(failedOperations.length, 1, 'the stale operation is failed closed');
    t.match(
      String(failedOperations[0]?.message),
      STALE_DISPATCH_PATTERN,
      'the failure names the real bound epoch and the current epoch',
    );
  } finally {
    await coordinator.shutdown();
  }
});

// --- E6-current-bound-accepted ---

test('E6-current-bound-accepted: a rehydrated epoch-2 ADD dispatches when ' +
  'the current epoch is 2 and carries its epoch to the executor',
async (t) => {
  initializeEnvironment();
  const {coordinator} = await createDurableCoordinator(CURRENT_EPOCH_TWO);
  try {
    const created = await coordinator.createOperation(
      buildAddMove('p-current-e6', CURRENT_EPOCH_TWO),
    );
    const rehydrated =
      await coordinator.repository.queryOperationById(created.operationId);
    const {deliveredRequests, failedOperations, dispatch} =
      wireEpochDispatchProbe(coordinator);

    await dispatch(rehydrated);

    t.equal(failedOperations.length, 0, 'a current bound ADD is not failed');
    t.equal(deliveredRequests.length, 1, 'a current bound ADD dispatches');
    t.equal(
      deliveredRequests[0]?.[EPOCH_FIELD],
      CURRENT_EPOCH_TWO,
      'the executor request carries the bound epoch 2',
    );
  } finally {
    await coordinator.shutdown();
  }
});

// --- E7-malformed-durable-fails-closed ---

test('E7-malformed-durable-fails-closed: malformed durable epoch values ' +
  'throw a typed error instead of becoming a legitimate epoch',
async (t) => {
  initializeEnvironment();
  const {coordinator, durable} =
    await createDurableCoordinator(CURRENT_EPOCH_TWO);
  try {
    const malformedDurableValues = [
      {label: 'text', operationId: 'op-malformed-text', raw: 'abc'},
      {label: 'negative', operationId: 'op-malformed-negative', raw: -1},
      {label: 'fractional', operationId: 'op-malformed-fraction', raw: 1.5},
      {label: 'empty text', operationId: 'op-malformed-empty', raw: ''},
    ];
    for (const {label, operationId, raw} of malformedDurableValues) {
      insertMalformedDurableRow(
        durable.db,
        operationId,
        `p-malformed-${operationId}`,
        raw,
      );
      await expectInvalidBindingRejection(
        t,
        () => coordinator.repository.queryOperationById(operationId),
        `durable ${label}`,
      );
    }

    // SQLite INTEGER affinity converts well-formed numeric text on write;
    // the storage engine, not the decoder, sanctions that representation.
    insertMalformedDurableRow(
      durable.db,
      'op-numeric-text',
      'p-numeric-text',
      NUMERIC_TEXT_TWO,
    );
    t.equal(
      readDurableRow(durable.db, 'op-numeric-text')
        .membership_publication_epoch,
      CURRENT_EPOCH_TWO,
      'numeric text is stored as integer 2 by SQLite column affinity',
    );

    // A cache row that bypassed SQLite affinity (string epoch) fails closed.
    const cached = createEpochCoordinator({
      currentEpoch: CURRENT_EPOCH_TWO,
      systemTableCache: createMockCache({
        replicaOperations: [{
          ...readDurableRow(durable.db, 'op-numeric-text'),
          membership_publication_epoch: NUMERIC_TEXT_TWO,
        }],
      }),
    });
    try {
      await expectInvalidBindingRejection(
        t,
        () => cached.coordinator.repository.queryOperationById(
          'op-numeric-text',
        ),
        'cache string epoch',
      );
    } finally {
      await cached.coordinator.shutdown();
    }

    const decodeTable = [
      {raw: undefined, state: UNBOUND},
      {raw: null, state: UNBOUND},
      {raw: 0, state: BOUND},
      {raw: 2, state: BOUND},
      {raw: '', state: INVALID},
      {raw: '0', state: INVALID},
      {raw: '2', state: INVALID},
      {raw: Number.NaN, state: INVALID},
      {raw: Number.POSITIVE_INFINITY, state: INVALID},
      {raw: -1, state: INVALID},
      {raw: 1.5, state: INVALID},
      {raw: true, state: INVALID},
      {raw: {}, state: INVALID},
      {raw: [2], state: INVALID},
      {raw: Object(2), state: INVALID},
      {raw: 2n, state: INVALID},
    ];
    for (const {raw, state} of decodeTable) {
      t.equal(
        decodeMembershipPublicationEpochBinding(raw).state,
        state,
        `decode(${typeof raw}:${String(raw)}) is ${state}`,
      );
    }
  } finally {
    await coordinator.shutdown();
  }
});

// --- E8-single-decoder-inventory ---

function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(source) {
  return source
    .replace(BLOCK_COMMENT_PATTERN, '')
    .replace(LINE_COMMENT_PATTERN, '');
}

test('E8-single-decoder-inventory: every src reader of the membership epoch ' +
  'is classified and behaviour-changing readers consume the one decoder',
async (t) => {
  const consumers = new Set(DECODE_CONSUMERS);
  const passthrough = new Set(ENCODE_OR_SCHEMA_PASSTHROUGH);
  const seen = new Set();
  let reinterpretations = 0;
  for (const file of listJsFiles(SRC_ROOT)) {
    const relative = path.relative(process.cwd(), file);
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    if (!FIELD_TOKEN_PATTERN.test(source)) {
      continue;
    }
    seen.add(relative);
    if (relative === DECODER_MODULE) {
      continue;
    }
    const numeric = NUMERIC_REINTERPRETATION_PATTERN.test(source) ||
      LOCAL_DOMAIN_PREDICATE_PATTERN.test(source) ||
      ZERO_SENTINEL_PATTERN.test(source);
    if (numeric) {
      reinterpretations += 1;
    }
    t.notOk(numeric, `${relative}: no local numeric reinterpretation of the field`);
    if (consumers.has(relative)) {
      t.ok(
        DECODER_IMPORT_PATTERN.test(source),
        `${relative}: behaviour-changing reader imports the decode owner`,
      );
      continue;
    }
    t.ok(
      passthrough.has(relative),
      `${relative}: an unclassified reader of the membership epoch appeared; ` +
        'route it through the decode owner or classify it as passthrough',
    );
  }
  for (const consumer of DECODE_CONSUMERS) {
    t.ok(seen.has(consumer), `${consumer}: still reads the field (vacuity)`);
  }
  t.ok(seen.has(DECODER_MODULE), 'the decode owner exists (vacuity)');
  t.equal(reinterpretations, 0, 'zero local Number(...) reinterpretations');
  t.equal(
    DECODE_CONSUMERS.length,
    consumers.size,
    `${consumers.size} behaviour-changing readers, one canonical decode`,
  );
});

test('shutdown: release the shared durable replica_operations partition',
  async () => {
    if (!sharedDurable) {
      return;
    }
    const {partition, tempDir} = sharedDurable;
    sharedDurable = null;
    try {
      await partition.shutdown();
    } finally {
      fs.rmSync(tempDir, {recursive: true, force: true});
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });
