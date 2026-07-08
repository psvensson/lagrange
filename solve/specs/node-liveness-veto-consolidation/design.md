# Design Document: Node-Liveness Veto Consolidation

## Overview

Three eligibility sites independently compute the *same* fact — *"is the LIVE
router state connected?"* (`messageRouter.getConnectionState(nodeId) === CONNECTED`)
— via three different code snippets with inconsistent normalization. Extract that
fact into one pure helper `hasLiveTransportEvidence` and route those three sites
through it. This is a **pure no-op DRY** (every in-scope site is already live-strict)
plus a static guard so no future eligibility site regresses to the CDC-lagged
`connection_state` **cache column** — the exact mistake `isClusterMemberHealthy`
made before `a79b3728`. It shares only the transport atom; it does not unify
windows or compositions, does not re-plumb the consensus-installed projection, and
does not touch operational probes, the FD protocol, or adjacent primitives.

### Why the atom, not a monolithic predicate (review history)

Draft 1 proposed one disjunctive predicate for all consumers; adversarial review
killed it (the consumers compute different compositions; a swimVerdict input was
absent at 2 sites). Draft 2 shared the atom but mis-stated the per-consumer facts;
a second review corrected them. This is the fact-checked draft.

### Verified per-consumer facts (the crux — all in-scope sites are ALREADY live-strict)

| Site | file:line | Current transport term | Atom effect |
|---|---|---|---|
| readiness `isClusterMemberHealthy` (a79b3728 veto) | `control-plane-readiness-node-service-rows.js:529-530` | `getNodeTransportState().routerState === CONNECTED` (live; `\|\| READY` inert; lowercased at `:413-415`) | **pure no-op** |
| lease-sweep `isNodeTransportConnected` | `lease-service.js:278-289` | `getConnectionState(nodeId).toLowerCase() === CONNECTED` (live, direct; `\|\| READY` inert) | **pure no-op** |
| rebalancer `available-nodes` — LIVE term only | `unified-rebalancer-available-nodes.js:306-312` | `getConnectionState(nodeId) !== CONNECTED → reject` (live; NOT lowercased) | **no-op** (atom normalizes → same-or-safer) |

- Composition preserved at each: readiness keeps `freshHeartbeat(30 s) ∨ atom` after
  its `:503`/`:510` outer gates; lease-sweep keeps transport-only over lease-expired
  rows; the rebalancer keeps its **cached conjunct** (`:296-305`, `connection_state ∈
  {connected,ready}`) — the atom replaces ONLY the live term `:306-312`.
- The three snippets differ only in normalization (two lowercase, the rebalancer does
  not). The atom lowercases (matching readiness/lease-sweep); folding the rebalancer's
  non-normalized live term into it is a no-op if `getConnectionState` returns
  consistent case, and strictly safer otherwise — pinned by the characterization test.

### The atom

```
// pure; only I/O is the injected router accessor
hasLiveTransportEvidence(nodeId, {messageRouter}) -> boolean
  if (!messageRouter || typeof messageRouter.getConnectionState !== 'function') return false
  return String(messageRouter.getConnectionState(nodeId) || '').toLowerCase()
           === CONNECTION_STATE.CONNECTED
```

- **Live router only** (R1.1, R1.2): never the `nodes`-row `connection_state`
  column, and never the `getNodeTransportState().connected` composite (which folds
  in the cached rowState fallback). This is the `a79b3728` choice (`.routerState`,
  not `.connected`).
- **Normalized** (lowercase) to match the existing sites (`:284-286`, `:413-415`).
- Compares `CONNECTED` only (R1.3) — the live transport state machine has no `ready`
  (`src/constants/transport.js` CONNECTION_STATE = {disconnected, connecting,
  connected, reconnecting, closed}); the inert `|| READY` in the current sites is
  dropped.
- No teardown (R1.4); missing/throwing router → false (fails closed).

**No behavior change (all in-scope sites are no-op), and windows are NOT unified**
(R2.5) — the 30 s readiness and 60 s projection windows stay; window drift did not
cause MODE-A (195 s exceeded both). The atom carries no window.

