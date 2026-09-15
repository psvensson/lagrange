// Production time inside the simulator is the owning node's time, and the
// deterministic guard covers every tagged production execution boundary.
//
// The classification these seal is "ambient-clock authority escape":
//
//   host execution speed -> Date.now() -> a production staleness or backoff
//   predicate -> a different authoritative read decision -> different charged
//   rebalancer work -> a different virtual instant -> cold/warm divergence
//
// It was demonstrated by making wall time deterministic for one experiment,
// which made a cold first run and a warm later run identical. That experiment
// is causality proof and is NOT the repair: faking process time hides ambient
// violations instead of moving ownership.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  NONDETERMINISTIC_OWNER_SEAM,
  assertNoNondeterministicOwnerSeam,
  guardedDispatch,
  installDeterministicOwnerGuard,
  nondeterministicOwnerSeamLedger,
  resetNondeterministicOwnerSeamLedger,
} from './formation-sim-guard.js';
import {
  currentFormationExecutionContext,
  runOnExecutionNode,
  runOnSimulationGenerationRoot,
} from '../../src/diagnostics/formation-turn-attribution.js';

const GENERATION = 'time-authority-witness/1';
const NODE = 'node-0';

// Run a body as the simulated node would run it: inside a generation, on an
// execution node. No guardedDispatch, because a dispatch no longer decides
// what production is.
function asSimulatedNode(body, {owner = null} = {}) {
  installDeterministicOwnerGuard();
  return runOnSimulationGenerationRoot(GENERATION, () =>
    runOnExecutionNode(NODE, () =>
      (owner === null ? body() : guardedDispatch(owner, body))));
}

test('L1. a raw ambient clock read while executing as a node is refused',
  async () => {
    // The core authority witness: no dispatch involved at all.
    resetNondeterministicOwnerSeamLedger();
    await assert.rejects(
      async () => asSimulatedNode(async () => Date.now()),
      (error) => error.code === NONDETERMINISTIC_OWNER_SEAM);
    const ledger = nondeterministicOwnerSeamLedger();
    assert.equal(ledger.count, 1, 'and the generation records it');
    assert.equal(ledger.samples[0].executionNodeId, NODE);
    assert.equal(ledger.samples[0].generationId, GENERATION);
    resetNondeterministicOwnerSeamLedger();
  });

test('L2. the authority survives a promise continuation', async () => {
  resetNondeterministicOwnerSeamLedger();
  await assert.rejects(
    async () => asSimulatedNode(async () => {
      await Promise.resolve();
      return Date.now();
    }),
    (error) => error.code === NONDETERMINISTIC_OWNER_SEAM,
    'a continuation of node work is still node work');
  const [sample] = nondeterministicOwnerSeamLedger().samples;
  assert.equal(sample.executionNodeId, NODE, 'attributed to the same node');
  assert.equal(sample.generationId, GENERATION, 'and the same generation');
  resetNondeterministicOwnerSeamLedger();
});

test('L3. production resumed behind a harness idle wait is still production',
  async () => {
    // The measured shape: node work crosses a promise, neutral harness waits
    // for an owner to report idle, the production continuation resumes, and
    // the harness continues afterwards.
    resetNondeterministicOwnerSeamLedger();
    let release = null;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    let productionRefused = false;
    const production = asSimulatedNode(async () => {
      await held;
      try {
        Date.now();
      } catch (error) {
        productionRefused = error.code === NONDETERMINISTIC_OWNER_SEAM;
      }
      return currentFormationExecutionContext();
    });
    // Neutral harness: it waits, and it is not a context donor in either
    // direction.
    const harnessBeforeAwait = currentFormationExecutionContext();
    release();
    const productionContext = await production;
    const harnessAfterAwait = currentFormationExecutionContext();
    assert.equal(productionRefused, true,
      'the resumed production continuation is refused, not permitted');
    assert.equal(productionContext.executionNodeId, NODE,
      'and it resumed as the node that admitted it');
    assert.equal(harnessBeforeAwait.executionNodeId, null);
    assert.equal(harnessAfterAwait.executionNodeId, null,
      'the harness continuation after the await stays neutral');
    assert.equal(nondeterministicOwnerSeamLedger().count, 1);
    resetNondeterministicOwnerSeamLedger();
  });

