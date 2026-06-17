import t from 'tap';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {driveNetwork} from '../distributed/harness/raft-network-host.js';
import {hasFreshReadyLeaseOrHeartbeat} from
  '../../src/control-plane/active-node-projection.js';
import {buildPublicationActiveGateHandoffContract} from
  '../../src/control-plane/publication-active-gate-handoff-contract.js';
import {CONTROL_PLANE_READINESS_REASON} from
  '../../src/control-plane/control-plane-readiness-constants.js';

// DT6 item 1 — drive REAL readiness derivation into the REAL publication deficit decision on the
// virtual clock. Step 8's publisher used a hardcoded `readinessByNodeId: {ready: true}` and a fixed
// membership; this guard replaces that with two real production functions reacting to virtual time:
//
//  - hasFreshReadyLeaseOrHeartbeat(nodeRow, {nowMs}) (active-node-projection.js) — the real per-node
//    liveness check: a node is live iff its ready_lease_expires_at is in the future OR it has a
//    heartbeat within the 60s grace, evaluated against the OWNER's clock.
//  - buildPublicationActiveGateHandoffContract(...) (publication-active-gate-handoff-contract.js) —
//    the real owner deficit decision; resolvePublicationActiveGateHandoffPendingRecoveryNodeIds
//    filters the expected set to nodes whose readiness entry carries a real pending-owner reason
//    code (CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING).
//
// An owner driver tick runs on the network TimeSource: each tick it recomputes per-node liveness
// against the owner's VIRTUAL now and feeds the real deficit contract. A node whose ready-lease
// expires in virtual time is genuinely derived not-ready and surfaces in pendingRecoveryNodeIds —
// the deficit decision reacts to real readiness, not a hardcoded flag.
//
// HONEST SCOPE: the liveness determination (lease/heartbeat vs the virtual clock) and the deficit
// decision (pending-recovery filtering by reason code) are both real production code. The glue —
// mapping a not-live verdict to the PRIORITY_CONTROL_PLANE_RECOVERY_PENDING reason code — is the
// test's, a simplification of the full buildEvaluatedNodeReadinessSnapshot reason builder (which
// pulls in dimensions/runtime-authority context out of scope here). What this proves: real readiness
// liveness drives the real deficit decision on the virtual clock.

const IDS = Object.freeze(['N1', 'N2', 'N3']);
const START_MS = 1_000_000;
const INTERVAL_MS = 20;
const N3_LEASE_EXPIRES_AT = START_MS + 150; // N3's ready-lease lapses mid-run
const LONG_LEASE_AT = START_MS + 10_000; // N1/N2 stay live for the whole window
const PENDING_REASON = CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING;

// Node rows with real ready_lease_expires_at fields; no heartbeat, so once a lease lapses the real
// liveness check reports the node not-live.
function nodeRows() {
  return [
    {node_id: 'N1', status: 'active', ready_lease_expires_at: LONG_LEASE_AT},
    {node_id: 'N2', status: 'active', ready_lease_expires_at: LONG_LEASE_AT},
    {node_id: 'N3', status: 'active', ready_lease_expires_at: N3_LEASE_EXPIRES_AT},
  ];
}

// Build readinessByNodeId from the REAL liveness check: a not-live node carries the real
// pending-owner reason code the deficit decision filters on.
function deriveReadinessByNodeId(rows, nowMs) {
  const readinessByNodeId = {};
  for (const row of rows) {
    const live = hasFreshReadyLeaseOrHeartbeat(row, {nowMs});
    // not-live -> carry the real pending-owner reason code the deficit decision filters on
    // (normalizePublicationActiveGateHandoffReasonCodes reads the flat `reasonCodes` field).
    readinessByNodeId[row.node_id] = {
      node_id: row.node_id,
      reasonCodes: live ? [] : [PENDING_REASON],
    };
  }
  return readinessByNodeId;
}

function hostReadinessOwner(net, nodeId) {
  net.registerNode(nodeId, () => {});
  const ts = net.networkTimeSource(nodeId);
  const samples = []; // {now, pending: [...]}
  const rows = nodeRows();
  const timer = ts.setInterval(() => {
    const now = ts.now();
    const readinessByNodeId = deriveReadinessByNodeId(rows, now);
    const contract = buildPublicationActiveGateHandoffContract({
      nodeRows: rows,
      readinessByNodeId,
      publicationConvergence: {
        publicationEpoch: 1,
        publishedActiveNodeIds: [...IDS], // all published -> isolate the readiness/pending signal
      },
    });
    samples.push({now, pending: [...contract.pendingRecoveryNodeIds]});
  }, INTERVAL_MS);
  return {ts, samples, stop: () => ts.clearInterval(timer)};
}

async function runReadinessDeficit() {
  const net = createVirtualNetwork({startMs: START_MS});
  const owner = hostReadinessOwner(net, 'OWNER');
  await driveNetwork(net, {untilMs: START_MS + 400, stepMs: 5});
  owner.stop();
  return owner.samples;
}

t.test('real readiness liveness drives the real deficit decision on the virtual clock', async (t) => {
  const samples = await runReadinessDeficit();
  t.ok(samples.length > 0, 'the owner tick recomputed readiness on the virtual clock');

  const before = samples.filter((s) => s.now < N3_LEASE_EXPIRES_AT);
  const after = samples.filter((s) => s.now >= N3_LEASE_EXPIRES_AT);
  t.ok(before.length > 0 && after.length > 0, 'the run spans N3\'s virtual-time lease expiry');

  t.ok(before.every((s) => s.pending.length === 0),
    'while every lease is fresh, the real deficit decision reports no pending-recovery nodes');
  t.ok(after.every((s) => JSON.stringify(s.pending) === JSON.stringify(['N3'])),
    'once N3\'s lease lapses in virtual time, the real deficit decision marks N3 pending-recovery');

  // N1/N2 keep a fresh lease the whole window — they are never pending.
  t.ok(samples.every((s) => !s.pending.includes('N1') && !s.pending.includes('N2')),
    'nodes with a fresh lease are never derived pending (real liveness, not a flag)');
});

t.test('the readiness->deficit transition lands at N3\'s lease-expiry instant', async (t) => {
  const samples = await runReadinessDeficit();
  const firstPending = samples.find((s) => s.pending.includes('N3'));
  t.ok(firstPending, 'N3 eventually becomes pending-recovery');
  // First tick at/after the lease expiry; interval is 20ms, so within one tick of +150.
  t.ok(firstPending.now >= N3_LEASE_EXPIRES_AT &&
    firstPending.now < N3_LEASE_EXPIRES_AT + INTERVAL_MS,
  'the pending transition fires within one tick of the real lease-expiry instant');
});

t.test('the readiness-deficit drive is deterministic across runs', async (t) => {
  const a = await runReadinessDeficit();
  const b = await runReadinessDeficit();
  t.same(a, b, 'identical virtual drive -> identical readiness/deficit samples');
});
