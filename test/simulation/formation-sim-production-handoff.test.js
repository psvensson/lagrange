// D. Registration, cache hydration, bootstrap-mode exit and runtime handoff -
// four transitions, four owners, four pieces of evidence.
//
// The temptation here is one assertion: the seed finished and the runtime
// works. That would hide the thing D exists to check. Each transition has an
// authoritative owner and is separately observable, and the handoff in
// particular has a demonstrable point before which bootstrap owns system-table
// writes and after which the runtime does, with no interval in which both act
// and no fallback that silently keeps bootstrap authority.
//
// C established that strict cleanliness is not sufficient: time and randomness
// are independently owned nondeterministic substrates, and it was ARTIFACT
// EQUALITY that proved the second was missing. So the strict gate and the
// repeatability gate are separate tests here, deliberately.
import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  runOnExecutionNode, runOnSimulationGenerationRoot,
} from '../../src/diagnostics/formation-turn-attribution.js';
import {
  createProductionSimNodeEnvironment, createProductionSimScenario,
} from './formation-sim-production-node-environment.js';
import {
  createProductionSeedSimHost, runSeedHandoffScenario,
} from './formation-sim-production-seed-host.js';

const NODE_ID = 'node-0';
const WS_PORT = 19998;
const NODE_ADDRESS = `ws://127.0.0.1:${WS_PORT}`;
const GENERATION = 'd-handoff';
const PHASE_HORIZON_MS = 120000;
const BOOTSTRAP_WRITER = 'BootstrapSystemTableWriter';
const RUNTIME_WRITER = 'RoutedSqlSystemTableWriter';
const ARTIFACTS = Object.freeze([
  'hostTranscript', 'networkTranscript', 'strictReport', 'provenanceSnapshot',
]);

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

async function seedThroughHandoff() {
  const scenario = createProductionSimScenario();
  const environment = createProductionSimNodeEnvironment({
    nodeId: NODE_ID, nodeAddress: NODE_ADDRESS, wsPort: WS_PORT, scenario,
  });
  const host = createProductionSeedSimHost(environment);
  await runOnSimulationGenerationRoot(GENERATION, () =>
    runOnExecutionNode(NODE_ID, () => host.phaseInfrastructure()));
  await host.settleCausalConsequences();
  const observed = {};
  for (const [name, startPhase] of [
    ['messageGroups', () => host.startPhaseMessageGroups()],
    ['partitions', () => host.startPhasePartitions()],
    ['registration', () => host.startPhaseRegistration()],
    ['hydration', () => host.startPhaseCacheHydration()],
  ]) {
    // Read the facts that must still be FALSE before each transition runs.
    observed[name] = {
      writer: host.bootstrap.systemTableWriter?.constructor.name ?? null,
      hydrated: host.bootstrap.systemCacheHydrated,
    };
    const running = runOnSimulationGenerationRoot(GENERATION, () =>
      runOnExecutionNode(NODE_ID, startPhase));
    await host.driveUntilSettled(running, PHASE_HORIZON_MS);
    await host.settleCausalConsequences();
  }
  return {scenario, environment, host, observed};
}

function order(host, event) {
  return host.transcript().entries().findIndex(
    (entry) => entry.event === event);
}

function countOf(host, event) {
  return host.transcript().entries()
    .filter((entry) => entry.event === event).length;
}

