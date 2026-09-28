import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ReplicaState,
  ReplicaStateMachine,
} from '../../src/node/replica-state-machine.js';

const NODE_ID = 'test-node';
const SERVICES = 'services';
const PARTITIONS = 'partitions';

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function serviceRow(replicaId, status, version) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    group_id: null,
    service_type: 'partition',
    partition_id: 'partition-1',
    node_id: NODE_ID,
    address: `${NODE_ID}/partition/${replicaId}`,
    status,
    created_at: 10,
    state_entered_at: version,
    updated_at: version,
  };
}

function mutationMatches(row, whereClause) {
  return Boolean(row) && Object.entries(whereClause).every(
    ([field, value]) => row[field] === value,
  );
}

function mutationResult(applied) {
  return {
    success: true,
    outcome: applied ? 'applied' : 'observed_state_changed',
    partitionResult: {affectedRows: applied ? 1 : 0},
  };
}

function createOwnerFixture(
  sourceRow,
  servicesOutcome = 'applied',
  options = {},
) {
  const rows = {
    [SERVICES]: new Map([[sourceRow.service_id, {...sourceRow}]]),
    [PARTITIONS]: new Map([[
      sourceRow.partition_id,
      {
        partition_id: sourceRow.partition_id,
        leader_node_id: sourceRow.node_id,
        updated_at: sourceRow.updated_at,
      },
    ]]),
  };
  const mutations = [];
  const gateway = {
    async readAuthoritativeRows(tableName, _sql, params) {
      const row = rows[tableName]?.get(params[0]) || null;
      return {success: true, rows: row ? [{...row}] : []};
    },
    async submitMutation(mutation) {
      mutations.push(structuredClone(mutation));
      if (mutation.tableName === SERVICES &&
          typeof options.beforeServicesMutation === 'function') {
        options.beforeServicesMutation(rows[SERVICES], mutation);
      }
      const key = mutation.tableName === SERVICES ?
        mutation.whereClause.service_id :
        mutation.whereClause.partition_id;
      const row = rows[mutation.tableName]?.get(key) || null;
      if (mutation.tableName === SERVICES && servicesOutcome === 'zero') {
        return mutationResult(false);
      }
      const applied = mutationMatches(row, mutation.whereClause);
      if (applied) {
        rows[mutation.tableName].set(key, {...row, ...mutation.data});
      }
      if (applied && mutation.tableName === SERVICES &&
          typeof options.afterServicesMutation === 'function') {
        options.afterServicesMutation(rows[SERVICES], mutation);
      }
      if (applied && mutation.tableName === SERVICES &&
          servicesOutcome === 'lost') {
        throw new Error('acknowledgement lost after durable apply');
      }
      return mutationResult(applied);
    },
  };
  const stateMachine = new ReplicaStateMachine({
    nodeId: NODE_ID,
    controlPlaneSystemTableGateway: gateway,
    now: () => 999,
  });
  return {mutations, rows, stateMachine};
}

test('authoritative lifecycle CAS cannot mutate a same-key replacement with ' +
  'coincident status and version', async (t) => {
  initializeEnvironment();
  const source = serviceRow(
    'replica-authority-identity-swap',
    ReplicaState.ACTIVE,
    100,
  );
  const replacement = {
    ...source,
    partition_id: 'partition-new',
    node_id: 'node-b',
    replica_id: 'replacement-replica',
    group_id: 'replacement-group',
    created_at: 20,
    address: 'node-b/partition/replacement-replica',
  };
  let swapped = false;
  const {mutations, rows, stateMachine} = createOwnerFixture(
    source,
    'applied',
    {
      beforeServicesMutation(serviceRows) {
        if (swapped) return;
        swapped = true;
        serviceRows.set(source.service_id, {...replacement});
      },
    },
  );

  t.equal(await stateMachine.transitionAuthoritativeReplicaGeneration(
    source,
    ReplicaState.FAILED,
    {timestamp: 200, reason: 'failure-detector-observation'},
  ), false, 'same key/status/version cannot transfer lifecycle authority');
  const lifecycleMutation = mutations.find(
    (mutation) => mutation.tableName === SERVICES,
  );
  t.same(lifecycleMutation.whereClause, {
    service_id: source.service_id,
    service_type: 'partition',
    partition_id: 'partition-1',
    node_id: NODE_ID,
    replica_id: source.replica_id,
    group_id: null,
    created_at: 10,
    status: ReplicaState.ACTIVE,
    state_entered_at: 100,
  }, 'generic lifecycle CAS carries the complete admitted row identity');
  t.same(rows[SERVICES].get(source.service_id), replacement,
    'durable replacement remains byte-for-byte untouched');
  t.equal(stateMachine.getState(source.service_id)?.state,
    ReplicaState.ACTIVE,
    'local lifecycle never commits FAILED for the replacement key');
});

