// Ambient host async ancestry must never determine simulator execution-node
// attribution.
//
// The falsified assumption: the simulator read its execution node from an
// AsyncLocalStorage frame that ordinary Node propagation carried in from
// WHOEVER called simulate(). A fresh process gave the scenario root no frame
// at all, so a block of production work was attributed to no node; a second
// simulation invoked from a promise still descending from the first one's
// node-0 work inherited node-0 for the same block. Two runs of one seed in
// one process then charged different totals - rebalancer 880 against 881,
// raft_protocol 2460 against 2464 - and the divergence appeared or not
// depending on what else the host happened to be doing, which is how it hid
// behind a roughly one-in-six node:test flake.
//
// The contract: every simulate() has an explicit tracked root, independent of
// the caller's async ancestry. The scheduler remains the only authority that
// introduces a node. The hook may PROPAGATE node identity within one
// generation; it may never ORIGINATE it from ambient host ancestry.
//
// Production work of the ACTIVE generation that genuinely needs a node and
// has none must still fail loudly: that is witness E, and it is what keeps
// this repair from being "ignore whatever is hard to attribute".
import {AsyncResource} from 'node:async_hooks';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  EXECUTION_NODE_UNBOUND_ERROR,
  FormationTurnAttribution,
  runOnExecutionNode,
} from '../../src/diagnostics/formation-turn-attribution.js';
import {FORMATION_OWNER} from '../../src/diagnostics/formation-diagnostics-contract.js';
import {simulate} from './formation-sim-runner.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEED = 7;

// The raw charging transcript: every segment the seam opened, named by the
// owner it charged and the execution node it charged on, in order. This is
// the quantity the report is derived from, so comparing it is strictly
// stronger than comparing report hashes.
function withTranscript(body) {
  const entries = [];
  const original = FormationTurnAttribution.prototype.enterSegment;
  FormationTurnAttribution.prototype.enterSegment = function(
    owner, countDispatch, countHandoff, executionNodeId,
  ) {
    const result = original.call(
      this, owner, countDispatch, countHandoff, executionNodeId);
    entries.push(`${this.activeOwner}@${this.activeExecutionNodeId}` +
      `${countDispatch ? 'D' : ''}${countHandoff ? 'H' : ''}`);
    return result;
  };
  return Promise.resolve(body(entries)).finally(() => {
    FormationTurnAttribution.prototype.enterSegment = original;
  });
}

function chargingDigest(report) {
  return JSON.stringify(report.formationMetrics.nodes.map((node) => ({
    nodeId: node.nodeId, busyMs: node.busyMs,
    ownerChargedMs: node.ownerChargedMs,
  })));
}

function firstDivergence(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) {
      return {index, left: left.slice(index - 2, index + 2),
        right: right.slice(index - 2, index + 2)};
    }
  }
  return null;
}

test('A. three same-seed runs in one process share one charging transcript',
  async () => {
    // No warm-up run: the FIRST simulation is one of the three compared.
    await withTranscript(async (entries) => {
      const transcripts = [];
      const digests = [];
      for (let run = 0; run < 3; run += 1) {
        entries.length = 0;
        digests.push(chargingDigest(await simulate(SEED)));
        transcripts.push([...entries]);
      }
      for (let run = 1; run < transcripts.length; run += 1) {
        const divergence = firstDivergence(transcripts[0], transcripts[run]);
        assert.equal(divergence, null,
          `run ${run + 1} diverged from run 1: ` +
          `${JSON.stringify(divergence)}`);
        assert.equal(digests[run], digests[0],
          `run ${run + 1} charged different totals`);
      }
      assert.ok(transcripts[0].length > 0, 'the transcript is not empty');
    });
  });

test('C. the caller\'s async ancestry cannot decide the simulation', async () => {
  // The deterministic reproduction of the whole class: the same seed invoked
  // through unrelated ambient host ancestry must charge identically, and must
  // open the same segments on the same nodes in the same order.
  await withTranscript(async (entries) => {
    const runInside = (resource) => new Promise((resolve, reject) => {
      resource.runInAsyncScope(() => {
        simulate(SEED).then(resolve, reject);
      });
    });
    const sample = async (invoke) => {
      entries.length = 0;
      const digest = chargingDigest(await invoke());
      return {digest, transcript: [...entries]};
    };
    const plain = await sample(() => simulate(SEED));
    const cases = {
      'an ambient AsyncResource ancestor':
        () => runInside(new AsyncResource('ambient-host-work')),
      'a different ambient ancestor':
        () => runInside(new AsyncResource('other-ambient-host-work')),
      'an ambient promise chain': async () => {
        let chain = Promise.resolve();
        for (let turn = 0; turn < 8; turn += 1) chain = chain.then((v) => v);
        await chain;
        return simulate(SEED);
      },
    };
    for (const [name, invoke] of Object.entries(cases)) {
      const observed = await sample(invoke);
      const divergence = firstDivergence(plain.transcript, observed.transcript);
      assert.equal(divergence, null,
        `${name} changed the charging transcript: ${JSON.stringify(divergence)}`);
      assert.equal(observed.digest, plain.digest,
        `${name} changed the charged totals`);
    }
  });
});

