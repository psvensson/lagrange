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
//
// What is compared. The raft-rs core draws each election timeout from the
// binding's own getrandom (owner decision O2, solve/epics/raft-rs-full-
// cutover/design-r3-r4-message-groups-worker-wasm-2026-09-23.md), and the
// scenario's starved seed loses every group to a joiner whose timeout
// elapses, so neither the charging transcript nor the charged totals repeat
// exactly from run to run. Under native check_quorum the leader of each group
// after a lease, and with it which node hosts the leader-side owners (and a
// joiner's apply), is drawn by that same randomness (owner 2026-10-05:
// "narrow the tests", no crate fork). Runs are therefore compared on what
// ambient ancestry could corrupt and the core does not decide: no attributed
// segment opens without an execution node (per run), the same set of owners
// runs, the same nodes are charged, and the same set of owners is charged
// across them. Only the leader-side owners lose their node: the
// leadership-independent owners (bootstrap, admin, transport, raft_protocol,
// worker_dispatch) are compared exactly as owner@node, and per node in the
// charging report.
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
const OWNER_NODE_SEPARATOR = '@';

// The raw charging transcript: every segment the seam opened, named by the
// owner it charged and the execution node it charged on, in order.
function withTranscript(body) {
  const entries = [];
  const original = FormationTurnAttribution.prototype.enterSegment;
  FormationTurnAttribution.prototype.enterSegment = function(
    owner, countDispatch, countHandoff, executionNodeId,
  ) {
    const result = original.call(
      this, owner, countDispatch, countHandoff, executionNodeId);
    entries.push(`${this.activeOwner}${OWNER_NODE_SEPARATOR}${this.activeExecutionNodeId}`);
    return result;
  };
  return Promise.resolve(body(entries)).finally(() => {
    FormationTurnAttribution.prototype.enterSegment = original;
  });
}

// The owners whose node does not depend on who leads: every node boots,
// serves admin, carries transport, runs its own raft protocol and dispatches
// its own workers whoever wins an election. For these the node is compared
// exactly (owner@node), so ambient ancestry leaking another node's identity
// into one of their segments fails; only the leader-side owners
// (rebalancer, membership_publication, readiness, a joiner's raft_apply) are
// compared without their node.
const LEADERSHIP_INDEPENDENT_OWNERS = new Set([
  FORMATION_OWNER.BOOTSTRAP,
  FORMATION_OWNER.ADMIN,
  FORMATION_OWNER.TRANSPORT,
  FORMATION_OWNER.RAFT_PROTOCOL,
  FORMATION_OWNER.WORKER_DISPATCH,
]);

function ownerOfEntry(entry) {
  return entry.slice(0, entry.lastIndexOf(OWNER_NODE_SEPARATOR));
}

// Attributed segments opened with no node, which owners ran, and on which
// node each leadership-independent owner ran.
function attributionShape(entries) {
  const attributed = entries.filter((entry) =>
    !entry.startsWith(`${FORMATION_OWNER.UNATTRIBUTED}${OWNER_NODE_SEPARATOR}`));
  return {
    unbound: attributed.filter((entry) =>
      entry.endsWith(`${OWNER_NODE_SEPARATOR}null`)).length,
    owners: [...new Set(attributed.map(ownerOfEntry))].sort(),
    independentOwnersOnNodes: [...new Set(attributed.filter((entry) =>
      LEADERSHIP_INDEPENDENT_OWNERS.has(ownerOfEntry(entry))))].sort(),
  };
}

// Which nodes were charged, which owners were charged across them, and -
// exactly, per node - which leadership-independent owners each node was
// charged for, read from per-node owner lists ({nodeId, owners}); which node
// a leader-side owner was charged on is leadership-dependent and not
// compared.
function chargingShapeOfNodes(nodes) {
  return JSON.stringify({
    nodeIds: nodes.map((node) => node.nodeId),
    owners: [...new Set(nodes.flatMap((node) => node.owners))].sort(),
    independentOwnersByNode: nodes.map((node) => ({
      nodeId: node.nodeId,
      owners: node.owners.filter((owner) =>
        LEADERSHIP_INDEPENDENT_OWNERS.has(owner)).sort(),
    })),
  });
}

