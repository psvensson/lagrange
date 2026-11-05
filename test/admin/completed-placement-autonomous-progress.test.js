import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {createReadOnlyCache} from '../../src/cache/read-only-system-table-cache.js';
import {TABLES} from '../../src/constants/index.js';
import {resetFixtureSingletons, clearFixtureSingletons} from '../test-helpers/participant-transaction-fixture.js';
import {autonomousHandoffFixture, tick, RECOVERY_TICKS} from './completed-placement-autonomous-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

function assertConverged(f, originalOperation) {
  assert.equal(f.target().status, 'active', 'real CDC hydration repairs stale target visibility');
  assert.equal(f.target().raft_role, 'follower');
  assert.equal(f.publication().priority_partition_summary.satisfied, true,
    'the publication owner must durably settle the completed-placement handoff');
  assert.equal(f.publication().status, 'PUBLISHED');
  assert.deepEqual(f.operation(), originalOperation, 'the initial completed ADD remains terminal');
}

for (const disableTrigger of [false, true]) {
  test(`completed-placement handoff ${disableTrigger ? 'requires' : 'converges through'} the membership owner driver without admin polling`, async (t) => {
    const f = await autonomousHandoffFixture(t);
    const originalOperation = f.operation();
    const snapshot = new AdminControlSnapshot({nodeId: 'node-1',
      systemTableCache: createReadOnlyCache(f.cache), nowFn: () => f.clock.now()});
    let polls = 0;
    const original = snapshot.getControlSnapshot.bind(snapshot);
    snapshot.getControlSnapshot = (...args) => {
      polls += 1; return original(...args);
    };
    await tick(f);
    assert.ok(f.hydrations.some(({options, result}) =>
      options.tables?.includes(TABLES.SERVICES) && result.tablesFailed.includes(TABLES.SERVICES)),
    'fault engages the real periodic SERVICES hydration');
    assert.equal(f.target().status, 'syncing');
    assert.equal(f.publication().priority_partition_summary.satisfied, false);
    assert.equal(polls, 0);
    // The refused tick is settled BEFORE disabling its future wake. No held
    // successful read can complete behind the negative's disabled trigger.
    if (disableTrigger) f.clock.clearInterval(f.membership.ownerMembershipDriverTimer);
    f.blocked = false;
    const writesBefore = f.writes.length;
    for (let tickIndex = 0; tickIndex < RECOVERY_TICKS; tickIndex += 1) await tick(f);
    assert.equal(polls, 0, 'all owner progress precedes the first admin call');
    if (disableTrigger) {
      assert.throws(() => assertConverged(f, originalOperation), /real CDC hydration/);
      assert.equal(f.publication().priority_partition_summary.satisfied, false);
      assert.equal(f.writes.length, writesBefore);
      return;
    }
    assert.ok(f.hydrations.some(({options, result, blocked}) => !blocked &&
      options.tables?.includes(TABLES.SERVICES) && !result.tablesFailed.includes(TABLES.SERVICES)),
    'the existing timer drives real SERVICES hydration after fault release');
    assertConverged(f, originalOperation);
    assert.ok(f.writes.slice(writesBefore).some((write) =>
      write.sql.includes(TABLES.CONTROL_PLANE_PUBLICATIONS) && write.changes > 0),
    'owner-originated publication SQL commits after recovery');
    const versions = () => Object.fromEntries(Object.values(TABLES).map((table) =>
      [table, f.cache.getTableMutationVersion(table)]));
    const before = versions();
    const observed = await snapshot.getControlSnapshot({capturedAt: f.clock.now()});
    assert.equal(observed.replicaOperations.inFlightCount, 0);
    assert.equal(polls, 1);
    assert.deepEqual(versions(), before, 'the first admin snapshot is read only');
    assert.deepEqual(f.errors, [], 'no swallowed owner error can be accepted as convergence');
  });
}
