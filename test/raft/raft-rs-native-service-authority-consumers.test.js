// Actual partition initializer, native lifecycle and consumer owners. Only the
// native role observation is corrupted; stale role fields are left untouched.
import {test} from '../../src/test-helpers/tap.js';
import Database from 'better-sqlite3';
import {instantiateRaftRsCore, verifyRaftRsBinding} from '../../src/raft/raft-rs-binding-owner.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {RAFT_EVENT} from '../../src/raft/raft-operation-port-constants.js';
import {isLiveServiceLeader} from '../../src/bootstrap/owners/service-leader-readiness-owner.js';
import {isLocalPartitionServiceLeader} from
  '../../src/cdc/cdc-integration-service-local-system-table-routing.js';
import {createSQLQueryEngineRoutingMetadataMethods} from
  '../../src/query/sql-query-engine-routing-metadata-methods.js';

const bindingUrl = new URL('../../src/raft/raft-rs-binding-owner.js', import.meta.url);
const fixtureUrl = new URL('./native-service-role-fixture.js', import.meta.url);

test('native withdrawal reaches bootstrap, CDC and query overlay permission owners', async (t) => {
  let corrupt = false;
  const binding = {verifyRaftRsBinding, instantiateRaftRsCore: () => {
    const native = instantiateRaftRsCore();
    return Object.freeze({...native, status: (...args) => {
      const status = native.status(...args);
      if (!corrupt) return status;
      const invalid = {...status};
      delete invalid.raftState;
      return invalid;
    }});
  }};
  const {nativeAuthorityPartition} = await t.mockImport(fixtureUrl.href,
    {[bindingUrl.href]: binding});
  const {service} = await nativeAuthorityPartition(t);
  const query = Object.defineProperties({nodeId: service.nodeId,
    partitionServicesProvider: () => new Map([[service.replicaId, service]])},
  createSQLQueryEngineRoutingMetadataMethods());
  const overlay = () => query.getLocalRuntimeRoutingOverlayServices(service.partitionId);
  await turnChainValue(service.raft.campaign());
  t.equal(isLiveServiceLeader(service), true, 'bootstrap sees active native tenure');
  t.equal(isLocalPartitionServiceLeader(service), true, 'CDC sees active native tenure');
  t.equal(overlay()[0]?.raft_role, 'leader', 'query overlay can publish an active leader');
  corrupt = true;
  const refused = await turnChainValue(service.raft.tick());
  t.equal(refused.reason, 'invalid-native-role');
  for (const read of [() => isLiveServiceLeader(service),
    () => isLocalPartitionServiceLeader(service), overlay]) {
    t.throws(read, {raftResult: refused}, 'consumer preserves canonical invalid observation');
  }
  corrupt = false;
  t.equal(service.getRole(), 'leader', 'fresh native role remains leader');
  t.equal(service.role, 'leader', 'retained descriptive field did not become authority');
  t.equal(service.isLeader, false);
  t.equal(service.leadershipTenure, null);
  t.equal(isLiveServiceLeader(service), false, 'bootstrap cannot regrant from a valid role read');
  t.equal(isLocalPartitionServiceLeader(service), false, 'CDC cannot regrant from a valid role read');
  t.throws(overlay, {raftResult: {outcome: 'CORE_REFUSED', reason: 'replica-routing-unavailable'}},
    'query cannot publish ACTIVE routing from withdrawn local authority');
  await turnChainValue(service.raft.tick());
  t.equal(isLiveServiceLeader(service), true, 'normal native announcement restores bootstrap grant');
  t.equal(isLocalPartitionServiceLeader(service), true, 'normal native announcement restores CDC grant');
  t.equal(overlay()[0]?.raft_role, 'leader', 'normal native announcement restores query routing');
});

const openingFixtureUrl = new URL('./raft-rs-backend/startup-cleanup-native-fixture.js',
  import.meta.url);
async function initialMembershipRefusalFixture(t, kind, externalShutdown = false) {
  const previousStackLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = 64;
  t.teardown(() => {
    Error.stackTraceLimit = previousStackLimit;
  });
  const observed = {phaseFaults: 0, frees: 0, closes: 0, timeline: [],
    initialization: 'pending'};
  let handle;
  let service = null;
  const binding = {verifyRaftRsBinding, instantiateRaftRsCore: () => {
    const native = instantiateRaftRsCore();
    return Object.freeze({...native, status: (...args) => {
      const status = native.status(...args);
      // Select only the new wiring read, after actual native port opening.
      // No lifecycle method or event is replaced; the counter proves engagement.
      if (!new Error().stack.includes('wireReplicaLifecycleEvents')) return status;
      observed.phaseFaults++;
      handle = args[0];
      observed.db = service.db;
      service.raft.subscribe(RAFT_EVENT.ROLE_OBSERVATION_REFUSED, (answer) => {
        observed.refusal = answer;
      });
      if (externalShutdown) {
        observed.shutdown = service.shutdown();
        observed.repeatedShutdown = service.shutdown();
      }
      const invalid = {...status};
      delete invalid.raftState;
      return invalid;
    }, free: (...args) => {
      const result = native.free(...args);
      if (args[0] === handle) {
        observed.frees++;
        observed.timeline.push({operation: 'native-free', initialization: observed.initialization});
      }
      return result;
    }});
  }};
  const close = Database.prototype.close;
  Database.prototype.close = function(...args) {
    const result = close.apply(this, args);
    if (this === observed.db) {
      observed.closes++;
      observed.timeline.push({operation: 'sqlite-close', initialization: observed.initialization});
    }
    return result;
  };
  t.teardown(() => {
    Database.prototype.close = close;
  });
  const loaded = await t.mockImport(openingFixtureUrl.href, {[bindingUrl.href]: binding});
  const fixture = await loaded.createFixture({after: (cleanup) => t.teardown(cleanup)});
  service = loaded.buildService(fixture, kind);
  return {fixture, service, observed};
}

