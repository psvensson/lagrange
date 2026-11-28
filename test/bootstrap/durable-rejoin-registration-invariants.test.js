// Durable-rejoin storage and registration invariants: a partition replica's
// storage state reads ABSENT, PRESENT or a typed filesystem error; a replica
// state machine's owner incarnation is sealed; a node registration row uses
// only NODES schema columns. Split by subject out of
// durable-rejoin-incarnation-advance.test.js.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LOCAL_MACHINE_HOST_ID} from '../test-helpers/declared-node-host.js';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  buildNodeRegistrationRow,
} from '../../src/bootstrap/shared/node-registration-owner-row-builder.js';
import {getSchemaByTableName} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  PARTITION_REPLICA_STORAGE_STATE,
  getPartitionDbPath,
  readPartitionReplicaStorageState,
} from '../../src/storage/data-directory-manager.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {TABLES} from '../../src/constants/index.js';
import {
  NODE_ADDRESS, NODE_ID, NOW, THIS_BOOT,
} from './durable-rejoin-incarnation-fixture.js';

test('M4.3: readPartitionReplicaStorageState, T3 ownerIncarnation seal, and ' +
  'T5 NODES row schema subset', async (t) => {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'lagrange-storage-state-'));
  t.teardown(() => fs.rmSync(tmpDir, {recursive: true, force: true}));

  t.equal(
    readPartitionReplicaStorageState(tmpDir, 'p1', 'rep-missing'),
    PARTITION_REPLICA_STORAGE_STATE.ABSENT,
    'ENOENT classifies as ABSENT',
  );
  const dbPath = getPartitionDbPath(tmpDir, 'p1', 'rep-present');
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  fs.writeFileSync(dbPath, '');
  t.equal(
    readPartitionReplicaStorageState(tmpDir, 'p1', 'rep-present'),
    PARTITION_REPLICA_STORAGE_STATE.PRESENT,
    'existing replica db classifies as PRESENT',
  );
  const blockerFile = path.join(tmpDir, 'partitions', 'p-not-dir');
  fs.mkdirSync(path.dirname(blockerFile), {recursive: true});
  fs.writeFileSync(blockerFile, 'not-a-directory');
  t.throws(
    () => readPartitionReplicaStorageState(tmpDir, 'p-not-dir', 'rep-err'),
    {code: 'ENOTDIR'},
    'non-ENOENT filesystem failure rethrows instead of collapsing to ABSENT',
  );

  // T3: ReplicaStateMachine.ownerIncarnation is non-configurable and read-only.
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  t.teardown(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  const rsm = new ReplicaStateMachine({
    nodeId: NODE_ID,
    ownerIncarnation: THIS_BOOT,
    cdcIntegrationService: {},
  });
  const desc = Object.getOwnPropertyDescriptor(rsm, 'ownerIncarnation');
  t.equal(desc?.value, THIS_BOOT);
  t.equal(desc?.writable, false);
  t.equal(desc?.configurable, false);
  t.throws(() => Object.defineProperty(rsm, 'ownerIncarnation', {value: 99}),
    TypeError);
  t.throws(() => {
    rsm.ownerIncarnation = 99;
  }, TypeError);

  // T5: buildNodeRegistrationRow keys are a strict subset of NODES schema.
  const schemaColumns = new Set(
    getSchemaByTableName(TABLES.NODES).columns.map((column) => column.name),
  );
  const rowKeys = Object.keys(buildNodeRegistrationRow({
    nodeId: NODE_ID,
    nodeAddress: NODE_ADDRESS,
    hostId: LOCAL_MACHINE_HOST_ID,
    nodeCapabilities: [],
    bootIncarnation: THIS_BOOT,
    now: NOW,
  }));
  t.same(
    rowKeys.filter((key) => !schemaColumns.has(key)),
    [],
    'every buildNodeRegistrationRow column belongs to the NODES schema',
  );
  t.equal(rowKeys.includes('storage_incarnation'), false);
});