test('D-1. four transitions, each with an owner and its own evidence',
  async () => {
    const world = await seedThroughHandoff();
    const {host, observed} = world;

    // Nothing is collapsed into one end state: each fact is false before its
    // own transition and true after it.
    assert.equal(observed.registration.writer, null,
      'no system-table writer exists before registration');
    assert.equal(observed.hydration.writer, BOOTSTRAP_WRITER,
      'bootstrap owns writes when hydration begins');
    assert.equal(observed.hydration.hydrated, false,
      'and the cache is not hydrated yet');
    assert.equal(host.bootstrap.systemCacheHydrated, true,
      'hydration is what makes it hydrated');

    for (const event of ['phase_registration_started',
      'bootstrap_mode_entered', 'phase_registration_completed',
      'phase_cache_hydration_started', 'bootstrap_mode_exited',
      'runtime_write_authority_enabled', 'system_cache_hydrated',
      'phase_cache_hydration_completed']) {
      assert.equal(countOf(host, event), 1, `${event} happened exactly once`);
    }

    // And in the only order that makes them four transitions rather than one.
    const sequence = ['phase_registration_started', 'bootstrap_mode_entered',
      'phase_registration_completed', 'phase_cache_hydration_started',
      'bootstrap_mode_exited', 'runtime_write_authority_enabled',
      'system_cache_hydrated', 'phase_cache_hydration_completed'];
    const positions = sequence.map((event) => order(host, event));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b),
      'the four transitions happened in their declared order');

    await host.stop();
  });

test('D-2. write authority changes hands once, with no overlap and no fallback',
  async () => {
    const world = await seedThroughHandoff();
    const {host} = world;
    const entries = host.transcript().entries();

    const exited = order(host, 'bootstrap_mode_exited');
    const enabled = order(host, 'runtime_write_authority_enabled');
    assert.ok(exited < enabled,
      'bootstrap write authority is given up BEFORE the runtime takes it');
    assert.equal(enabled - exited, 1,
      'and nothing happens in between: there is no interval in which both ' +
      'the bootstrap writer and the runtime writer could act');
    assert.equal(entries[exited].writer, BOOTSTRAP_WRITER);
    assert.equal(entries[enabled].writer, RUNTIME_WRITER);

    // No fallback retains bootstrap authority: the field every consumer
    // reads holds the runtime writer, and nothing re-enters bootstrap mode.
    assert.equal(host.bootstrap.systemTableWriter.constructor.name,
      RUNTIME_WRITER, 'the installed writer is the runtime\'s');
    assert.equal(
      entries.slice(enabled).filter((entry) =>
        entry.event === 'bootstrap_mode_entered').length, 0,
      'bootstrap mode is never re-entered after the handoff');
    assert.equal(countOf(host, 'runtime_write_authority_enabled'), 1,
      'and authority is taken exactly once');

    await host.stop();
  });

test('D-3. strict stays clean across the whole chain', async () => {
  const run = await runSeedHandoffScenario();
  assert.equal(run.strictReport,
    'mode=strict violations=0 substitutions=0 eligible=true ledger=0',
    'registration, hydration and handoff reached no ambient seam');
});

test('D-4. the complete artifacts repeat, in and under load', async () => {
  // A SEPARATE gate from D-3 on purpose. C proved strict cleanliness does not
  // imply repeatability: every clock was honest and the formation still ended
  // at two different instants, because randomness is its own substrate.
  const first = await runSeedHandoffScenario();
  for (let attempt = 2; attempt <= 3; attempt += 1) {
    const again = await runSeedHandoffScenario();
    for (const artifact of ARTIFACTS) {
      assert.equal(again[artifact], first[artifact],
        `${artifact} is exact on run ${attempt}`);
    }
    assert.equal(again.nowMs, first.nowMs,
      'and the chain ends at the same virtual instant');
  }

  const loaded = await runSeedHandoffScenario({
    hostLoad: () => {
      let total = 0;
      for (let index = 0; index < 200000; index += 1) total += index % 7;
      return total;
    },
  });
  for (const artifact of ARTIFACTS) {
    assert.equal(loaded[artifact], first[artifact],
      `${artifact} is exact under host load`);
  }
});

test('D-5. production teardown leaves nothing armed', async () => {
  // The 409-timer finding as a standing rule: simulator cleanup exercises
  // production lifecycle ownership rather than manufacturing quiescence.
  const run = await runSeedHandoffScenario();
  assert.equal(run.pendingEventCount, 0,
    'a fully handed-over node leaves no pending work after teardown');
  assert.equal(run.scenario.network.pendingEventCount(), 0);
});
