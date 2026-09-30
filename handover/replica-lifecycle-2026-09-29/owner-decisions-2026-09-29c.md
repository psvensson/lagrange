# Owner decisions 2026-09-29 (round 4, BINDING) — final bounded round before freeze

Both gaps violate one invariant: work belonging to incarnation/generation G1 must never mutate, withdraw or retire G2 merely because the logical name was reused. Scope is EXACTLY: (1) endpoint incarnation ownership; (2) process-local Raft runtime generation ownership. No other refactoring (readiness, cache, membership, transport) unless one of these cannot be correct otherwise. Previously classified lab reds stay classified unless these changes alter their mechanism or rate.

## Decision 1 — endpoint rows (node_endpoints, service_endpoints): fix in this epic
Invariant: an endpoint belongs to one exact node boot incarnation; an operation for G1 may not withdraw, replace or invalidate endpoint state owned by G2. No check-then-act (check NODES incarnation, then DELETE WHERE node_id).
- Registration writes the authoritative boot_incarnation with the endpoint row.
- Withdrawal/reaping fences the endpoint mutation itself (DELETE ... WHERE node_id=? AND boot_incarnation=?, or the existing owner's equivalent). If service endpoints are keyed by a service key, the exact incarnation still participates in the destructive predicate.
- Readers: census endpoint consumers. A G1 endpoint must not become routable because a G2 NODES row exists with the same node id. Prefer ONE authoritative endpoint-validity rule (endpoint incarnation == current authoritative node incarnation) at the existing endpoint owner/projection, not ad-hoc checks per consumer. A stale endpoint may linger for cleanup but may not be advertised or used as current.
- Lost result (D3 rule): exact-incarnation delete succeeds -> done; unknown -> reread; G1 gone -> done; G2 present -> classify stale, do not retry against G2. No retry queue.
- Permanent tests (each red if the incarnation predicate is removed): register G1 endpoint; delay G1 withdrawal; register G2 node + G2 endpoint; deliver G1 withdrawal; G2 NODES row and G2 endpoint unchanged. Also: G1 reap after G2 registration; lost G1 endpoint-delete ack; stale G1 endpoint row cannot route when NODES says G2.
- Schema: the repository's normal schema-evolution path. No wildcard meaning for a missing incarnation that lets old rows delete current rows; legacy rows without incarnation are fail-closed or reconciled against authoritative NODES under an existing safe migration contract. If this needs a broad endpoint-storage redesign: STOP and report.

## Decision 2 — generation-key the process-local Raft lifecycle registry now
The registry is an authority over destructive runtime effects; caller-side durable checks are insufficient while it is keyed (group, replica). Use the EXISTING authoritative lifecycle generation; no new generation system. Identity becomes (group, replica, lifecycle_generation) or equivalent.
- Registration under the exact generation; G2 registration must not overwrite, alias, or become the target of G1 callbacks.
- Shutdown, retirement, removal and delayed callbacks carry the exact generation they target. G1 action: finds G1 -> act; G1 absent -> idempotent/stale; only G2 -> stale-generation result. NEVER "G1 not found -> current (group, replica) -> retire G2".
- If callers genuinely need "current runtime for this logical replica", keep that as an explicit, separately named semantic operation; exact-generation operations never use a current lookup underneath; no optional generation parameters letting callers choose implicitly.
- Tests (red if the generation component is removed): register G1; initiate G1 retirement/removal; delay its runtime callback; recreate as G2 and register; deliver G1 callback -> G2 registered and running. Also duplicate G1 callback; delayed G1 shutdown completion; G1 removal after G2 registration; old G1 registry debt/work item after G2 exists.
- Cleanup removes only the exact generation entry it owns (never delete registry[group, replica]); no leaks of old entries.
- Process restart: no durable registry state unless the architecture already requires it; durable lifecycle state recreates the right generation through the existing recovery owner; the registry is an ephemeral exact-generation projection.
- STOP condition: split as prerequisite quest raft-lifecycle-registry-generation (blocks freeze) if correctness requires changing the Raft operation-only public seam, wire/transport identity, committed Raft membership semantics, durable storage format for registry state, or a broad runtime addressing model. Do not weaken the invariant to avoid splitting.

## Testing before freeze (do not rerun all 1,610 after every edit)
Narrow first. Endpoint cone: registration, withdrawal, failed-join cleanup, stranded-JOINING reap, endpoint projection/routing. Registry cone: remove/recreate, shutdown/restart lifecycle, d2 real-group fixture, exact-generation lifecycle suite, delayed callback/debt tests.
Cross-owner anchor (most valuable): G1 node + G1 runtime + endpoints -> delayed teardown -> G2 with the same logical ids -> G1 work resumes -> NODES G2, endpoint G2 and Raft runtime G2 all survive.
Then static/guideline checks, census updates, and ONE full change-selected lab run after the tree is stable.

## Permanent censuses
Endpoint writer census (per writer/destructor): owner; operation; logical identity; incarnation source; destructive predicate; lost-outcome handling; privileged-repair exception if any.
Raft registry operation census (register, exact lookup, current lookup, remove, shutdown, retire, delayed callback): exact-generation or intentionally current-generation. No destructive current-generation operation reachable from stale lifecycle work.

## Fixture inventory
Extend only for fixtures materially changed by these two repairs: what authority production requires; which exact incarnation/generation the fixture now supplies; why that is fidelity, not accommodation. No new giant prose record for unchanged fixtures.

## Invariants to add to the quest record (lead writes them)
I9 node-incarnation projection authority: NODES and endpoint projections for G1 cannot mutate, withdraw or masquerade as G2.
I10 runtime-generation authority: process-local runtime effects for lifecycle generation G1 cannot target G2 through logical-id reuse.

## After this round (lead runs): hard freeze
stop writer permanently; refresh I1-I10; regenerate NODES/endpoints/SERVICES/registry destructive censuses; metadata refresh twice; owner-debt refresh; full static/ratchets; complete focused cone; change-selected lab once; freeze exact bytes; fresh Opus 5.5 verifier attacking "reuse of a logical node, endpoint, group or replica identity never lets delayed work from an older incarnation/generation affect the newer owner" across NODES, endpoints, durable replica lifecycle and the Raft registry together — strongest mutant: G1 teardown starts at every layer -> G2 fully recreated -> all delayed G1 effects released -> every G2 artifact survives. Then the 14-step closure.
