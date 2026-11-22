// A fresh seed's dynamic-config seeding reports what it wrote (line-regression-
// causes stage 4, item D). Both retained GCP seed logs report the seeding of a
// fresh store as `seeded: 0, skipped: 72` although the 72 config rows were
// inserted: the window's answers carry the partition's count under a name the
// outcome classifier does not read, so every applied insert was counted
// "skipped", a list that also held present rows, refusals and unknowns.
//
// A real fresh seed (the actual public startLagrangeRuntime in a new process)
// with the bootstrap-lane observer: its window seeds the definitions through
// raft; after the runtime returned, the same seeding service seeds them once
// more through the running seed's normal write path. Every definition is
// counted once per run under its own named state: inserted on the fresh store,
// already present on the second run, none refused, none unknown.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {CONFIG_DEFINITIONS} from '../../src/config/dynamic-config-service.js';
import {SEED_LANE_OBSERVATION} from '../test-helpers/seed-bootstrap-lane-observer.js';
import {startObservedFreshSeed} from '../test-helpers/seed-bootstrap-lane-start.js';

const NODE_ID = '550e8400-e29b-41d4-a716-446655449987';
const TEST_TIMEOUT_MS = 240000;
const DEFINITION_COUNT = Object.keys(CONFIG_DEFINITIONS).length;
const allocator = createPortAllocator(import.meta.url);

test('a fresh seed counts each seeded config definition under its own named state',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    const {report, wallMs} = await startObservedFreshSeed({nodeId: NODE_ID,
      ports: allocator.getListenerPorts(), observe: SEED_LANE_OBSERVATION.RESEED_CONFIG});
    const runs = report.observation.bootstrapLane.configSeeding;
    console.log(`# WITNESS seed-config-seeding-count ${JSON.stringify({wallMs,
      returnedRuntime: report.returnedRuntime, definitions: DEFINITION_COUNT, runs,
      service: report.service})}`);
    assert.equal(report.returnedRuntime, true,
      `the seed reached service (${JSON.stringify(report.startupError?.message)})`);
    assert.equal(runs.length, 2, 'the window seeded once and the running seed once more');
    assert.deepEqual(runs[0],
      {seeded: DEFINITION_COUNT, alreadyPresent: 0, refused: 0, unknown: 0},
      'the fresh store: every definition inserted is counted seeded');
    assert.deepEqual(runs[1],
      {seeded: 0, alreadyPresent: DEFINITION_COUNT, refused: 0, unknown: 0},
      'the second run: every definition is counted already present');
  });