## Architecture

### Component Ownership Map

| Component | Owner | Responsibility |
|---|---|---|
| `hasLiveTransportEvidence` | **new** shared helper (`src/control-plane/live-transport-evidence.js` or a shared transport mixin method) | the one normalized live-router-CONNECTED atom |
| readiness veto | edit `control-plane-readiness-node-service-rows.js:529-530` | atom call (no-op) |
| lease-sweep guard | edit `lease-service.js:278-289` | atom call (no-op) |
| rebalancer live term | edit `unified-rebalancer-available-nodes.js:306-312` | atom call (no-op); cached conjunct `:296-305` unchanged |
| static guard | **new** test/lint | fail on any eligibility live-transport comparison not routed through the atom |

### Dependency direction (acyclic — verified)

The atom takes `(nodeId, {messageRouter})` → bool from live router state only; reads
no projection output, readiness dimension, or provisioning eligibility → no new
edge. It sidesteps the epic C3 projection↔provisioning cycle
(`active-node-projection.js:190-226`) entirely, so this spec **explicitly overrides**
the epic directive "do not re-point `isClusterMemberHealthy` before cutting the
cycle": that directive targeted a graded membership-state authority; a raw-evidence
transport atom needs no cut (both reviews confirmed acyclicity).

## Non-Goals (the "no fewer than correct" boundary — R5, with merge/exclude proofs)

| Not merged / excluded | Proof |
|---|---|
| **Membership projection transport evidence** (`active-node-projection.js:163-184` `hasRuntimeTransportEvidence`) | reads injected `connectedNodeIds` Set + readiness-derived `nodeEvidence.transportConnected` (`:362` = the permissive `.connected` composite) — a **consensus-installed / already-single-owner** source with **no `messageRouter` in scope**. Rerouting it to the local live router would change the installed view's semantics (the prior audit protects this) and is mechanically impossible without threading a router into a pure function. **Deliberately excluded** — its more-lenient installed-view transport source is an intentional layer difference, not a fragmentation bug. |
| **Rebalancer cached conjunct** (`unified-rebalancer-available-nodes.js:296-305`) | a separate cached-agreement gate, not the transport veto atom; stays. |
| **DDL provisioning target selection** (`query/sql-query-engine-provisioning-methods.js` `connectionEligible` from cached `connection_state`) | a cache-only consumer with NO live `messageRouter` in scope — structurally identical to the projection; cannot route through the atom without threading in a live router. Excluded on the same grounds, documented in the guard's excluded list. **Future-work note:** it is a latent MODE-A shape (a stale cached `connection_state` can wrongly exclude a live node); a proper fix (live router + atom) is a behavior change, out of this no-op DRY's scope. (Found by the implementation-verification pass.) |
| **P1 transport teardown** (`src/transport/message-router-reconnect-behaviors.js` ~`:555-607`+) | a read-only atom cannot own a socket action; transport must not import control-plane. |
| **P3 placement-retry / purgatory** (`sql-query-engine-initial-partition-provisioning.js:707`) | merging retry into liveness IS MODE-A (a flap cancels in-flight placement). |
| **P4 repair-rate ladder** (`authoritative-node-evidence-reconciler.js:680-689`, outcome-tiered) | folding in re-creates "9 repairs in 4 s → event-loop starvation". |
| **P5 phase grace** (`CONVERGENCE_GRACE`) | single-forming-entity lifecycle suppression; different signal domain. |
| **Aggregate freeze / interlock** (`membershipFreeze`, self-move interlock) | aggregate circuit-breaker — inverse logic to per-node trust. |
| **SWIM verdict / FD protocol / SWIM-alive refute** (`active-node-projection.js:389-398`) | `swimVerdict` is not in scope at readiness/lease-sweep (grep-empty) and is not an atom input; untouched. |
| **Operational probes** (remove-safety ping, recovery-unblock ping, split-brain routing) | need live-now reachability, not the shared eligibility atom; prior audit #4/#5/#9. |