test('authoritative lifecycle CAS independently fences replica and group ' +
  'identity replacement', async (t) => {
  initializeEnvironment();
  const identityMutants = [
    ['replica_id', 'replacement-replica'],
    ['group_id', 'replacement-group'],
  ];
  for (const [identityField, replacementValue] of identityMutants) {
    const source = serviceRow(
      `replica-authority-${identityField}`,
      ReplicaState.ACTIVE,
      100,
    );
    const replacement = {...source, [identityField]: replacementValue};
    const {rows, stateMachine} = createOwnerFixture(source, 'applied', {
      beforeServicesMutation(serviceRows) {
        serviceRows.set(source.service_id, {...replacement});
      },
    });

    t.equal(await stateMachine.transitionAuthoritativeReplicaGeneration(
      source,
      ReplicaState.FAILED,
      {timestamp: 200, reason: 'identity-replacement-mutant'},
    ), false, `${identityField} replacement cannot borrow lifecycle authority`);
    t.same(rows[SERVICES].get(source.service_id), replacement,
      `${identityField} replacement remains untouched`);
    t.equal(stateMachine.getState(source.service_id)?.state,
      ReplicaState.ACTIVE,
      `${identityField} replacement cannot commit local FAILED state`);
  }
});

test('authoritative lifecycle intent revalidates source generation before CAS',
  async (t) => {
    initializeEnvironment();
    const durable = serviceRow(
      'replica-authority-revalidation',
      ReplicaState.ACTIVE,
      200,
    );
    const staleEvidence = {...durable, state_entered_at: 100, updated_at: 100};
    const {mutations, rows, stateMachine} = createOwnerFixture(durable);

    t.equal(await stateMachine.transitionAuthoritativeReplicaGeneration(
      staleEvidence,
      ReplicaState.FAILED,
      {timestamp: 300, reason: 'failure-detector-observation'},
    ), false, 'stale observer evidence is refused by a fresh owner read');
    t.equal(mutations.filter((mutation) =>
      mutation.tableName === SERVICES).length, 0,
    'no lifecycle CAS executes after source-generation revalidation fails');
    t.equal(rows[SERVICES].get(durable.service_id)?.status,
      ReplicaState.ACTIVE, 'the newer authoritative generation is untouched');
  });

test('authoritative lifecycle intent observes exact lost outcome', async (t) => {
  initializeEnvironment();
  const source = serviceRow(
    'replica-authority-lost-outcome',
    ReplicaState.ACTIVE,
    100,
  );
  const {rows, stateMachine} = createOwnerFixture(source, 'lost');

  t.equal(await stateMachine.transitionAuthoritativeReplicaGeneration(
    source,
    ReplicaState.FAILED,
    {timestamp: 200, reason: 'failure-detector-observation'},
  ), true, 'lost acknowledgement resolves only from the exact FAILED row');
  t.match(rows[SERVICES].get(source.service_id), {
    status: ReplicaState.FAILED,
    previous_state: ReplicaState.ACTIVE,
    state_entered_at: 200,
    updated_at: 200,
  }, 'the canonical owner mints and observes the destination generation');
  t.equal(stateMachine.getState(source.service_id)?.durableVersion, 200,
    'observed durable destination becomes local lifecycle authority');
});