test('D. one generation never supplies identity to the next', async () => {
  // Generation A runs first and leaves its continuations behind; B must begin
  // neutral rather than inheriting whatever node A was last executing.
  await withTranscript(async (entries) => {
    entries.length = 0;
    const a = chargingDigest(await simulate(SEED));
    const generationA = [...entries];
    entries.length = 0;
    const b = chargingDigest(await simulate(SEED));
    const generationB = [...entries];
    assert.equal(b, a, 'generation B charged differently from generation A');
    const divergence = firstDivergence(generationA, generationB);
    assert.equal(divergence, null,
      `generation B diverged from A: ${JSON.stringify(divergence)}`);
    // The root of each generation is node-neutral: harness plumbing belongs
    // to no simulated process, and must not be handed a node by ancestry.
    assert.ok(generationB.length > 0);
  });
});

test('E. active-generation production work that needs a node still fails closed',
  async () => {
    // The safety boundary. Repairing ambient ancestry must NOT be done by
    // tolerating unbound work: an attributed segment of the live generation
    // with no node is still a scheduling seam someone forgot to bind.
    const attribution = new FormationTurnAttribution({
      requireExecutionNode: true,
      clock: (() => {
        let tick = 0;
        return () => {
          tick += 1;
          return tick;
        };
      })(),
    });
    attribution.start();
    try {
      assert.throws(
        () => attribution.enterSegment(FORMATION_OWNER.REBALANCER, true, false, null),
        (error) => error.message === EXECUTION_NODE_UNBOUND_ERROR,
        'attributed work with no execution node must still be refused');
      // Plumbing is node-less by definition and stays admitted.
      runOnExecutionNode('node-0', () => {
        attribution.enterSegment(FORMATION_OWNER.UNATTRIBUTED, true, false, null);
        attribution.leaveSegment();
      });
    } finally {
      attribution.stop();
    }
  });

test('B. the same seed charges the same under plain node and under node --test',
  async () => {
    const inProcess = chargingDigest(await simulate(SEED));
    const script =
      'const {simulate} = await import(\'./test/simulation/formation-sim-runner.js\');' +
      'const report = await simulate(7);' +
      'process.stdout.write(JSON.stringify(report.formationMetrics.nodes.map(' +
      '(node) => ({nodeId: node.nodeId, busyMs: node.busyMs, ' +
      'ownerChargedMs: node.ownerChargedMs}))));';
    const plainNode = execFileSync(
      process.execPath, ['--input-type=module', '-e', script],
      {cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1 << 24});
    assert.equal(plainNode, inProcess,
      'the test runner\'s own async activity changed what the simulator charged');
  });

test('F. no production work of a run advances after simulate() returns', async () => {
  // The causal completion witness. A rebalance-check reconcile chain need not
  // create a timer or a virtual event, so nothing the scheduler can see
  // reports it; before the planner had a current-work completion contract a
  // scenario returned with checks still running, and their continuations
  // executed inside the NEXT scenario - which is what made the first run in a
  // process differ from every later one.
  //
  // The contract is "zero production work of that run advances afterwards",
  // not any particular count, so this counts reads across explicit host
  // checkpoints rather than waiting a wall-clock interval.
  const rows = await import(
    '../../src/rebalancer/priority-publication-safety-rows.js');
  const proto = rows.PriorityPublicationSafetyRows.prototype;
  const original = proto.readAvailablePriorityRecoveryPlanningSnapshot;
  let reads = 0;
  proto.readAvailablePriorityRecoveryPlanningSnapshot = function(operation) {
    reads += 1;
    return original.call(this, operation);
  };
  try {
    await simulate(SEED);
    const readsAtReturn = reads;
    for (let checkpoint = 0; checkpoint < 4; checkpoint += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(reads, readsAtReturn,
      'production planning work advanced after the scenario returned; the ' +
      'next scenario would have inherited it');
    assert.ok(readsAtReturn > 0, 'the run did do planning work');
  } finally {
    proto.readAvailablePriorityRecoveryPlanningSnapshot = original;
  }
});

// Witness G (under-draining the planner makes runs disagree) was removed
// rather than weakened. It falsified while the ambient-clock authority escape
// was still open: neutering the planner's completion contract then made run 1
// disagree with later runs, 45 planning reads against 51. With production
// time owned by the node, the same mutation is no longer observable on any
// quantity measured here - 9 reads per run either way, none after return -
// because the scenario no longer performs the redundant work the leak used to
// show up in. A mutation witness that cannot fail proves nothing, so the
// completion contract now rests on its causal argument alone: a reconcile
// admitted at instant T may cross pure promise continuations and observe
// state, so it must close inside T rather than at scenario end.