for (const kind of ['partition', 'message-group', 'wasm-service']) {
  test(`${kind} initial membership refusal retains initializer cleanup custody`, async (t) => {
    const {fixture, service, observed} = await initialMembershipRefusalFixture(t, kind);
    let failure;
    try {
      await service.initialize();
    } catch (error) {
      failure = error;
      observed.initialization = 'rejected';
    }
    t.equal(observed.phaseFaults, 1, 'native invalidity occurs exactly at initial membership capture');
    t.equal(observed.refusal?.reason, 'invalid-native-role');
    t.equal(Object.isFrozen(observed.refusal), true);
    t.equal(failure?.consensus ?? failure?.raftResult, observed.refusal,
      'initializer retains the exact announced native refusal object');
    t.equal(service.initialized, false);
    t.equal(service.raft, null, 'initialization releases the acquired native port');
    t.equal(observed.db?.open, false, 'initialization closes the acquired SQLite connection');
    t.equal(observed.frees, 1, 'actual native free completed exactly once before rejection');
    t.equal(observed.closes, 1, 'actual SQLite close completed exactly once before rejection');
    t.same(observed.timeline, [
      {operation: 'native-free', initialization: 'pending'},
      {operation: 'sqlite-close', initialization: 'pending'},
    ], 'initialization-owned cleanup completes before its refusal escapes');
    await service.shutdown();
    await service.shutdown();
    t.equal(observed.frees, 1, 'repeated shutdown cannot free the native group twice');
    t.equal(observed.closes, 1, 'repeated shutdown cannot close the database twice');
    t.equal(fixture.port.readStatus().outcome, 'CORE_OK', 'the independent native group survives');
  });
}

test('partition initial membership refusal yields to an existing shutdown owner', async (t) => {
  const {fixture, service, observed} = await initialMembershipRefusalFixture(t, 'partition', true);
  let failure;
  const opening = service.initialize();
  opening.then(() => {
    observed.initialization = 'fulfilled';
  }, () => {
    observed.initialization = 'rejected';
  });
  try {
    await opening;
  } catch (error) {
    failure = error;
  }
  t.equal(observed.phaseFaults, 1);
  t.equal(observed.refusal?.reason, 'invalid-native-role');
  t.equal(failure?.consensus ?? failure?.raftResult, observed.refusal,
    'the primary native refusal settles initialization while shutdown owns release');
  t.equal(observed.shutdown, observed.repeatedShutdown, 'concurrent shutdown shares one owner');
  await observed.shutdown;
  t.equal(service.raft, null);
  t.equal(observed.db?.open, false);
  t.same(observed.timeline, [
    {operation: 'native-free', initialization: 'rejected'},
    {operation: 'sqlite-close', initialization: 'rejected'},
  ], 'external shutdown releases after initialization settles, without a circular join');
  await service.shutdown();
  t.equal(observed.frees, 1, 'the original native group was actually freed exactly once');
  t.equal(observed.closes, 1, 'the original database was actually closed exactly once');
  t.equal(fixture.port.readStatus().outcome, 'CORE_OK');
});

test('partition synchronous wiring preserves an ordinary host error', async (t) => {
  // Controlled host-error propagation, not native malformed-status evidence.
  // Actual constructors, native opening and explicit shutdown still execute.
  const wiringUrl = new URL('../../src/partition/partition-service-raft-lifecycle-wiring.js',
    import.meta.url);
  const wiring = await import(wiringUrl.href);
  const primary = new Error('ordinary synchronous wiring fault');
  let calls = 0;
  const loaded = await t.mockImport(openingFixtureUrl.href, {[wiringUrl.href]: {
    ...wiring,
    wirePartitionRaftLifecycleEvents: () => {
      calls++;
      throw primary;
    },
  }});
  const fixture = await loaded.createFixture({after: (cleanup) => t.teardown(cleanup)});
  const service = loaded.buildService(fixture, 'partition');
  let failure;
  try {
    await service.initialize();
  } catch (error) {
    failure = error;
  }
  t.equal(calls, 1, 'the controlled host-error seam engages');
  t.equal(failure, primary, 'ordinary error identity is unchanged');
  t.equal(failure.consensus, undefined, 'ordinary error is not relabeled as consensus');
  t.equal(failure.raftResult, undefined);
  const db = service.db;
  t.equal(db.open, true, 'ordinary error retains its existing cleanup contract');
  await service.shutdown();
  t.equal(service.raft, null);
  t.equal(db.open, false, 'explicit shutdown releases the acquired resources');
  t.equal(fixture.port.readStatus().outcome, 'CORE_OK');
});
