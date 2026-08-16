---
id: publication-readiness-churn-liveness-closure
roadmapRow: RM-0.2-five-node-convergence
status: proposed
graduatesTo: null
---

# Plan: close readiness churn starvation as a coupled contract

## Decision

Treat the current MovieLens failure as one coupled owner-boundary defect, not as
another list of hot call sites:

1. readiness and publication decisions must observe semantically current
   node/service/partition/publication evidence;
2. raw cache-event cadence must not determine heavy projection-build cadence;
3. readiness-internal authoritative reads must not re-enter the full readiness
   path through query routing; and
4. continuous recovery churn must leave a macrotask boundary for timers and Raft
   heartbeats before the election ceiling.

The implementation must satisfy all four together. Reverting the July
cluster-wide invalidation is forbidden: it fixed a real remote-replica inventory
staleness defect. Raising election/readiness budgets is also forbidden.

## Current evidence and inherited work

- Source-bound GCP run `2026-08-14T10:59:49Z` failed at 1/5 ACTIVE and 2/5
  publication coverage. The seed emitted 228,419 publication-gate builds and
  102,299 planning builds across 146,255 ms of gaps; two turns lasted about 62
  and 66 seconds.
- Retained V8 windows name `getNodeReadinessSync` at 20,956/22,688 ms and
  authoritative system-table/owner-RPC routing at about 11-12 seconds.
- The preceding Raft fix holds: the source-bound baseline measured only 128 ms
  total Raft slice time, 22 ms maximum.
- CL-012 already identified the readiness-routing-authoritative-read cycle. Its
  phase-1 fix removed eager/local cycle edges but deliberately retained the
  owner-RPC `executeOnPartition -> routing -> readiness` edge.
- CL-033/034 memo guards prove reuse only while a planning source revision is
  stable. Current recovery continuously advances that revision for
  publications, nodes, services, and partitions, so the guard premise can be
  false throughout the exact window it claims to protect.
- The June WS4 bounded-stale synchronous serve was implemented but never
  engaged in its small validation sample, remained default-off, and was later
  deleted. Its design is prior art, not a patch to restore without a new safety
  proof.
- The uncommitted successor-Quest changes are retained as evidence-backed local
  reductions: service-event enqueue-only readiness, queued publication advance,
  and one operation-creation gate per rebalancer planning pass. They are not the
  systemic fix. The latest GCP run proves the dominant cadence remains.
- `OwnerKeyReconcileQueue` schedules drains with Promise microtasks. New
  readiness work must not assume that queueing alone yields the event loop.

## Owned end-state

Introduce one versioned readiness-planning snapshot owner inside the existing
`ControlPlaneReadinessService` boundary. It owns the transition from a complete
semantic input token to an immutable completed planning projection.

The token is not the existing four-table source revision. Before implementation,
inventory every input read by the unchanged readiness and membership-publication
builders and register it as either versioned input or a positive-decision live
veto. The minimum versioned set is cache identity/generation; membership-owner
generation; per-table revisions for `NODES`, `NODE_ENDPOINTS`, `SERVICES`,
`PARTITIONS`, `REPLICA_OPERATIONS`, and `CONTROL_PLANE_PUBLICATIONS`; readiness
snapshot generation; recovery-epoch-history revision; and connected-node
transport-topology generation. Clock-derived expiry, current transport health,
and any other deliberately unversioned input require an explicit cheap live
veto and next-validity deadline. A guard fails if a builder reads an input not
declared in this dependency registry. Cache or owner replacement always changes
generation even when its per-table counters match the prior instance.

The owner has these semantics:

- Each registered semantic input change records the latest token and marks the
  owner dirty. It does not synchronously build readiness.
- Dirty events coalesce by publisher/cluster owner key. There is at most one
  active build and one pending latest-vector rebuild for that key.
- Across all owner keys, a drain executes exactly one heavy item and then yields
  through an injectable `setImmediate`-class macrotask scheduler. Dirty keys are
  served round-robin, so five publisher keys cannot cause five heavy builds in
  one turn and a persistently dirty key is selected within one cycle of the
  dirty-key set. If a newer token arrives during a build, the completed
  projection is published with its captured token and exactly one later
  macrotask is scheduled. It never spins through a Promise/microtask chain.
