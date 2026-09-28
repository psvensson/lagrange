import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaStateMachine} from
  '../../src/node/replica-state-machine.js';
import {REPLICA_REGISTERED_ACTIVATION_ERROR_CODE} from
  '../../src/node/replica-state-machine-registered-activation.js';
import {PartitionServiceRowOwner} from
  '../../src/partition/partition-service-row-owner.js';

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function registeredRow(overrides = {}) {
  return {
    service_id: 'p1-r1',
    service_type: 'partition',
    partition_id: 'p1',
    node_id: 'node-a',
    replica_id: 'p1-r1',
    group_id: null,
    raft_role: 'follower',
    status: 'stopped',
    address: 'node-a/partition/p1-r1',
    created_at: 10,
    updated_at: 100,
    ...overrides,
  };
}

function matches(row, whereClause) {
  return Object.entries(whereClause).every(
    ([key, value]) => row?.[key] === value,
  );
}

function createWriter(initialRow, options = {}) {
  let row = {...initialRow};
  const updates = [];
  return {
    updates,
    get row() {
      return {...row};
    },
    async readAuthoritativeRows() {
      return {success: true, rows: row ? [{...row}] : []};
    },
    async updateSystemTableRow(tableName, whereClause, data, writeOptions) {
      updates.push({tableName, whereClause, data, writeOptions});
      if (typeof options.beforeUpdate === 'function') {
        row = options.beforeUpdate({...row});
      }
      if (options.returnWithoutApply) {
        return {
          success: true,
          outcome: 'observed_state_changed',
          partitionResult: {affectedRows: 0},
        };
      }
      const applied = matches(row, whereClause);
      if (applied) row = {...row, ...data};
      if (applied && options.throwAfterApply) {
        throw new Error('acknowledgement lost after durable apply');
      }
      return {
        success: true,
        outcome: applied ? 'applied' : 'observed_state_changed',
        partitionResult: {affectedRows: applied ? 1 : 0},
      };
    },
  };
}

function createStateMachine(now) {
  initializeEnvironment();
  return new ReplicaStateMachine({
    nodeId: 'node-a',
    controlPlaneSystemTableGateway: {},
    now: () => now,
  });
}

function activationOptions(writer) {
  return {
    partitionId: 'p1',
    replicaId: 'p1-r1',
    nodeId: 'node-a',
    systemTableWriter: writer,
    writeOptions: {coalescingKey: 'services:p1-r1'},
  };
}

async function createRegistrationEvidenceFixture(options = {}) {
  let durableRow = null;
  let readCount = 0;
  let updateCount = 0;
  let ownerNow = 100;
  let readsAvailable = options.readsAvailable !== false;
  const writer = {
    async insertSystemTableRow(_tableName, row) {
      durableRow = {...row};
      return {success: true, partitionResult: {affectedRows: 1}};
    },
    async readAuthoritativeRows() {
      readCount += 1;
      if (!readsAvailable) {
        throw new Error('bootstrap owner RPC is unavailable');
      }
      return {success: true, rows: durableRow ? [{...durableRow}] : []};
    },
    async updateSystemTableRow(_tableName, whereClause, data) {
      updateCount += 1;
      const applied = matches(durableRow, whereClause);
      if (applied) durableRow = {...durableRow, ...data};
      return {
        success: true,
        outcome: applied ? 'applied' : 'observed_state_changed',
        partitionResult: {affectedRows: applied ? 1 : 0},
      };
    },
  };
  const stateMachine = createStateMachine(150);
  const owner = new PartitionServiceRowOwner({
    systemTableWriter: writer,
    replicaStateMachine: stateMachine,
    now: () => ownerNow,
  });
  const registrationEvidence = await owner.registerReplica({
    partitionId: 'p1',
    replicaId: 'p1-r1',
    nodeId: 'node-a',
    service: {getRole: () => 'follower'},
    status: 'stopped',
  });
  return {
    owner,
    registrationEvidence,
    stateMachine,
    get durableRow() {
      return durableRow;
    },
    get readCount() {
      return readCount;
    },
    get updateCount() {
      return updateCount;
    },
    setDurableRow(row) {
      durableRow = row ? {...row} : null;
    },
    setReadsAvailable(value) {
      readsAvailable = value;
    },
    setOwnerNow(value) {
      ownerNow = value;
    },
  };
}

