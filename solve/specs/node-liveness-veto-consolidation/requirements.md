# Requirements Document: Node-Liveness Veto Consolidation

## Introduction

Multiple *eligibility* consumers independently decide whether a node with a stale
secondary signal (heartbeat / ready-lease) should still be trusted because its
**transport is live** — the "slow, not dead" grace. The MODE-A production bug
(`a79b3728`, service-data-affinity phase-4 strand) was a direct symptom: the
lease-sweep applied a live-transport veto, but `isClusterMemberHealthy` — the
consumer that gated provisioning and up-replication — did **not**; it fell through
to a heartbeat-freshness check that failed when a coordinator's own heartbeat
*ingestion* lagged ~195 s, so it saw healthy peers as stale, zeroed the eligible
set, and stranded a data table at 1/3. The fix added the veto inline at that one
site — a **fifth** independent transport check, each site free to use the *cached*
connection state instead of the *live* router (the exact mistake `isClusterMemberHealthy`
made before `a79b3728`).

This feature makes that bug class **structurally impossible** by defining the
single atomic fact every such site depends on — *"is the LIVE router state
connected (not the CDC-lagged cache)?"* — **once**, as a shared pure helper
(`hasLiveTransportEvidence`), and requiring every eligibility consumer's transport
veto to read it. It does **not** merge the consumers' differing compositions or
windows (they legitimately differ — §Non-Goals), does **not** re-consolidate the
already-single-owner membership projection, and does **not** touch the local
real-time operational probes or the failure-detector protocol.

**Correction to the epic framing:** window drift (30 s readiness vs 60 s
projection) did **not** cause MODE-A — the 195 s staleness exceeded *both* windows.
The root was the *absence of a live-transport veto* at one consumer. Therefore this
spec consolidates the **transport-evidence atom**, not the windows; unifying
windows is out of scope (it would be a behavior change, not a DRY refactor).

**Scope discipline (prior art):**
`solve/specs/membership-lifecycle-placement-hard-cutover/failure-detector-consolidation-scope.md`
(2026-06-21) established that the control-plane FD is already a single owner
(`resolveProjectedActiveNodeSelection`), and that the ~9–10 external transport
probes are **not** a clean fold — most are local operational gates whose semantics
would regress under a slower installed view. This spec targets **only** the subset
that (a) makes an eligibility decision (placement/serve/membership retention) AND
(b) applies a **transport veto over a stale secondary signal**. It shares the
transport atom across those; it does not reroute the operational probes.

## Glossary

- **Live_Transport_Evidence**: The single shared atom
  `hasLiveTransportEvidence(nodeId, evidence) → boolean` — true iff the **live**
  in-memory `messageRouter.getConnectionState(nodeId)` reports the peer reachable
  (`CONNECTED`), NEVER the CDC-lagged `nodes`-row `connection_state` column. The
  one authoritative definition of "transport-alive," immune to Ingest_Lag.
- **Eligibility_Consumer**: A site that decides whether a node is usable for
  placement/serve/membership, is safe to serve from the consensus-installed /
  shared view, and applies a LIVE-transport check over a stale secondary signal.
  In scope (all three already live-strict): `isClusterMemberHealthy` (readiness),
  the lease-sweep transport guard, and the rebalancer `available-nodes`
  placement-gate LIVE term. The membership projection is **excluded**
  (consensus-installed transport source, no live router — see Requirement 2.4).
- **Consumer_Composition**: The site-specific boolean the atom is embedded in —
  transport-only (lease-sweep), disjunctive veto (readiness: `freshHeartbeat ∨
  transportAlive`), or a placement gate with a cached conjunct (rebalancer).
  **Preserved per site** — this spec shares the transport atom inside these, it
  does not unify them.
- **Operational_Probe**: A site needing *live-right-now* reachability for a
  specific lease/op/route (remove-safety quorum ping, recovery-unblock ping,
  split-brain routing envelope). **Out of scope** — keeps its local probe.