function chargedNodesOf(report) {
  return report.formationMetrics.nodes.map((node) => ({
    nodeId: node.nodeId,
    owners: Object.keys(node.ownerSegments)
      .filter((owner) => node.ownerSegments[owner] > 0).sort(),
  }));
}

function chargingShape(report) {
  return chargingShapeOfNodes(chargedNodesOf(report));
}

async function sampleShapes(entries, invoke) {
  entries.length = 0;
  const charging = chargingShape(await invoke());
  return {charging, attribution: attributionShape([...entries])};
}

function assertSameShapes(observed, reference, name) {
  assert.equal(observed.attribution.unbound, 0,
    `${name}: attributed work opened with no execution node`);
  assert.deepEqual(observed.attribution.owners,
    reference.attribution.owners, `${name}: another set of owners ran`);
  assert.deepEqual(observed.attribution.independentOwnersOnNodes,
    reference.attribution.independentOwnersOnNodes,
    `${name}: a leadership-independent owner ran on another node`);
  assert.equal(observed.charging, reference.charging,
    `${name}: other nodes or other owners were charged`);
}

test('A. three same-seed runs in one process share one attribution shape',
  async () => {
    // No warm-up run: the FIRST simulation is one of the three compared.
    await withTranscript(async (entries) => {
      const samples = [];
      for (let run = 0; run < 3; run += 1) {
        samples.push(await sampleShapes(entries, () => simulate(SEED)));
      }
      for (let run = 0; run < samples.length; run += 1) {
        assertSameShapes(samples[run], samples[0], `run ${run + 1}`);
      }
      assert.ok(samples[0].attribution.owners.length > 0,
        'the transcript is not empty');
    });
  });

test('C. the caller\'s async ancestry cannot decide the simulation', async () => {
  // The same seed invoked through unrelated ambient host ancestry must open
  // attributed segments only on nodes, and the same owners on the same nodes.
  await withTranscript(async (entries) => {
    const runInside = (resource) => new Promise((resolve, reject) => {
      resource.runInAsyncScope(() => {
        simulate(SEED).then(resolve, reject);
      });
    });
    const plain = await sampleShapes(entries, () => simulate(SEED));
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
    assertSameShapes(plain, plain, 'plain');
    for (const [name, invoke] of Object.entries(cases)) {
      assertSameShapes(await sampleShapes(entries, invoke), plain, name);
    }
  });
});

test('D. one generation never supplies identity to the next', async () => {
  // Generation A runs first and leaves its continuations behind; B must begin
  // neutral rather than inheriting whatever node A was last executing.
  await withTranscript(async (entries) => {
    const a = await sampleShapes(entries, () => simulate(SEED));
    const b = await sampleShapes(entries, () => simulate(SEED));
    assertSameShapes(a, a, 'generation A');
    assertSameShapes(b, a, 'generation B');
    assert.ok(b.attribution.owners.length > 0);
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

test('B. the same seed charges the same owners under plain node and under node --test',
  async () => {
    const inProcess = chargingShape(await simulate(SEED));
    const script =
      'const {simulate} = await import(\'./test/simulation/formation-sim-runner.js\');' +
      'const report = await simulate(7);' +
      'process.stdout.write(JSON.stringify(report.formationMetrics.nodes.map(' +
      '(node) => ({nodeId: node.nodeId, owners: Object.keys(node.ownerSegments)' +
      '.filter((owner) => node.ownerSegments[owner] > 0).sort()}))));';
    const plainNode = execFileSync(
      process.execPath, ['--input-type=module', '-e', script],
      {cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1 << 24});
    assert.equal(chargingShapeOfNodes(JSON.parse(plainNode)), inProcess,
      'the test runner\'s own async activity changed which owners were charged');
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