## Components and Interfaces

### 1. `hasLiveTransportEvidence(nodeId, {messageRouter})`
Pure, normalized, fails closed. Unit-tested over the router-state cross-product incl.
case variants and missing router.

### 2. readiness veto (`control-plane-readiness-node-service-rows.js:529-530`)
Replace `const {routerState}=getNodeTransportState(...); return routerState===CONNECTED||routerState===READY;`
with `return hasLiveTransportEvidence(nodeId, {messageRouter: this.messageRouter});`.
No-op. `isRecentHeartbeat` disjunct (:514) + 30 s window unchanged.

### 3. lease-sweep (`lease-service.js:278-289`)
`isNodeTransportConnected(nodeId)` body becomes the atom call (or the sweep guard at
`:203` calls the atom directly). No-op.

### 4. rebalancer live term (`unified-rebalancer-available-nodes.js:306-312`)
Replace the live `getConnectionState(nodeId) !== CONNECTED` check with the atom;
keep the cached conjunct (`:296-305`) and surrounding placement gates. No-op.

### 5. static guard
Test/lint failing on any eligibility live-transport comparison
(`getConnectionState(...) === CONNECTED`, or a `connection_state`-column read used to
gate node usability) NOT routed through the atom — catches transport-only checks
too (R2.6). The `connection_state`-column clause is deliberately KEPT (a new
cached-column transport veto is the original MODE-A mistake), so every
intentionally-preserved cached gate must be **explicitly allowlisted with a
rationale**, and the guard discriminates a preserved *cached-agreement conjunct*
(allowed only where it co-exists with an atom-routed live term) from a *standalone
cached transport veto* (forbidden). Allowlist (exhaustive):
- projection `active-node-projection.js` `connectedNodeIds` / `nodeEvidence.transportConnected`
  installed-view read (excluded consumer, R2.4);
- operational probes (remove-safety, recovery-unblock, split-brain routing, R3.1);
- rebalancer cached conjunct `unified-rebalancer-available-nodes.js:296-304`
  (co-exists with the atom-routed live term `:306-312`);
- readiness cached outer gates `control-plane-readiness-node-service-rows.js:503,507-512`
  (the `getNodeTransportState().connected` composite / `connection_state===READY`),
  which co-exist with the atom-routed live veto at `:529-530` and are backstopped by
  it — permissive but not a MODE-A recurrence (the stale-heartbeat branch is graced
  by the LIVE atom, not the cached gate).

### 6. operational-probe non-regression test
Assert the remove-safety ping, recovery-unblock ping, and split-brain routing
modules do NOT import/call `hasLiveTransportEvidence` (R3.1).

## Data Models
No schema changes; one new shared function; no new constants (window-free atom).
`CLUSTER_MEMBER_STALE_HEARTBEAT_MAX_AGE_MS` (30 s) and `ACTIVE_NODE_HEARTBEAT_GRACE_MS`
(60 s) UNCHANGED.

## Validation Strategy
1. **Characterization (R4.1, binding gate):** pin the atom's value == each in-scope
   site's current live-transport term across the router-state cross-product incl.
   case; confirm each is a no-op (the safety of the normalization fold is the only
   thing that could differ, and is pinned here).
2. **Red-on-revert (R4.2):** the MODE-A condition at readiness (live CONNECTED +
   stale heartbeat → healthy); a transport-severed condition at each site → excluded.
3. **Static guard (R2.6) + operational-probe test (R3.1)** green.
4. **Regression sweep** across readiness, lease-sweep, rebalancer-availability suites
   (projection unaffected — excluded).
5. **Controlled live A/B (R4.3, secondary):** 2-pre/2-post affinity-demo; 0
   durability-unfit, no amplification. Since the change is an all-no-op DRY, the
   characterization + regression suites are the binding gates; the A/B is a backstop.
6. **Flag-then-delete (R4.4):** each inline check behind a flag until parity, then
   deleted; the a79b3728 comparison becomes the atom call.