- **Ingest_Lag**: The MODE-A root — a node's own CDC ingestion of `nodes`-row
  heartbeats/connection-state lags, so its *cached* view of peers is stale though
  the peers are live. `hasLiveTransportEvidence` resolves this by reading the live
  router, never the cache.
- **Membership_Projection**: `active-node-projection.js` /
  `resolveProjectedActiveNodeSelection` — the already-consolidated single-owner
  active-set detector. Not re-architected here.

## Requirements

### Requirement 1: Single Live-Transport-Evidence Atom

**User Story:** As a maintainer, I want "is this node's transport live" defined
exactly once, reading the live router and never the cached column, so no consumer
can silently regress to the CDC-lagged cache the way `isClusterMemberHealthy` did
before `a79b3728`.

#### Acceptance Criteria

1. THE Live_Transport_Evidence atom SHALL be a single pure function that returns
   whether the LIVE `messageRouter` connection state for a node is `CONNECTED`,
   with NO I/O beyond the injected router accessor and NO dependency on any
   Eligibility_Consumer.
2. THE Live_Transport_Evidence atom SHALL read the live router state only; it
   SHALL NOT consult the `nodes`-row `connection_state` column (the rowState
   fallback), so a peer whose cached row is stale but whose live router is absent
   returns false (fails closed).
3. THE Live_Transport_Evidence atom SHALL compare against the transport
   `CONNECTION_STATE.CONNECTED` value (the live transport state machine has no
   `ready` state), consistent with the shipped `a79b3728` fix.
4. THE Live_Transport_Evidence atom SHALL NOT itself tear down connections; a peer
   the transport ACK-timeout quarantine has severed (live router no longer
   `CONNECTED`) SHALL return false.

### Requirement 2: Eligibility Consumers Share the Atom (Compositions Preserved)

**User Story:** As a maintainer, I want each eligibility consumer's transport
veto to read the one atom while keeping its own composition and window, so the
"grace missing/inconsistent at one consumer" class cannot recur without unifying
policies that legitimately differ.

#### Acceptance Criteria

1. WHEN `isClusterMemberHealthy` applies the stale-heartbeat transport veto (the
   `a79b3728` grace), it SHALL evaluate the transport term via
   Live_Transport_Evidence, and its disjunctive composition
   (`freshHeartbeat ∨ transportAlive`) and its 30 s heartbeat window SHALL be
   preserved.
2. WHEN the lease-sweep decides whether to write a lease-expiry disconnect, it
   SHALL evaluate the transport term via Live_Transport_Evidence, preserving its
   transport-only composition over already-lease-expired rows.
3. WHEN the rebalancer `available-nodes` gate applies its LIVE transport check
   (`getConnectionState(nodeId) !== CONNECTED`), it SHALL evaluate that term via
   Live_Transport_Evidence; its separate cached-agreement conjunct
   (`connection_state ∈ {connected,ready}`) SHALL be preserved unchanged (it is a
   distinct gate, not the transport veto atom).
4. THE Membership_Projection SHALL NOT be routed through Live_Transport_Evidence:
   its transport evidence is a consensus-installed / injected source
   (`connectedNodeIds` + readiness-derived `nodeEvidence.transportConnected`) with
   no live `messageRouter` in scope, and rerouting it to the local live router
   would change the already-single-owner installed view. Its deliberately
   more-lenient installed-view transport source is an intentional layer difference
   and is out of scope (see Requirement 3).
5. THE spec SHALL NOT unify the per-consumer secondary-signal windows (30 s vs
   60 s) or compositions; each Consumer_Composition SHALL be preserved, and only
   the transport atom is shared.
