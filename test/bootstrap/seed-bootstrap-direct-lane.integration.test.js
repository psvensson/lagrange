// A fresh seed's bootstrap executes no write outside raft (line-regression-
// causes stage 3, item 5). cdc-bootstrap-direct-sql.js sends each write of the
// seed's registration window through the raft lane and, when that lane
// answered a failure or threw, re-executed the same SQL on the local replicas
// OUTSIDE raft (executeLocalQuery), under no key: a fallback that can apply a
// write twice or leave it on one replica only.
//
// A real fresh seed (the actual public startLagrangeRuntime in a new process)
// with the bootstrap-lane observer: it completes, its window wrote the
// services partition through raft, and no statement ran outside raft. The
// wall time is printed for the before/after start-time comparison.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {SEED_LANE_OBSERVATION} from '../test-helpers/seed-bootstrap-lane-observer.js';
import {startObservedFreshSeed} from '../test-helpers/seed-bootstrap-lane-start.js';

const NODE_ID = '550e8400-e29b-41d4-a716-446655449981';
const TEST_TIMEOUT_MS = 240000;
const allocator = createPortAllocator(import.meta.url);

test('a fresh seed bootstraps without executing a write outside raft',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    const {report, wallMs} = await startObservedFreshSeed({nodeId: NODE_ID,
      ports: allocator.getListenerPorts(), observe: SEED_LANE_OBSERVATION.COUNT});
    const lane = report.observation.bootstrapLane;
    console.log(`# WITNESS seed-bootstrap-direct-lane ${JSON.stringify({wallMs,
      returnedRuntime: report.returnedRuntime, windowWrites: lane.windowWrites,
      directWrites: lane.directWrites.length})}`);
    assert.equal(report.returnedRuntime, true,
      `the seed reached service (${JSON.stringify(report.startupError?.message)})`);
    assert.ok(lane.windowWrites > 0, 'the window wrote the services partition through raft');
    assert.deepEqual(lane.directWrites, [], 'no statement executed outside raft');
  });
