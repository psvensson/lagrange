/**
 * Unit tests for RuntimeServiceRebalancerOwner — discovery + leadership fan-out.
 *
 * Proves the owner's responsibility: while leader, maintain exactly one
 * rebalancer per ACTIVE runtime-service definition (excluding inactive and
 * non-runtime entities), constructed with the correct entityType/entityId, and
 * quiesce all when not leader so exactly one node plans cluster-wide.
 *
 * Scope note: this proves the owner's fan-out, not that 5432 opens. The
 * binding-observable proof (a RUNTIME_SERVICE ADD is actually planned) is the
 * already-green test/integration/pgwire-rebalance.integration.test.js — the
 * owner constructs that exact rebalancer config (entityType runtime_service,
 * entityId sys-postgres-wire) — plus the live placement check after wiring.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  RuntimeServiceRebalancerOwner,
} from '../../src/bootstrap/shared/runtime-service-rebalancer-setup.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function makeFakeRebalancer(record, opts) {
  const rebalancer = {
    opts,
    initialized: false,
    leaderCalls: [],
    shutdownCalls: 0,
    initialize() {
      this.initialized = true;
    },
    setLeader(value) {
      this.leaderCalls.push(value);
    },
    shutdown() {
      this.shutdownCalls += 1;
    },
  };
  record.push(rebalancer);
  return rebalancer;
}

function makeOwner(definitions, record) {
  const cache = {
    filter: (table, predicate) => definitions.filter(predicate),
  };
  return new RuntimeServiceRebalancerOwner({
    nodeId: 'node-1',
    systemTableCache: cache,
    cdcIntegrationService: {sqlQueryEngine: {}},
    tablePolicyService: {},
    messageRouter: {},
    rebalanceCoordinator: {},
    createRebalancer: (opts) => makeFakeRebalancer(record, opts),
  });
}

// Realistic serialized service_definitions rows: there is NO service_type column
// on this table (every row is a runtime service); the owner selects by status.
const PG = {
  service_id: 'sys-postgres-wire',
  status: 'active',
  runtime_kind: 'native_js',
  replica_count: 3,
};
const INACTIVE = {
  service_id: 'svc-off',
  status: 'inactive',
  runtime_kind: 'native_js',
  replica_count: 3,
};
const ANOTHER_ACTIVE = {
  service_id: 'sys-admin-meta',
  status: 'active',
  runtime_kind: 'native_js',
  replica_count: 3,
};

test('RuntimeServiceRebalancerOwner', async (t) => {
  t.beforeEach(initEnv);

  await t.test('constructs no rebalancers until leader', async (t) => {
    const record = [];
    makeOwner([PG], record);
    t.equal(record.length, 0, 'inert before leadership');
  });

  await t.test(
    'on leader: one rebalancer per ACTIVE definition (inactive excluded)',
    async (t) => {
      const record = [];
      const owner = makeOwner([PG, INACTIVE, ANOTHER_ACTIVE], record);
      owner.setLeader(true);
      t.equal(record.length, 2, 'two active services owned, inactive excluded');
      const entityIds = record.map((r) => r.opts.entityId).sort();
      t.same(entityIds, ['sys-admin-meta', 'sys-postgres-wire']);
      const pg = record.find((r) => r.opts.entityId === 'sys-postgres-wire');
      t.equal(pg.opts.entityType, 'runtime_service');
      t.equal(pg.opts.nodeId, 'node-1');
      t.ok(pg.initialized, 'initialize() called');
      t.same(pg.leaderCalls, [true], 'rebalancer set leader true');
    },
  );

  await t.test('losing leadership quiesces all', async (t) => {
    const record = [];
    const owner = makeOwner([PG], record);
    owner.setLeader(true);
    owner.setLeader(false);
    t.equal(record[0].shutdownCalls, 1, 'shutdown once on demotion');
    t.same(record[0].leaderCalls, [true, false], 'leader true then false');
    owner.setLeader(true);
    t.equal(record.length, 2, 'fresh rebalancer on re-lead');
  });

  await t.test(
    'refresh while leader adds new and drops removed services',
    async (t) => {
      const record = [];
      const definitions = [PG];
      const cache = {
        filter: (table, predicate) => definitions.filter(predicate),
      };
      const owner = new RuntimeServiceRebalancerOwner({
        nodeId: 'node-1',
        systemTableCache: cache,
        cdcIntegrationService: {sqlQueryEngine: {}},
        tablePolicyService: {},
        messageRouter: {},
        rebalanceCoordinator: {},
        createRebalancer: (opts) => makeFakeRebalancer(record, opts),
      });
      owner.setLeader(true);
      t.equal(record.length, 1, 'pg owned');
      definitions.push({
        service_id: 'svc-2',
        service_type: 'runtime_service',
        status: 'active',
      });
      owner.refresh();
      t.equal(record.length, 2, 'newly-deployed service picked up');
      definitions.shift();
      owner.refresh();
      const pgRebalancer = record.find(
        (r) => r.opts.entityId === 'sys-postgres-wire',
      );
      t.equal(pgRebalancer.shutdownCalls, 1, 'removed service quiesced');
    },
  );

  await t.test('refresh is a no-op when not leader', async (t) => {
    const record = [];
    const owner = makeOwner([PG], record);
    owner.refresh();
    t.equal(record.length, 0, 'no rebalancers built off-leader');
  });

  await t.test('shutdown quiesces and blocks further leadership', async (t) => {
    const record = [];
    const owner = makeOwner([PG], record);
    owner.setLeader(true);
    owner.shutdown();
    t.equal(record[0].shutdownCalls, 1, 'shutdown on owner shutdown');
    owner.setLeader(true);
    t.equal(record.length, 1, 'no new rebalancer after shutdown');
  });

  await t.test('missing required dependency throws', async (t) => {
    t.throws(
      () => new RuntimeServiceRebalancerOwner({nodeId: 'n'}),
      'throws on missing deps',
    );
  });

  await t.test('a throwing shutdown does not strand other teardowns', async (t) => {
    const record = [];
    const owner = makeOwner([PG, ANOTHER_ACTIVE], record);
    owner.setLeader(true);
    t.equal(record.length, 2);
    record[0].shutdown = () => {
      throw new Error('boom');
    };
    owner.shutdown();
    t.equal(record[1].shutdownCalls, 1, 'second rebalancer still torn down');
  });
});
