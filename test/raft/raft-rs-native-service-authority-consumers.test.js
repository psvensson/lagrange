// Actual partition initializer, native lifecycle and consumer owners. Only the
// native role observation is corrupted; stale role fields are left untouched.
import {test} from '../../src/test-helpers/tap.js';
import {instantiateRaftRsCore, verifyRaftRsBinding} from '../../src/raft/raft-rs-binding-owner.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
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
for (const kind of ['partition', 'message-group', 'wasm-service']) {
  test(`${kind} initial membership refusal retains initializer cleanup custody`, async (t) => {
    let phaseFaults = 0;
    let capturedDb;
    let service;
    const binding = {verifyRaftRsBinding, instantiateRaftRsCore: () => {
      const native = instantiateRaftRsCore();
      return Object.freeze({...native, status: (...args) => {
        const status = native.status(...args);
        // Select only the new wiring read, after actual native port opening.
        // Stack inspection chooses the fault phase; no lifecycle method or
        // event is replaced, and the counter proves the seam was reached.
        if (!new Error().stack.includes('wireReplicaLifecycleEvents')) return status;
        phaseFaults++;
        capturedDb = service.db;
        const invalid = {...status};
        delete invalid.raftState;
        return invalid;
      }});
    }};
    const loaded = await t.mockImport(openingFixtureUrl.href, {[bindingUrl.href]: binding});
    const fixture = await loaded.createFixture({after: (cleanup) => t.teardown(cleanup)});
    service = loaded.buildService(fixture, kind);
    let failure;
    try {
      await service.initialize();
    } catch (error) {
      failure = error;
    }
    t.equal(phaseFaults, 1, 'native invalidity occurs exactly at initial membership capture');
    t.equal((failure?.consensus ?? failure?.raftResult)?.reason, 'invalid-native-role',
      'initializer preserves the typed native refusal');
    t.equal(service.initialized, false);
    t.equal(service.raft, null, 'initialization releases the acquired native port');
    t.equal(capturedDb.open, false, 'initialization closes the acquired SQLite connection');
    t.equal(fixture.port.readStatus().outcome, 'CORE_OK', 'the independent native group survives');
  });
}
