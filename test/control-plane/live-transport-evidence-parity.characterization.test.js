import {test} from '../../src/test-helpers/tap.js';
import {STATE} from '../../src/constants/index.js';
import {CONNECTION_STATE} from '../../src/constants/transport.js';
import {
  hasLiveTransportEvidence,
} from '../../src/control-plane/live-transport-evidence.js';

// Characterization (parity) gate for spec node-liveness-veto-consolidation,
// Task 2.1 / Requirement 4.1. Pins that `hasLiveTransportEvidence` returns the
// SAME value as each of the three in-scope sites' CURRENT live-transport term,
// across the router-state cross-product (incl. case), proving each substitution
// is a pure no-op and that the atom's lowercasing fold is same-or-safer.
//
// Each helper below REPLICATES the exact current site expression as a pure
// function of the raw `getConnectionState(nodeId)` return value, so the parity
// is against today's shipped code, not a paraphrase.

const NODE = 'node-a';

/**
 * readiness `isClusterMemberHealthy` live-transport veto term.
 * control-plane-readiness-node-service-rows.js:529-530
 *   const {routerState} = this.getNodeTransportState(nodeId, nodeRow);
 *   return routerState === STATE.CONNECTED || routerState === STATE.READY;
 * where getNodeTransportState (:413-415/:423-426) computes
 *   routerState = String(getConnectionState(nodeId) || '').toLowerCase(),
 *   then normalizes an empty string to null.
 * @param {*} raw - Raw getConnectionState return value.
 * @return {boolean}
 */
function readinessLiveTerm(raw) {
  const lowered = String(raw || '').toLowerCase();
  const routerState = lowered.length > 0 ? lowered : null;
  return routerState === STATE.CONNECTED || routerState === STATE.READY;
}

/**
 * lease-sweep `isNodeTransportConnected` term.
 * lease-service.js:278-289
 *   const routerState = String(getConnectionState(nodeId) || '').toLowerCase();
 *   return routerState === STATE.CONNECTED || routerState === STATE.READY;
 * @param {*} raw - Raw getConnectionState return value.
 * @return {boolean}
 */
function leaseSweepLiveTerm(raw) {
  const routerState = String(raw || '').toLowerCase();
  return routerState === STATE.CONNECTED || routerState === STATE.READY;
}

/**
 * rebalancer `available-nodes` LIVE term.
 * unified-rebalancer-available-nodes.js:306-312
 *   if (... getConnectionState(nodeId) !== STATE.CONNECTED) return false;
 * i.e. the live gate PASSES iff getConnectionState(nodeId) === STATE.CONNECTED
 * — a RAW compare, NOT lowercased.
 * @param {*} raw - Raw getConnectionState return value.
 * @return {boolean}
 */
function rebalancerLiveTerm(raw) {
  return raw === STATE.CONNECTED;
}

/**
 * @param {*} value - Value the stub router returns for any nodeId.
 * @return {boolean} The atom's verdict for that router value.
 */
function atomFor(value) {
  return hasLiveTransportEvidence(NODE, {
    messageRouter: {getConnectionState: () => value},
  });
}

// The canonical LIVE-transport domain: the live transport state machine only
// ever emits these (all lowercase, verified below), plus the fail-closed edges.
const CANONICAL_LIVE_DOMAIN = [
  CONNECTION_STATE.DISCONNECTED,
  CONNECTION_STATE.CONNECTING,
  CONNECTION_STATE.CONNECTED,
  CONNECTION_STATE.RECONNECTING,
  CONNECTION_STATE.CLOSED,
  undefined,
  null,
  '',
];

test('the live-transport constants are already lowercase (why the ' +
  'rebalancer raw compare needs no fold)', (t) => {
  for (const value of Object.values(CONNECTION_STATE)) {
    t.equal(value, value.toLowerCase(),
      `CONNECTION_STATE value "${value}" is lowercase`);
  }
  t.equal(STATE.CONNECTED, STATE.CONNECTED.toLowerCase(),
    'STATE.CONNECTED is lowercase');
  // The inert `|| READY` disjunct: the live transport machine has NO `ready`
  // state, so that clause can never fire over the live domain — the atom
  // dropping it is a proven no-op.
  t.equal(Object.values(CONNECTION_STATE).includes(STATE.READY), false,
    'live transport domain excludes STATE.READY (|| READY is inert)');
  t.end();
});