- The sync readiness API continues to return synchronously. It consumes the
  latest completed immutable projection plus cheap live vetoes. It never starts
  an unbounded heavy rebuild cascade.
- Immediately before snapshot publication, recapture the semantic token; a
  mismatch marks the result stale and schedules a later build. Immediately
  before every positive readiness, routing, mutation, owner-progress, or
  publication decision, compare the completed token with the current token and
  run every registered live veto. A mismatch or failed veto cannot produce a
  positive result: it yields an explicit stale/deferred negative and schedules
  refresh. Exact/current and already-negative decisions remain byte-identical.
- Cold start, where no completed projection exists, gets one explicitly bounded
  bootstrap build. If measurement shows a single cold build can itself approach
  the election ceiling, move that build to a worker and keep the sync path
  conservatively deferred. Do not introduce a worker unless the single-build
  discriminator requires it.

This separates correctness freshness from raw event count. After input
quiescence, the final token must be completed and published. Under continuous
churn, completed token publication continues monotonically, every persistently
dirty owner gets a build opportunity within one round-robin cycle (assuming a
build terminates), timers advance between items, and intermediate tokens may be
coalesced. The contract does not require an impossible terminal "latest" token
while input changes forever.

## Required non-recursive read contract

Add an explicit structural purpose to the existing control-plane read-authority
token for readiness-internal reads. That purpose must propagate through CDC
authoritative reads and query delivery.

- Ordinary owner reads keep their current readiness repair and routing policy.
- A readiness-internal owner read may use a local authoritative replica, or a
  minimal owner/transport route that does not call full node readiness.
- If neither route is safely available, return the existing typed deferred/read
  unavailable result and register an independently driven topology, cache, or
  owner-change wake-up. A deferred bootstrap may not depend on readiness itself
  to be retried. Never bypass ownership, invent readiness, or turn a read
  failure into positive evidence.
- A deterministic recursion-depth guard must prove that a readiness-internal
  authoritative read cannot call `getNodeReadinessSync` before completing.
- Before the snapshot owner is enabled, enumerate every table and non-table
  input its cold build needs and prove either a readiness-independent
  authoritative route or a readiness-independent wake-up that makes that route
  available. An input with neither is a blocking design error, not an allowed
  indefinite defer.

The exact route is selected only after caller-edge attribution proves which
owner-read call sites occur in the long windows. The contract itself is not
optional because the existing fallback edge is a known amplification cycle.

## Execution sequence

### Phase 0 — preserve and separate the current work

1. Do not discard or amend the existing uncommitted files.
2. Capture their exact binary diff as a content-addressed artifact and verify its
   digest before any successor attempt.
3. Create a separate clean worktree at committed source HEAD
   `5a4720f780a93fa75674447e47398475d4029b5a`. Apply only the reviewed plan/Quest
   metadata there and start the successor from that clean runtime baseline.
4. Record the inherited artifact digest in the Quest, but do not apply any of
   its source paths until the Phase-1 systemic guard is red. Applying it begins
   a new explicitly attributed successor attempt.

Exit: clean ownership of the new Quest and a recorded inherited-diff identity.

### Phase 1 — name the outer caller and establish a red production seam

1. Extend the event-loop profiler report with aggregated caller edges/call paths
   around `getNodeReadinessSync`, `executeAuthoritativeSystemTableRead`, and
   `executeAuthoritativeOwnerRpcRead`. Use V8 profile nodes; do not capture an
   Error stack or log per call on the hot path.
2. Add deterministic tests for edge aggregation and for discarded gap-free
   windows.
3. Build a production-composition mutation-storm regression using the real
   cache listener, readiness service, query routing, and owner-RPC seam. Drive
   alternating changes across all six registered tables, readiness snapshots,
   recovery epochs, transport topology, and cache/owner replacement while
   routing multiple service rows.
4. Record on current HEAD:
   - full readiness builds by captured semantic token, owner key, and event-loop
     turn;
   - projection/gate builds;
   - maximum readiness-internal owner-read recursion depth;
   - timer/heartbeat sentinel progress between drains; and
   - final decision equivalence against a one-shot fresh reference build over
     the final semantic token.