test('ReplicaStateMachine registered activation refuses a newer REMOVING generation',
  async (t) => {
    const writer = createWriter(registeredRow(), {
      beforeUpdate: (row) => ({
        ...row,
        status: 'removing',
        state_entered_at: 200,
        updated_at: 200,
      }),
    });
    const stateMachine = createStateMachine(150);

    await t.rejects(
      stateMachine.activateRegisteredReplica(activationOptions(writer)),
      {code: REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.SOURCE_CHANGED},
      'delayed activation must classify a newer lifecycle generation as changed',
    );
    t.same(writer.updates[0].whereClause, {
      service_id: 'p1-r1',
      service_type: 'partition',
      partition_id: 'p1',
      node_id: 'node-a',
      replica_id: 'p1-r1',
      group_id: null,
      status: 'stopped',
      created_at: 10,
      updated_at: 100,
    }, 'activation CAS should carry the observed legacy generation');
    t.equal(writer.row.status, 'removing');
    t.equal(writer.row.state_entered_at, 200,
      'the newer REMOVING generation must remain intact');
  });

test('ReplicaStateMachine replays exact INSERT evidence after clock advance',
  async (t) => {
    const fixture = await createRegistrationEvidenceFixture({
      readsAvailable: false,
    });
    const {owner, registrationEvidence, stateMachine} = fixture;
    t.equal(Object.isFrozen(registrationEvidence), true,
      'INSERT-bound evidence must be immutable');
    await t.rejects(
      owner.activateReplica({
        partitionId: 'p1',
        replicaId: 'p1-r2',
        nodeId: 'node-a',
        registrationEvidence,
      }),
      {code: REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.SOURCE_CHANGED},
      'registration evidence cannot transfer across replica identity',
    );
    t.equal(fixture.updateCount, 0,
      'cross-identity evidence must refuse before mutation');

    const activated = await owner.activateReplica({
      partitionId: 'p1',
      replicaId: 'p1-r1',
      nodeId: 'node-a',
      registrationEvidence,
    });

    t.equal(fixture.readCount, 0,
      'applied INSERT evidence should not require bootstrap owner RPC');
    t.equal(fixture.durableRow.status, 'active');
    t.equal(activated.state_entered_at, 101);
    t.equal(stateMachine.getState('p1-r1')?.durableVersion, 101,
      'the canonical lifecycle owner should bind the applied generation');
    fixture.setReadsAvailable(true);
    fixture.setOwnerNow(10_000);
    const replayed = await owner.activateReplica({
      partitionId: 'p1',
      replicaId: 'p1-r1',
      nodeId: 'node-a',
      registrationEvidence,
    });
    t.equal(replayed.state_entered_at, 101,
      'clock advance cannot mint a second destination for the same evidence');
    t.equal(fixture.readCount, 1,
      'idempotent replay should require authoritative generation observation');
  });

test('ReplicaStateMachine refuses fabricated registration evidence',
  async (t) => {
    const writer = createWriter(registeredRow());
    const stateMachine = createStateMachine(150);

    await t.rejects(
      stateMachine.activateRegisteredReplica({
        ...activationOptions(writer),
        registrationEvidence: Object.freeze(registeredRow()),
      }),
      {code: REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.SOURCE_CHANGED},
      'callers cannot fabricate INSERT-bound activation authority',
    );
    t.equal(writer.updates.length, 0,
      'forged evidence must be refused before mutation execution');
  });

test('ReplicaStateMachine refuses branded evidence after durable generation changes',
  async (t) => {
    const fixture = await createRegistrationEvidenceFixture();
    const {owner, registrationEvidence} = fixture;
    fixture.setDurableRow({
      ...fixture.durableRow,
      status: 'removing',
      state_entered_at: 200,
      updated_at: 200,
    });

    await t.rejects(
      owner.activateReplica({
        partitionId: 'p1',
        replicaId: 'p1-r1',
        nodeId: 'node-a',
        registrationEvidence,
      }),
      {code: REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.SOURCE_CHANGED},
      'branding cannot transfer authority to a newer durable generation',
    );
    t.equal(fixture.durableRow.status, 'removing');
    t.equal(fixture.durableRow.state_entered_at, 200,
      'stale branded evidence must preserve the newer durable generation');
  });