6. A static check (test or lint) SHALL fail if an eligibility site compares a
   transport/connection state — or reads the `connection_state` cache column — to
   gate node usability WITHOUT routing through Live_Transport_Evidence, including
   transport-only checks (so a rebalancer- or lease-style inline
   `getConnectionState(...)===CONNECTED` is caught, not only heartbeat-adjacent
   ones). THE check SHALL keep the cache-column clause (a new cached-column
   transport veto is the MODE-A mistake) and SHALL exhaustively allowlist every
   intentionally-preserved cached-agreement conjunct with a rationale, permitting a
   cached conjunct only where it co-exists with an atom-routed live term.

### Requirement 3: Operational Probes and Adjacent Primitives Excluded

**User Story:** As a cluster operator, I want the local real-time operational
gates and the adjacent hysteresis primitives left untouched, so consolidation
does not regress a safety check or merge concerns that must stay distinct.

#### Acceptance Criteria

1. THE remove-safety quorum ping, the recovery-unblock ping, and the split-brain
   routing envelope SHALL NOT be routed through Live_Transport_Evidence or the
   installed membership view, and the design SHALL record the correctness reason
   for each exclusion. A test SHALL assert these sites do not import/call the atom.
2. THE failure-detector protocol (SWIM probe/suspect/confirm, Lifeguard
   local-health) and the SWIM-alive projection refutation SHALL NOT be changed;
   the SWIM verdict is NOT an input to the shared atom (it is not in scope at
   readiness or lease-sweep) and remains where it is today (the projection).
3. THE consolidation SHALL NOT alter `membershipFreeze` or the self-move /
   quorum-concentration interlock (distinct aggregate safety-hold primitive), the
   transport-teardown action (P1), the placement-retry / purgatory (P3), the
   corrective-action rate-limiter (P4), or the lifecycle/phase grace (P5); the
   design SHALL cite the merge-forbidden proof for each.

### Requirement 4: Behavior Parity and No Regression

**User Story:** As a maintainer, I want the atom substitution to be a provable
no-op on behavior, so I can ship it safely on a hot path.

#### Acceptance Criteria

1. FOR each in-scope site, a characterization test SHALL pin that the atom
   substitution is a **pure no-op** — each site (readiness `:529-530`, lease-sweep
   `:278-289`, rebalancer live term `:306-312`) already computes live
   `getConnectionState === CONNECTED`, differing only in normalization; the test
   SHALL cover case variants so the atom's lowercasing fold is proven same-or-safer.
   This characterization SHALL be the binding parity gate (the affinity-demo A/B is
   a weak MODE-A guard because MODE-B gates most runs).
2. WHEN the atom replaces an inline check at a consumer, THE change SHALL be
   proven red-on-revert by a deterministic test constructing the MODE-A condition
   (live router CONNECTED + `last_heartbeat` older than the consumer's window →
   stays eligible) where the consumer applies the veto.
3. THE consolidation SHALL be validated by a 2-pre/2-post controlled live
   affinity-demo A/B showing zero durability-unfit and no load amplification in
   either arm, per the hot-path-fix rule (`692c9dbb`), as a SECONDARY guard.
4. WHEN a consumer is switched, THE old inline transport check SHALL remain behind
   a flag until per-consumer parity holds, then be deleted (no lingering flags);
   the `a79b3728` inline live-router comparison SHALL become an atom call, not a
   duplicate.

### Requirement 5: Scope Boundary (No Fewer Than Correct)

**User Story:** As a maintainer, I want the consolidation bounded to the transport
atom of primitive P2 so it does not merge concerns that must stay distinct.

#### Acceptance Criteria

1. THE feature SHALL share ONLY the Live_Transport_Evidence atom and SHALL NOT
   merge the consumers' compositions, windows, secondary-signal semantics, or any
   of P1 (teardown), P3 (placement-retry), P4 (rate-limiter), P5 (phase-grace).
2. THE design SHALL cite the merge-forbidden proof for each adjacent primitive it
   declines to absorb, so the "no fewer than correct" boundary is explicit.