Exit: current HEAD is red for at least one systemic bound, and the live/profile
edge above the nested owner read is named. No runtime lever before this exit.

### Phase 2 — register the coupled invariants before fixing them

Add paired standing invariants and bind them through the coupled-pair registry:

1. `readiness-source-freshness-eventually-reflected`: after semantic-input
   quiescence the final token is eventually represented by a completed
   projection; during continuous churn completed tokens advance monotonically,
   persistently dirty owners receive bounded-round-robin service, and stale
   evidence never promotes readiness.
2. `readiness-heavy-work-turn-bounded`: continuous source revision churn causes
   at most one heavy planning build globally per macrotask turn and permits the
   timer sentinel to advance between every pair of heavy items.
3. `readiness-owner-read-non-amplifying`: a readiness-internal authoritative
   read has full-readiness recursion depth zero.

Extend a small TLA+ model with `InputChange`, `ScheduleBuild`, `CompleteBuild`,
`RouteRead`, `TimerTick`, and `PublishDecision`. Required mutants:

- raw-event invalidation immediately rebuilds per caller;
- a readiness-internal owner read re-enters readiness; and
- a build completed for an older token is treated as fresh-positive; and
- an undeclared dependency changes without invalidating or vetoing a positive
  decision.

Each mutant must violate liveness or safety while the selected design satisfies
quiescent latest-wins, monotonic and fair continuous-churn progress, no
stale-positive admission, globally bounded heavy work per turn, and recurring
timer progress.

Exit: model and deterministic guard are red on the current implementation and
the new pair is machine-enforced, closing the gold-plating coverage hole.

### Phase 3 — make queue scheduling genuinely yield

1. Add an explicit drain scheduling policy to the existing owner-key queue, or
   a smaller shared scheduler if queue ownership cannot remain coherent.
2. Preserve the current microtask policy as the default for existing consumers.
3. The readiness-planning owner selects an injectable `setImmediate`-class
   scheduler, global round-robin arbitration across keys, and a one-heavy-item
   drain budget. Re-enqueue during an active build schedules a later turn rather
   than recursively draining from `.finally()`.
4. Add virtual-time/scheduler tests proving:
   - burst coalescing keeps the latest context;
   - one active plus one pending latest item per key;
   - five or more dirty keys still execute only one global heavy item per turn
     and receive round-robin service;
   - timers run between repeated dirty drains;
   - shutdown cancels pending drains; and
   - retryable errors remain bounded and do not lose the latest vector.

Exit: the mutation-storm sentinel advances even with an indefinitely dirty
source, before readiness logic is changed.

### Phase 4 — establish the non-recursive bootstrap base

1. Inventory every cold-build table and non-table dependency from the Phase-1
   production caller edges and dependency registry.
2. Thread the readiness-internal read purpose through the existing structural
   read-authority token.
3. For every dependency, prove a local authoritative or minimal owner/transport
   route that never calls full readiness. Where the route is temporarily
   unavailable, bind retry to an independently driven topology, cache, or owner
   event and prove that event can occur without readiness becoming positive.
4. Preserve ordinary read routing and repair behavior byte-for-byte.
5. Add negative tests for missing local replica, disconnected owner, leader
   change, typed retry, attempted recursion, and a cold deferred read whose
   readiness-independent wake later makes progress.

Exit: recursion depth remains zero in the production-composition storm, every
cold dependency has a readiness-independent progress base, and ordinary
owner-read suites retain their existing outcomes.

### Phase 5 — land the versioned planning snapshot owner

1. Build the declared dependency registry and capture the complete semantic
   input token at build start.
2. Build the existing frozen CL-033/034 projection without changing its decision
   functions.
3. Recapture the token before publication, then publish
   `{projection, capturedToken, tokenStatus, completedAt, buildDuration,
   nextValidityDeadline}` atomically. A changed token sets `tokenStatus: stale`
   and cannot be used positively.
4. If changes landed during the build, retain the completed snapshot as stale
   evidence and schedule exactly one latest-vector follow-up.
