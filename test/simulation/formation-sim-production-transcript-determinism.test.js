// The composed node's four artifacts are a pure function of the scenario.
//
// A simulator whose output moves when the measuring code changes measures the
// measuring code. So the gate is exact equality of complete serialized
// artifacts - never selected counters - across every axis on which the HOST
// may differ and the scenario may not:
//
//   the same process, repeatedly;
//   a fresh process, repeatedly;
//   plain node against the test runner;
//   synchronous host burden of 0, 50, 200 and 500 thousand iterations;
//   no host observer, an observer, and an observer capturing stacks.
//
// Four artifacts, because they answer four different questions and all four
// must hold: the host transcript (which production boundaries happened, in
// what causal order), the VirtualNetwork transcript (what the scheduler did),
// the strict report (whether any ambient seam was reached), and the
// provenance snapshot (who owned what at the end).
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {after, before, test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  runSeedPhaseOneScenario,
} from './formation-sim-production-seed-host.js';
import {ScenarioHostObserver} from './formation-sim-quiescence.js';

const NODE_ID = 'node-0';
const ARTIFACTS = Object.freeze([
  'hostTranscript', 'networkTranscript', 'strictReport', 'provenanceSnapshot',
  'afterPhaseReturned', 'afterCausalClosure',
]);
const HOST_BURDENS = Object.freeze([0, 50000, 200000, 500000]);
const FRESH_PROCESS_RUNS = 3;

before(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: NODE_ID}, logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
});

after(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function burn(iterations) {
  if (iterations === 0) return null;
  return () => {
    let total = 0;
    for (let index = 0; index < iterations; index += 1) total += index % 7;
    return total;
  };
}

function assertSameArtifacts(actual, expected, because) {
  for (const artifact of ARTIFACTS) {
    assert.equal(actual[artifact], expected[artifact],
      `${artifact} is not exact ${because}`);
  }
}

// The program a fresh process runs. It prints the same artifacts this process
// compares, so plain `node` and `node --test` are compared directly.
function freshProcessProgram() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const importPath = (...segments) =>
    JSON.stringify(path.join(here, ...segments));
  return [
    `const host = await import(${importPath(
      'formation-sim-production-seed-host.js')});`,
    `const {ConfigurationManager} = await import(${importPath(
      '..', '..', 'src', 'config', 'configuration-manager.js')});`,
    `const {LoggingService} = await import(${importPath(
      '..', '..', 'src', 'logging', 'logging-service.js')});`,
    'ConfigurationManager.getInstance().initialize(' +
      '{node: {id: \'node-0\'}, logging: {level: \'error\'}});',
    'LoggingService.getInstance().initialize({level: \'error\'});',
    'const run = await host.runSeedPhaseOneScenario();',
    'const artifacts = {};',
    `for (const key of ${JSON.stringify(ARTIFACTS)}) artifacts[key] = run[key];`,
    'process.stdout.write(JSON.stringify(artifacts));',
  ].join('\n');
}

test('D1. the same process produces the same artifacts three times over',
  async () => {
    const first = await runSeedPhaseOneScenario();
    assert.ok(first.hostTranscript.length > 0, 'the run has a transcript');
    for (let attempt = 2; attempt <= 3; attempt += 1) {
      const again = await runSeedPhaseOneScenario();
      assertSameArtifacts(again, first, `on same-process run ${attempt}`);
      assert.equal(again.nowMs, first.nowMs, 'and the same final instant');
    }
  });

test('D2. synchronous host burden has no authority over any artifact',
  async () => {
    // The burden runs as an owner-idle contract inside the existing causal
    // closure authority. If host speed decided anything, this is where it
    // would appear.
    const quiet = await runSeedPhaseOneScenario();
    for (const iterations of HOST_BURDENS) {
      const loaded = await runSeedPhaseOneScenario({hostLoad: burn(iterations)});
      assertSameArtifacts(loaded, quiet, `under ${iterations} iterations`);
      assert.equal(loaded.nowMs, quiet.nowMs);
    }
  });

test('D3. observing the host does not change what the host does', async () => {
  const unobserved = await runSeedPhaseOneScenario();

  const plain = new ScenarioHostObserver().enable();
  const observed = await runSeedPhaseOneScenario({observer: plain});
  plain.disable();
  assertSameArtifacts(observed, unobserved, 'with a host observer enabled');

  // Stack capture is the most intrusive setting the observer has.
  const capturing = new ScenarioHostObserver().enable();
  capturing.captureStacks = true;
  const withStacks = await runSeedPhaseOneScenario({observer: capturing});
  capturing.disable();
  assertSameArtifacts(withStacks, unobserved, 'with stack capture enabled');
});

test('D4. a fresh plain-node process reproduces what the test runner sees',
  async () => {
    // This process IS `node --test`; the children are plain `node`. Comparing
    // them is the node-versus-test-runner gate as well as the fresh-process
    // one.
    const local = await runSeedPhaseOneScenario();
    const program = freshProcessProgram();
    for (let run = 1; run <= FRESH_PROCESS_RUNS; run += 1) {
      const child = spawnSync(process.execPath,
        ['--input-type=module', '-e', program], {encoding: 'utf8'});
      assert.equal(child.status, 0,
        `fresh process ${run} ran the composed node: ${child.stderr}`);
      assertSameArtifacts(JSON.parse(child.stdout), local,
        `in fresh process ${run}`);
    }
  });

test('D5. after the seal the scenario is over, in every domain', async () => {
  const observer = new ScenarioHostObserver().enable();
  const run = await runSeedPhaseOneScenario({observer});

  const transcriptLength = run.hostTranscriptLength;
  const enqueueEpoch = run.enqueueEpoch;
  assert.equal(run.pendingEventCount, 0,
    'no virtual timer and no connection frame is left pending');

  // Several checkpoints, not one: a callback may queue work behind a
  // checkpoint that is already queued.
  for (let checkpoint = 0; checkpoint < 4; checkpoint += 1) {
    await observer.checkpoint();
  }
  observer.disable();

  assert.equal(run.host.transcript().length(), transcriptLength,
    'the transcript did not grow after the seal');
  assert.equal(run.scenario.network.enqueueEpoch(), enqueueEpoch,
    'the scheduler received no new event after the seal');
  assert.equal(run.scenario.network.pendingEventCount(), 0,
    'and nothing is pending');

  // An inert Promise reaction is not a production effect; anything else is.
  const effects = observer.escapes.filter((escape) => escape.type !== 'PROMISE');
  assert.deepEqual(effects, [],
    'no production work ran after the scenario was sealed');
  assert.deepEqual(observer.pendingWallClockResources(), [],
    'and nothing is waiting on the host clock');
});