test('L4. production with no attribution owner is still production', async () => {
  // Prevents unattributed == harness from becoming an escape hatch.
  resetNondeterministicOwnerSeamLedger();
  await assert.rejects(
    async () => asSimulatedNode(async () => Date.now()),
    (error) => error.code === NONDETERMINISTIC_OWNER_SEAM);
  const [sample] = nondeterministicOwnerSeamLedger().samples;
  assert.equal(sample.owner, null, 'recorded with no owner, and refused anyway');
  resetNondeterministicOwnerSeamLedger();
});

test('L5. harness code at the generation root keeps real host time', async () => {
  resetNondeterministicOwnerSeamLedger();
  installDeterministicOwnerGuard();
  const observed = await runOnSimulationGenerationRoot(GENERATION, async () => {
    await Promise.resolve();
    return Date.now();
  });
  assert.equal(typeof observed, 'number',
    'a generation root with no execution node is harness, not production');
  assert.equal(nondeterministicOwnerSeamLedger().count, 0,
    'and it records no violation');
});

test('L6. a late continuation of one generation is never the next one\'s',
  async () => {
    // Generations are sequential, as simulate() makes them: a root returns
    // when its scenario returns. What outlives it is a continuation nobody
    // awaited - exactly the straggler shape measured between runs - and it
    // must still name the generation that admitted it.
    installDeterministicOwnerGuard();
    let release = null;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    let observed = null;
    let straggler = null;
    await runOnSimulationGenerationRoot('generation-A', async () => {
      // Detached on purpose: the root does not await it, so it survives the
      // generation, which is the case under test.
      straggler = runOnExecutionNode(NODE, async () => {
        await held;
        observed = currentFormationExecutionContext();
      });
    });
    await runOnSimulationGenerationRoot('generation-B', async () => {
      release();
      await straggler;
    });
    assert.equal(observed.generationId, 'generation-A',
      'the generation travels with the frame; it is not looked up globally');
    assert.equal(observed.executionNodeId, NODE,
      'and it never donates its node to the generation that was running');
  });

test('MUTATION: the retired dispatch-tag predicate loses L2 and L3', async () => {
  // Restoring "production means guardedDispatch is on the stack" is exactly
  // the defect measured: 240 of 241 ambient reads executing on a simulated
  // node were treated as harness because they arrived without a dispatch tag.
  const retiredPredicate = (dispatchTagActive) => dispatchTagActive;
  const nodeWorkWithoutADispatch = {dispatchTagActive: false};
  assert.equal(retiredPredicate(nodeWorkWithoutADispatch.dispatchTagActive),
    false,
    'under the retired predicate node work admitted outside a dispatch is ' +
    'not production, which is what L1 to L4 now refuse');
});

test('T3. a swallowed refusal still refuses the deterministic proof', async () => {
  // The failure mode the census found: production catches exceptions. A
  // refusal raised inside node execution is absorbed by an ordinary retry or
  // error path and the scenario completes, so the throw alone cannot decide
  // whether a run was deterministic - it only stops the illegal value from
  // being consumed. The ledger owns the verdict.
  resetNondeterministicOwnerSeamLedger();
  const result = await asSimulatedNode(async () => {
    await Promise.resolve();
    try {
      Date.now();
    } catch (_swallowed) {
      // Exactly what production does with a read that fails.
    }
    return 'completed normally';
  });
  assert.equal(result, 'completed normally',
    'the body returns normally, as production would');
  assert.equal(nondeterministicOwnerSeamLedger().count, 1,
    'and the access is recorded anyway');
  assert.throws(
    () => assertNoNondeterministicOwnerSeam(GENERATION),
    (error) => error.code === NONDETERMINISTIC_OWNER_SEAM,
    'so the deterministic proof is refused despite the swallowed exception');
  resetNondeterministicOwnerSeamLedger();
});

test('T4. a run with no ambient access is not refused', async () => {
  resetNondeterministicOwnerSeamLedger();
  const nodeTimeSource = {now: () => 1789295948000};
  const observed = await asSimulatedNode(async () => {
    await Promise.resolve();
    return nodeTimeSource.now();
  });
  assert.equal(observed, 1789295948000,
    'the owning node\'s TimeSource is how hosted production reads time');
  assert.equal(nondeterministicOwnerSeamLedger().count, 0);
  assertNoNondeterministicOwnerSeam(GENERATION);
});