test('lost lifecycle acknowledgement cannot authorize a newer same-key ' +
  'generation or cross-replica identity', async (t) => {
  initializeEnvironment();
  const replacements = [
    {
      name: 'newer lifecycle generation',
      build(source) {
        return {
          ...source,
          status: ReplicaState.ACTIVE,
          state_entered_at: 300,
          updated_at: 300,
        };
      },
    },
    {
      name: 'cross-replica identity',
      build(source) {
        return {
          ...source,
          replica_id: 'replacement-replica',
          group_id: 'replacement-group',
          status: ReplicaState.FAILED,
          previous_state: ReplicaState.ACTIVE,
          state_entered_at: 200,
          updated_at: 200,
        };
      },
    },
  ];

  for (const replacementCase of replacements) {
    const source = serviceRow(
      `replica-lost-outcome-${replacementCase.name.replaceAll(' ', '-')}`,
      ReplicaState.ACTIVE,
      100,
    );
    let replacement = null;
    const {rows, stateMachine} = createOwnerFixture(source, 'lost', {
      afterServicesMutation(serviceRows) {
        replacement = replacementCase.build(source);
        serviceRows.set(source.service_id, {...replacement});
      },
    });

    t.equal(await stateMachine.transitionAuthoritativeReplicaGeneration(
      source,
      ReplicaState.FAILED,
      {timestamp: 200, reason: 'failure-detector-observation'},
    ), false, `${replacementCase.name} cannot satisfy lost-outcome proof`);
    t.same(rows[SERVICES].get(source.service_id), replacement,
      `${replacementCase.name} remains untouched after observation`);
  }
});

test('authoritative lifecycle intent retains exact zero-row debt', async (t) => {
  initializeEnvironment();
  const source = serviceRow(
    'replica-authority-deferred',
    ReplicaState.ACTIVE,
    400,
  );
  const {stateMachine} = createOwnerFixture(source, 'zero');

  await t.rejects(
    stateMachine.transitionAuthoritativeReplicaGeneration(
      source,
      ReplicaState.FAILED,
      {timestamp: 500, reason: 'failure-detector-observation'},
    ),
    {code: 'REPLICA_STATE_TRANSITION_DURABILITY_DEFERRED'},
    'exact source still present classifies zero-row as retryable debt',
  );
  t.equal(stateMachine.getState(source.service_id)?.state,
    ReplicaState.ACTIVE, 'deferred mutation cannot advance local lifecycle');
});

test('ordinary transition() cannot mutate a same-key replacement with ' +
  'coincident status and version after an authoritative snapshot',
async (t) => {
  initializeEnvironment();
  const source = serviceRow(
    'replica-ordinary-identity-swap',
    ReplicaState.ACTIVE,
    100,
  );
  const replacement = {
    ...source,
    partition_id: 'partition-new',
    node_id: 'node-b',
    address: 'node-b/partition/replica-ordinary-identity-swap',
  };
  let swapped = false;
  const {mutations, rows, stateMachine} = createOwnerFixture(
    source,
    'applied',
    {
      beforeServicesMutation(serviceRows) {
        if (swapped) return;
        swapped = true;
        serviceRows.set(source.service_id, {...replacement});
      },
    },
  );
  t.equal(await stateMachine.registerReplicaSnapshot(source.service_id, {
    partitionId: source.partition_id,
    nodeId: source.node_id,
    state: source.status,
    serviceId: source.service_id,
    serviceType: source.service_type,
    serviceAddress: source.address,
    replicaIdentity: source.replica_id,
    groupId: source.group_id,
    createdAt: source.created_at,
    durableVersionColumn: 'state_entered_at',
    durableVersion: source.state_entered_at,
    durableUpdatedAt: source.updated_at,
    authoritativeSnapshot: true,
  }), true, 'the authoritative snapshot is installed');

  let transitioned = null;
  try {
    transitioned = await stateMachine.transition(
      source.service_id,
      ReplicaState.FAILED,
      {timestamp: 200, reason: 'ordinary-transition-identity-swap'},
    );
  } catch (_error) {
    transitioned = false;
  }

  t.notOk(transitioned,
    'the ordinary entry cannot transfer lifecycle authority to a replacement');
  t.ok(mutations.some((mutation) => mutation.tableName === SERVICES),
    'the ordinary entry reached its lifecycle CAS');
  t.same(rows[SERVICES].get(source.service_id), replacement,
    'the same-ID same-version replacement remains byte-for-byte untouched');
  t.not(stateMachine.getState(source.service_id)?.state,
    ReplicaState.FAILED,
    'FAILED is never committed locally for the replacement key');
});