test('ReplicaStateMachine refuses old registration evidence after same-ID ' +
  'recreate', async (t) => {
  const fixture = await createRegistrationEvidenceFixture();
  const {owner, registrationEvidence} = fixture;
  fixture.setDurableRow(null);
  fixture.setOwnerNow(registrationEvidence.updated_at);
  await owner.registerReplica({
    partitionId: 'p1',
    replicaId: 'p1-r1',
    nodeId: 'node-a',
    service: {getRole: () => 'follower'},
    status: 'stopped',
  });
  const recreatedRow = fixture.durableRow;

  await t.rejects(
    owner.activateReplica({
      partitionId: 'p1',
      replicaId: 'p1-r1',
      nodeId: 'node-a',
      registrationEvidence,
    }),
    {code: REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.SOURCE_CHANGED},
    'old branded evidence cannot activate a recreated same-ID generation',
  );
  t.equal(fixture.updateCount, 1,
    'the old generation must be fenced by the exact activation CAS');
  t.same(fixture.durableRow, recreatedRow,
    'the recreated incarnation must remain byte-for-byte unchanged');
  t.equal(fixture.durableRow.created_at > registrationEvidence.created_at,
    true, 'the canonical creation owner must mint a non-reused incarnation');
});

test('ReplicaStateMachine registered activation classifies an exact zero-row nonapply as deferred',
  async (t) => {
    const writer = createWriter(registeredRow(), {returnWithoutApply: true});
    const stateMachine = createStateMachine(150);

    await t.rejects(
      stateMachine.activateRegisteredReplica(activationOptions(writer)),
      {code: REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.DURABILITY_DEFERRED},
      'zero-row with the source generation still present retains retry debt',
    );
    t.equal(writer.row.status, 'stopped',
      'nonapply must not manufacture ACTIVE state');
    t.equal(writer.updates.length, 1, 'the owner should attempt one exact CAS');
  });

test('ReplicaStateMachine registered activation recognizes only its exact lost-ACK generation',
  async (t) => {
    const writer = createWriter(registeredRow({state_entered_at: 100}), {
      throwAfterApply: true,
    });
    const stateMachine = createStateMachine(150);

    const activated = await stateMachine.activateRegisteredReplica(
      activationOptions(writer),
    );

    t.equal(activated.status, 'active');
    t.equal(activated.state_entered_at, 101);
    t.same(writer.updates[0].whereClause, {
      service_id: 'p1-r1',
      service_type: 'partition',
      partition_id: 'p1',
      node_id: 'node-a',
      replica_id: 'p1-r1',
      group_id: null,
      status: 'stopped',
      created_at: 10,
      state_entered_at: 100,
    }, 'current rows should use state_entered_at as the exact source generation');
    t.equal(writer.row.status, 'active');
    t.equal(writer.row.state_entered_at, 101,
      'lost acknowledgement is success only after exact generation observation');
    t.match(stateMachine.getState('p1-r1'), {
      state: 'active',
      durableVersionColumn: 'state_entered_at',
      durableVersion: 101,
    }, 'exact durable activation should install canonical lifecycle state');
    t.notOk(Object.prototype.hasOwnProperty.call(
      writer.updates[0].data,
      'raft_role',
    ), 'lifecycle activation must not rewrite raft-owned fields');
  });

test('exact registered activation replaces tracked CREATING while an ' +
  'unversioned ACTIVE snapshot remains unauthorized', async (t) => {
  const fixture = await createRegistrationEvidenceFixture();
  const {owner, registrationEvidence, stateMachine} = fixture;
  const invalidTransitions = [];
  stateMachine.logger.error = (message, details) => {
    invalidTransitions.push({message, details});
  };
  t.equal(stateMachine.registerReplicaSnapshot('p1-r1', {
    partitionId: 'p1',
    nodeId: 'node-a',
    state: 'creating',
    serviceId: 'p1-r1',
    serviceType: 'partition',
    serviceAddress: 'node-a/partition/p1-r1',
    durableVersionColumn: 'updated_at',
    durableVersion: registrationEvidence.updated_at,
  }), true, 'tracked ordinary lifecycle begins from durable version evidence');
  t.equal(stateMachine.registerReplicaSnapshot('p1-r1', {
    partitionId: 'p1',
    nodeId: 'node-a',
    state: 'active',
    serviceId: 'p1-r1',
  }), false, 'unversioned ACTIVE publication cannot authorize activation');
  t.equal(stateMachine.getState('p1-r1')?.state, 'creating',
    'refused snapshot preserves the tracked ordinary lifecycle');

  const activated = await owner.activateReplica({
    partitionId: 'p1',
    replicaId: 'p1-r1',
    nodeId: 'node-a',
    registrationEvidence,
  });

  t.equal(activated.status, 'active');
  t.match(stateMachine.getState('p1-r1'), {
    state: 'active',
    durableVersion: registrationEvidence.updated_at + 1,
  }, 'exact branded authority installs ACTIVE over stale tracked CREATING');
  t.equal(invalidTransitions.length, 1,
    'exact activation adds no invalid-transition warning');
});
