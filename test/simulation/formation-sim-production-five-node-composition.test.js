// A2c. Five production node environments coexist on one deterministic
// scheduler, and mounting the seed on node-0 leaves the other four untouched.
//
// This is deliberately small. A1 proved a node runtime's identity, thread
// manager and cache are per-instance; A2a proved the physical transport's
// endpoint registry is scenario-local and its frames cross virtual time; A2b
// proved a real BootstrapService composes node-0's phase-one infrastructure.
// What remains is the composition fact those three imply but none of them
// states: five environments, one network, one generation, and no leakage.
//
// Only node-0 is the seed. The other four are environments and nothing more -
// they will later mount the REAL join path, which is a different production
// owner, so no host here takes a mode flag and branches.
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
  createProductionSeedSimHost,
} from './formation-sim-production-seed-host.js';

const SEED_ID = 'node-0';
const NODE_IDS = Object.freeze(['node-0', 'node-1', 'node-2', 'node-3', 'node-4']);
const BASE_PORT = 19970;
const GENERATION = 'a2c-five-node-composition';

before(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: SEED_ID}, logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
});

after(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function fiveEnvironments() {
  const scenario = createProductionSimScenario();
  const environments = new Map(NODE_IDS.map((nodeId, index) => {
    const wsPort = BASE_PORT + index;
    return [nodeId, createProductionSimNodeEnvironment({
      nodeId, nodeAddress: `ws://127.0.0.1:${wsPort}`, wsPort, scenario,
    })];
  }));
  return {scenario, environments};
}

function distinct(values) {
  return new Set(values).size === values.length;
}

test('A2c-1. five node environments coexist without sharing node-local state',
  () => {
    const {scenario, environments} = fiveEnvironments();
    const all = [...environments.values()];

    assert.ok(distinct(all.map((environment) => environment.nodeService)),
      'each environment holds its own node runtime');
    assert.ok(distinct(all.map((environment) => environment.threadManager)),
      'its own thread manager');
    assert.ok(distinct(all.map((environment) => environment.timeSource)),
      'and its own clock');
    assert.ok(distinct(all.map((environment) => environment.nodeId)),
      'on five distinct node identities');

    // One scheduler and one physical transport, because there is one world.
    for (const environment of all) {
      assert.equal(environment.network, scenario.network,
        'every environment schedules on the one network');
      assert.equal(environment.connectionEnvironment,
        scenario.connectionEnvironment,
        'and shares the scenario\'s physical transport');
      assert.equal(environment.transcript, scenario.transcript,
        'and writes to the one transcript');
    }

    // Distinct clocks, but one virtual time while every node is running.
    const readings = all.map((environment) => environment.timeSource.now());
    assert.deepEqual(readings, NODE_IDS.map(() => 0),
      'five clocks, one world, all reading the same instant');

    // An environment composes nothing: no runtime is initialised and no
    // node-local cache has been constructed by merely existing.
    for (const environment of all) {
      assert.equal(environment.nodeService.isInitialized(), false);
      assert.ok(!environment.nodeService._systemTableCache,
        `${environment.nodeId} built no cache by existing`);
    }
    assert.equal(scenario.transcript.length(), 0,
      'and nothing semantic has happened yet');
  });

test('A2c-2. mounting the seed on node-0 changes nothing on node-1 to node-4',
  async () => {
    const {scenario, environments} = fiveEnvironments();
    const seed = createProductionSeedSimHost(environments.get(SEED_ID));

    await runOnSimulationGenerationRoot(GENERATION, () =>
      runOnExecutionNode(SEED_ID, () => seed.phaseInfrastructure()));
    await seed.settleCausalConsequences();

    // node-0 composed.
    assert.ok(seed.bootstrap.messageRouter, 'the seed has its router');
    assert.equal(environments.get(SEED_ID).nodeService.isInitialized(), true,
      'and its runtime is initialised');

    // The other four are exactly as they were.
    for (const nodeId of NODE_IDS.slice(1)) {
      const environment = environments.get(nodeId);
      assert.equal(environment.nodeService.isInitialized(), false,
        `${nodeId} was not initialised by the seed's phase`);
      assert.ok(!environment.nodeService._systemTableCache,
        `${nodeId} has no cache`);
      assert.equal(environment.routerOptionsSeen.length, 0,
        `${nodeId} built no router`);
      assert.equal(
        scenario.connectionEnvironment.environment.hasEndpoint(
          BASE_PORT + NODE_IDS.indexOf(nodeId)),
        false, `${nodeId} bound no endpoint`);
    }

    // Endpoint ownership is per node, and only one node has an owner yet.
    const endpoint = scenario.connectionEnvironment.environment
      .lookupEndpoint(BASE_PORT);
    assert.equal(endpoint.nodeId, SEED_ID,
      'the only bound endpoint belongs to the seed');
    assert.equal(endpoint.router, seed.bootstrap.messageRouter);

    // And the transcript names one node, because one node did something.
    const nodesInTranscript = new Set(scenario.transcript.entries()
      .map((entry) => entry.nodeId).filter(Boolean));
    assert.deepEqual([...nodesInTranscript], [SEED_ID],
      'every semantic boundary so far belongs to the seed');

    await seed.stop();
    await seed.settleCausalConsequences();
  });

test('A2c-3. the seed and join paths stay separate owners', async () => {
  // A structural statement, not a behavioural one: the environment layer
  // exposes nothing that chooses a production lifecycle, and the seed host is
  // the only thing that adds one. When the join host arrives it mounts on the
  // same environment rather than switching a flag inside this one.
  const {environments} = fiveEnvironments();
  const environment = environments.get('node-1');
  assert.equal(environment.bootstrap, undefined,
    'an environment has no bootstrap service');
  assert.equal(environment.mode, undefined,
    'and no mode to choose a production lifecycle with');
  assert.ok(typeof environment.routerFactory === 'function',
    'it offers the physical seam a production owner will need');
  assert.ok(typeof environment.stop === 'function',
    'and owns stopping the runtime it created');
});