test('atom is a pure no-op vs all three sites over the canonical live ' +
  'domain', (t) => {
  for (const raw of CANONICAL_LIVE_DOMAIN) {
    const atom = atomFor(raw);
    const label = JSON.stringify(raw);
    t.equal(atom, readinessLiveTerm(raw),
      `atom === readiness term for ${label}`);
    t.equal(atom, leaseSweepLiveTerm(raw),
      `atom === lease-sweep term for ${label}`);
    t.equal(atom, rebalancerLiveTerm(raw),
      `atom === rebalancer term for ${label}`);
  }
  t.end();
});

test('atom parity holds vs the lowercasing sites (readiness, lease-sweep) ' +
  'across case variants of the live states', (t) => {
  // Case variants of the actual live-transport states (NOT 'ready', which is
  // outside the live domain — see the dropped-|| READY pin below).
  const caseVariants = ['CONNECTED', 'Connected', 'ConNecTed', 'DISCONNECTED',
    'Disconnected', 'ConNecTing', 'ReConnecting', 'CLOSED'];
  for (const raw of caseVariants) {
    const atom = atomFor(raw);
    t.equal(atom, readinessLiveTerm(raw),
      `atom === readiness term for "${raw}"`);
    t.equal(atom, leaseSweepLiveTerm(raw),
      `atom === lease-sweep term for "${raw}"`);
  }
  t.end();
});

test('dropping the inert `|| READY` disjunct is safe: it only diverges on a ' +
  '"ready" input, which the live transport domain never emits', (t) => {
  // The readiness/lease-sweep sites carry a `|| routerState === READY` clause.
  // The atom drops it. This is a no-op ONLY because the live transport state
  // machine (CONNECTION_STATE) has no `ready` state — asserted here — so the
  // clause can never fire over the live domain. On a hypothetical (impossible)
  // 'ready' the atom is STRICTER (false) than the sites (true); pin that gap so
  // the drop is a documented, bounded difference, not a silent regression.
  t.equal(Object.values(CONNECTION_STATE).includes(STATE.READY), false,
    '"ready" is not a live transport state');
  for (const raw of ['ready', 'READY', 'Ready']) {
    t.equal(atomFor(raw), false, `atom drops "${raw}" → false`);
    t.equal(readinessLiveTerm(raw), true,
      `readiness site would accept out-of-domain "${raw}" → true`);
    t.equal(leaseSweepLiveTerm(raw), true,
      `lease-sweep site would accept out-of-domain "${raw}" → true`);
  }
  t.end();
});

test('vs the rebalancer RAW compare on mixed-case input the atom is ' +
  'same-or-SAFER (folds a connected node to true), never a regression', (t) => {
  // The rebalancer live term is a raw (non-lowercased) `=== CONNECTED`. On a
  // canonical-case input it equals the atom (pinned above). On a hypothetical
  // mixed-case 'CONNECTED' the raw compare returns false while the atom returns
  // true — the atom is strictly MORE permissive toward a genuinely-connected
  // peer, i.e. same-or-safer, never rejecting a node the raw check accepts.
  for (const raw of ['CONNECTED', 'Connected']) {
    t.equal(rebalancerLiveTerm(raw), false,
      `raw rebalancer compare is false for mixed-case "${raw}"`);
    t.equal(atomFor(raw), true,
      `atom folds mixed-case "${raw}" to true (same-or-safer)`);
  }
  // And crucially: wherever the raw rebalancer term is TRUE, the atom is also
  // TRUE — no node the rebalancer currently admits is newly rejected.
  for (const raw of CANONICAL_LIVE_DOMAIN) {
    if (rebalancerLiveTerm(raw)) {
      t.equal(atomFor(raw), true,
        `atom admits every node the rebalancer admits (${JSON.stringify(raw)})`);
    }
  }
  t.end();
});