5. Route sync readiness through the completed projection:
   - exact token plus passing live vetoes: current behavior;
   - stale token or failed veto: never return a stale-positive heavy
     dimension, return typed defer/negative and enqueue refresh;
   - absent vector: one bounded bootstrap path, measured separately.
6. Keep remote SERVICES/PARTITIONS changes globally relevant. Do not restore the
   pre-July stale-inventory window.

Exit: mutation-storm regression is green; final fresh decisions are identical;
stale-positive and unregistered-dependency mutants are red; total heavy builds
are globally bounded by drain turns, not owner-key count, routing calls, or raw
cache notifications.

### Phase 6 — re-evaluate the inherited local reductions

Run the mutation storm with each inherited change independently reverted:

- service cache enqueue-only readiness;
- queued publication advance; and
- per-planning-pass operation-creation gate reuse.

Keep a change only if it still removes distinct work after the central owner is
present, preserves latest-evidence decisions, and cannot create a microtask
drain chain. Otherwise drop it from the successor candidate rather than carrying
redundant machinery.

Exit: one minimal exact candidate, with each retained local change load-bearing
or independently justified.

### Phase 7 — verification ladder

Deterministic proof, in order:

1. profiler caller-edge aggregation;
2. queue macrotask/turn-budget semantics;
3. mutation-storm production composition;
4. stale-positive, latest-vector, mid-build mutation, cold-start, cache-swap,
   membership-owner-swap, heartbeat expiry, and transport-drift cases;
5. readiness-internal recursion and ordinary-read negative controls;
6. CL-012, CL-019, CL-033, CL-034, CL-034b, cache, query, CDC, rebalancer,
   mutation-readiness, and replica-dispatch focused suites;
7. coupled-pair/model/contract gates and repository ratchets; and
8. independent exact-candidate source verification.

Live proof, only after deterministic approval:

1. one source-bound profiled five-node GCP discriminator;
2. if mechanism bars pass, three consecutive natural source-bound runs;
3. every run must bind all five boot fingerprints, terminate naturally, and
   materialize complete node logs;
4. ACTIVE 5/5 within 60 seconds and publication coverage 5/5;
5. no readiness/publication/owner-read inclusive frame above 3,000 ms;
6. no single seed event-loop gap above 3,000 ms during formation;
7. timer/heartbeat sentinel progresses through every retained window;
8. no stale-source, corrupt, node-exit, oracle-blind, or operator-terminated
   sample; and
9. no budget, workload, cohort, or decision threshold change.

If the first live run removes readiness/owner-read frames but exposes another
dominant owner, record failure migration and open the next owner Quest. Do not
keep widening this candidate.

## Independent verification brief

The implementation verifier must review the exact source fingerprint and answer:

1. Can any stale completed projection promote readiness, routing, mutation, or
   owner progress after a relevant source change?
2. Can continuous dirty events or multiple owner keys create a microtask chain
   or more than one heavy build globally per event-loop turn, and is service
   fair across dirty keys?
3. Can a readiness-internal authoritative read enter full readiness directly or
   indirectly through retries, leader routing, diagnostics, or repair?
4. Does the complete semantic token cover cache/owner generation, all six input
   tables, readiness snapshots, recovery epochs, and transport topology, with
   every other dependency registered as a positive-decision live veto?
5. Are cold start, mid-build mutation, cache/owner swap, shutdown, and retry
   paths bounded and recoverable, with no defer whose only wake depends on
   readiness itself?
6. Are identical versioned evidence and cheap live vetoes decision-equivalent to
   the unchanged builders?
7. Does the mutation-storm proof exercise production-shaped rows and real queue,
   routing, readiness, and owner-read seams rather than fixture-disabled paths?
8. Does each retained inherited local change remain necessary after the central
   owner lands?
9. Do the coupled-pair registry and push/closure guards fail on the raw-event,
   recursive-read, and stale-positive mutants?

Any negative or unproven answer blocks the live GCP gate.

## Non-goals

- no election/readiness/admin timeout increase;
- no smaller MovieLens workload or publication cohort;
- no rollback of authoritative inventory freshness;
- no second readiness semantic owner;
- no generic worker-thread migration without a measured single-build need;
- no logging-per-call instrumentation; and
- no claim that the separate publication UPSERT warning is causal without new
  evidence.
