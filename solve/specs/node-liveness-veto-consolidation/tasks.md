# Implementation Plan: Node-Liveness Veto Consolidation

## Overview

A pure-no-op DRY refactor: extract the live-transport-evidence atom, characterize
that each in-scope site is a no-op, route the three sites through it one at a time,
add the static guard, then delete the inline checks. All three in-scope sites
already compute live `getConnectionState === CONNECTED`; the atom only dedups them
(with consistent normalization) and prevents a future site from regressing to the
cached `connection_state` column. Bounded to the transport atom of primitive P2;
windows, compositions, the consensus-installed projection, operational probes, and
adjacent primitives all unchanged.

**Sequencing rule:** no site is switched before Task 2 pins its no-op; the
highest-blast-radius site (`isClusterMemberHealthy`, gating provisioning) is
switched LAST. Parity and red-on-revert tests are **mandatory** (not optional).

## Tasks

### Phase 1 — The atom + no-op characterization

- [ ] 1. Create the live-transport-evidence atom
  - [ ] 1.1 Create `hasLiveTransportEvidence(nodeId, {messageRouter})` returning
    `String(messageRouter.getConnectionState(nodeId) || '').toLowerCase() === CONNECTION_STATE.CONNECTED`
    - Pure; live router only (never the `nodes`-row `connection_state` column, never
      the `getNodeTransportState().connected` composite); normalize (lowercase) to
      match existing sites; compare `CONNECTED` only (drop inert `|| READY`); missing/
      throwing router → false
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [ ] 1.2 Unit-test the atom over the router-state cross-product incl. case variants
    - File: `test/control-plane/live-transport-evidence.test.js`
    - CONNECTED (any case)→true; disconnected/connecting/reconnecting/closed→false;
      absent nodeId→false; missing/throwing router→false (fails closed)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 2. Characterize the no-op (binding parity gate, BEFORE any switch)
  - [ ] 2.1 For each in-scope site, pin `hasLiveTransportEvidence(nodeId)` ==
    the site's current live-transport term across the router-state cross-product
    (incl. case), proving each is a no-op and the normalization fold is same-or-safer
    - File: `test/control-plane/live-transport-evidence-parity.characterization.test.js`
    - Sites: readiness `:529-530` (`getNodeTransportState().routerState`); lease-sweep
      `:278-289` (`getConnectionState` direct, lowercased); rebalancer LIVE term
      `:306-312` (`getConnectionState !== CONNECTED`, NOT lowercased today)
    - _Requirements: 4.1, 2.5_

### Phase 2 — Switch sites (lowest blast radius first; `isClusterMemberHealthy` last)

- [ ] 3. Lease-sweep transport guard (`lease-service.js:278-289` / sweep `:203`)
  - [ ] 3.1 Route `isNodeTransportConnected`/the sweep guard through
    `hasLiveTransportEvidence`; keep the old inline path behind a flag
    - _Requirements: 2.2, 4.4_
  - [ ] 3.2 dt:prove red-on-revert: a live-router-CONNECTED node with an expired
    lease is NOT swept (no-op parity with today); a transport-severed node IS swept
    - `npm run dt:prove --test test/control-plane/lease-sweep-transport-guard.test.js --src src/control-plane/lease-service.js`
    - _Requirements: 4.2_

- [ ] 4. Rebalancer `available-nodes` LIVE term (`unified-rebalancer-available-nodes.js:306-312`)
  - [ ] 4.1 Replace ONLY the live `getConnectionState(nodeId) !== CONNECTED` check
    with the atom; preserve the cached conjunct (`:296-305`) and the surrounding
    placement gates; keep inline behind a flag
    - _Requirements: 2.3, 4.4_
  - [ ] 4.2 dt:prove red-on-revert + rebalancer availability regression (parity)
    - _Requirements: 4.2_

- [ ] 5. `isClusterMemberHealthy` (highest blast radius — LAST)
  - [ ] 5.1 Replace the `a79b3728` block (`control-plane-readiness-node-service-rows.js:529-530`)
    with `return hasLiveTransportEvidence(nodeId, {messageRouter: this.messageRouter})`;
    the `isRecentHeartbeat` disjunct (:514) and 30 s window unchanged; keep behind flag
    - _Requirements: 2.1, 4.1, 4.4_
  - [ ] 5.2 dt:prove red-on-revert reusing the shipped MODE-A test
    (`control-plane-readiness-service-cluster-health-and-recovery-diagnostics.test.js`)
    - _Requirements: 4.2_
  - [ ] 5.3 Full consumer regression sweep (readiness, lease-sweep, rebalancer
    availability) — expect parity with the `a79b3728` 263/263 baseline
    - _Requirements: 4.1_

### Phase 3 — Guard, validate, delete

- [ ] 6. Static no-inline-copy guard
  - [ ] 6.1 Add a test/lint that fails if an eligibility module compares a live
    transport/connection state (or reads the `connection_state` column) to gate node
    usability NOT routed through the atom — incl. transport-ONLY checks. KEEP the
    column-read clause (it catches a new cached-column transport veto = the MODE-A
    mistake); discriminate a preserved cached-agreement conjunct (allowed only where
    it co-exists with an atom-routed live term) from a standalone cached veto.
    Exhaustive allowlist with rationale: projection `connectedNodeIds`/installed-view
    read; operational probes; rebalancer cached conjunct `:296-304`; readiness cached
    outer gates `:503,507-512` (backstopped by the live atom at `:529-530`)
    - File: `test/control-plane/no-inline-live-transport-copy.guard.test.js`
    - _Requirements: 2.6_

- [ ] 7. Operational-probe non-regression
  - [ ] 7.1 Assert the remove-safety ping, recovery-unblock ping, and split-brain
    routing modules do NOT import/call `hasLiveTransportEvidence`
    - File: `test/control-plane/operational-probes-not-routed.guard.test.js`
    - _Requirements: 3.1_

- [ ] 8. Controlled live A/B (backstop, per hot-path rule)
  - [ ] 8.1 Run 2-pre/2-post affinity-demo A/B with all sites switched; assert 0
    durability-unfit both arms and no churn amplification. Backstop only — the change
    is an all-no-op DRY, so Task 2 characterization + Task 5.3 regression are binding
    - _Requirements: 4.3_

- [ ] 9. Delete inline checks and flags (no lingering flags)
  - [ ] 9.1 After parity, delete the three inline live-transport checks (incl. the
    a79b3728 block), remove the migration flags; retain `isNodeTransportConnected` /
    `getNodeTransportState` only for genuine non-eligibility callers
    - _Requirements: 4.4_

## Explicitly NOT in this plan (Requirement 5 boundary)
- The membership projection is NOT rerouted (consensus-installed transport source,
  no live router — R2.4); its 60 s window and conjunctive retention are untouched.
- The rebalancer cached-agreement conjunct (`:296-305`) is untouched.
- Windows are NOT unified (30 s readiness / 60 s projection preserved).
- No change to transport ACK-quarantine teardown (P1), placement-retry /
  CONVERGENCE_GRACE / transient-shortfall (P3, P5), the repair-rate cooldown ladder
  (P4), or `membershipFreeze` / the self-move-quorum interlock (aggregate safety-hold).
- No change to the remove-safety ping, recovery-unblock ping, or split-brain routing
  envelope (operational probes).
- No FD protocol (SWIM/Lifeguard) change and no change to the SWIM-alive projection
  refutation — the SWIM verdict is not an atom input.
