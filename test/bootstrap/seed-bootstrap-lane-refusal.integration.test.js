// A raft-lane refusal inside the seed's bootstrap window is never re-executed
// outside raft (line-regression-causes stage 3, item 5). The first window
// write to the services partition is answered at the raft lane with the
// partition write kernel's own NOT_LEADER refusal - the leaderless-window
// failure the CDC bootstrap-direct fallback was written for - in a real fresh
// seed (the actual public startLagrangeRuntime in a new process).
//
// Owned outcomes: the seed completes with every write through raft, or its
// bootstrap fails with the typed refusal; in neither does a statement run
// outside raft. Red while the fallback re-executes the refused write on the
// local replica.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {SEED_LANE_OBSERVATION} from '../test-helpers/seed-bootstrap-lane-observer.js';
import {startObservedFreshSeed} from '../test-helpers/seed-bootstrap-lane-start.js';

const NODE_ID = '550e8400-e29b-41d4-a716-446655449982';
const TEST_TIMEOUT_MS = 240000;
const allocator = createPortAllocator(import.meta.url);

test('a raft-lane refusal in the bootstrap window is not executed outside raft',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    const {report, wallMs} = await startObservedFreshSeed({nodeId: NODE_ID,
      ports: allocator.getListenerPorts(), observe: SEED_LANE_OBSERVATION.REFUSE});
    const lane = report.observation.bootstrapLane;
    const failure = report.startupError;
    console.log(`# WITNESS seed-bootstrap-lane-refusal ${JSON.stringify({wallMs,
      returnedRuntime: report.returnedRuntime, refused: lane.refused,
      directWrites: lane.directWrites, startupError: failure?.message ?? null})}`);
    assert.notEqual(lane.refused, null, 'the refusal was injected inside the window');
    assert.deepEqual(lane.directWrites, [], 'no statement executed outside raft');
    assert.ok(report.returnedRuntime === true ||
      (typeof failure?.message === 'string' && failure.message.length > 0),
    'an owned outcome: completed through raft, or a typed bootstrap failure');
  });
