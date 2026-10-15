# Independent native witness review dossier

Scope: authorized evidence-only follow-up to accepted REJECT at bde70cec74b8eb8e8db17d0d50a432102947d6d4. Successor is unsealed/unactivated. No production edits, activation, merge, main publication, or rejected-model repair. Existing seed-control-current-proof-amortization evidence route only; no attempt metric claimed solved.

Read actual AGENTS.md -> docs/steering/rules.md -> router.md first. Verify exact working tree path. Worktree: /mnt/data/peter/projects/.worktrees/release-fencing-native-contract-20261015; inspect current diff, all new participant-release-*-native*.js fixtures/tests and partition-release-fixture.js. Prior independent findings: /home/peter/Downloads/LAGRANGE_INDEPENDENT_REVIEW_bde70cec_2026-10-15.txt; original bytes verified by review-bundle-verification.json here. User decisions in the conversation bind.

Read-only review. Do not run tests (root is arranging locked native lab runs), edit source, commit, or touch other worktrees. Return ALL findings grouped by category, with file/line evidence and severity. Assess fixture reachability and native-vs-model claims, not greenification. Write your content-bound response in /tmp/lagrange-native-contract-20261015.4671q2wx/independent-fixture-review.txt. Identify exact hashes of reviewed test/fixture bytes. Setup/import failures never count as semantic RED. Runtime results will be supplied later for content-bound follow-up.

Filled review context:
- Admission: existing local PAUSE recipient after native release, followed by first PREPARE; intended RED is new durable PREPARED after that fence, ordinary write is closed positive control. No committed HOLD is present today. D3 cannot be D2 input in proposed implementation.
- Replay/recovery: durable PREPARED replay precedes fresh admission; recorded coordinator ROLLBACK settles under local PAUSE; opposite terminal decision refuses; reauthorization cannot erase outcome. Native snapshot checkpoint currently scrubs application tables; no claim of recovery coverage.
- Harness: real admitted RF3 group, loopback transport, genuine release owners plus existing RF1 control service. The only existing fixture extension returns its native control service. Observing/forwarding transport preserves responses. Coordinator intent setup uses real ordinary writes; fixed freeze/rollback uses production settlement owner. Assess honestly the missing full QueryEngine routing and physically distributed cluster coverage. Existing fixture timing 20/150-300ms, budget10000ms/test30000ms unchanged; no mock success or production hooks.
- Concurrency/ownership: only one nonterminal participant allowed; sequential terminal history can accumulate; same candidate needs exclusion of new work and preserved settlement. Exact immutable rows/outcomes/positions are observations, not competing authorities.
---
categories: [admission-gating]
---

# Verification Template: Admission / Gating / Hold Predicates

For changes to admission checks, planning gates, hold predicates, or
readiness fences. Each item requires an evidence path (file:line / test /
log), not yes/no.

1. **Precheck-predicts-enforcement.** If a precheck exists for a later
   enforcement point, verify the precheck consults the SAME state the
   enforcer does. A precheck that admits what enforcement refuses turns
   transients into client failures. (run-25: `checkProvisioningAdmission`
   consulted storage only; the interlock rejected at `createOperation`.)
2. **Transient vs terminal classification.** Every rejection reason the
   change can emit: is it classified transient/hard where consumers
   branch (e.g. `TRANSIENT_PROVISIONING_SHORTFALL_REASONS`)? Whole-cluster
   transient rejections must WAIT under an existing budget, not fail-fast.
   (run-24: cohort fail-fast inside a legitimate hold window.)
3. **Which budget governs?** Name the EXISTING budget that bounds any new
   wait; the fix must re-attribute budgets, never raise them (TEST-0021).
4. **Reason-shape fidelity.** Emitted reasons: objects (`{code}`) vs bare
   strings — verify every consumer normalizes the shape the producer emits
   (a `String({code})` mismatch silently defeats classification).
5. **Hold release path.** What OBSERVABLE releases the hold, how does it
   propagate (CDC/cache lag?), and what is the measured release latency vs
   the callers' budgets? (run-27: the spread hold outlived the physical
   spread by learner-promotion + cache propagation.)
6. **Evaluation freshness.** Does the gate evaluate actuals per decision, or
   a cached snapshot that can go stale mid-hold?
7. **Message honesty.** Do blocking messages embed the state ACTUALLY
   examined (the held/blocking entity), not the admitted operation's ids?
   (run-24 forensics mislabel.)


---
categories: [recovery-replay]
---

# Verification Template: Recovery / Replay / Reconciliation

For changes to restart recovery, cache-vs-authoritative reconciliation, or
replay lanes. Each item requires an evidence path.

1. **Never clobber live with stale.** Recovery that rebuilds in-memory
   state from rows must skip LIVE (in-memory, non-terminal) entries — cache
   rows lag CDC and rebuilt records start with empty registries. Enumerate
   EVERY seam that writes recovered state (the run-23 clobber had four:
   record replace, sub-registry overwrite, recovered-id enrollment,
   list duplication).
2. **Restart vs live discrimination.** How does the code distinguish "I
   restarted, restore everything" from "I am live, fill gaps only"? Show
   the discriminator and its false-positive cost.
3. **Lost-enlistment refusal.** A workflow that ever enlisted participants
   must refuse to run a stage against an empty registry (monotonic
   enlistment witness), while legitimately-empty workflows stay legal.
4. **Replay idempotence.** Replayed rows/commands re-applied after partial
   effects: show the dedup/CAS that makes them safe, and what CLEARS that
   dedup state when a rollback evaporates the effects (Z1).
5. **Absence-proves-nothing.** A row invisible during recovery is not
   evidence of completion or absence — verify no path treats
   unreadable-as-terminal (run-26 late-honor preempt-cancel).


---
categories: [harness-fidelity]
---

# Verification Template: Test-harness / Fixture Fidelity

For new DT tests, fixtures, or stubs — and for verifying that a green test
binds to the live mechanism. Each item requires an evidence path.

1. **Red for the RIGHT reason.** Show the head-red assertion failing via
   the claimed mechanism (not via a missing method / fixture gap). A
   compressed-geometry fixture can let the WRONG existing machinery absorb
   the scenario (run-25: fast stubbed polls let the short first wait absorb
   a hold the live system fails on). Red-on-revert is valid only when the
   reverted run reaches the named behavioral assertion through the intended
   precondition/mechanism and that assertion fails. Import, setup, fixture,
   timeout-before-engagement, and missing-method failures are non-proofs.
   Preserve output naming the assertion and failure mechanism; exit status
   alone is insufficient.
2. **Stub honesty at the binding seam.** The stub of the seam under test
   must reproduce the live behavior the bug depends on (rejection at
   CREATE time vs probe time; `{code}` objects vs strings; transport ACK
   with noHandler). Prefer contract-suite-backed stubs
   (test/contract/); if none exists for the seam, state what the stub
   simplifies and why it cannot mask the mechanism.
3. **Time fidelity.** What does the fixture compress (poll intervals,
   budgets, hold windows)? For each compressed constant, argue the
   ORDERING of expiries is preserved (window < hold < budget), not just
   the values.
4. **Field fidelity.** Ops/rows built by hand: do they carry the fields
   the code under test branches on (createdAt for budget bounds, workflow
   steps, status enums)? A missing timestamp can flip a bounded loop into
   a degenerate-stop path.
5. **Vacuous assertions.** For each assertion, name the fixture state that
   could make it pass trivially (single-replica role flips are ignored by
   design; empty services tables admit everything) and show it is excluded.
6. **Live binding.** For demo-line/runtime classes: the closure claim
   names the LIVE observable (which run, which log line) — a green DT plus
   red-on-revert proves test-code binding, not live-mechanism binding.


---
categories: [owner-interaction]
---

# Verification Template: Owner Interaction

Use this checklist for changes that touch a registered cross-owner interaction,
especially a `coupledPairs` entry in `test/shards/impact-contracts.json`.

The verifier must attack the **interaction contract**, not review each owner in
isolation. Every item requires a concrete evidence path (source, contract,
test, model, or immutable run artifact).

## Checklist

1. **Single semantic question owner**
   - Name the semantic question the interaction answers.
   - Identify the one component allowed to make that decision.
   - Prove diagnostics, harnesses, retained views, caches, and participants do
     not independently derive an equivalent verdict from lower-level evidence.

2. **Interaction owner and typed boundary**
   - Identify what each participant owns and what it only supplies as intent,
     evidence, or actuation.
   - Show the typed contract that crosses the seam and the component that
     adjudicates its meaning.
   - Reject aliases, boolean option bags, or local fallback logic that create a
     second interpretation of the same interaction.

3. **Paired-invariant / ping-pong attack**
   - Name the invariants on both sides that historically pull in opposite
     directions.
   - Prove they are green **in the same deterministic witness**, not only in
     separate tests.
   - For a known historical fix class, show that restoring the old local
     shortcut makes the paired witness red.

4. **Stale-then-fresh temporal replay**
   - Replay an older stale/degraded witness followed by newer authoritative
     evidence.
   - Prove the old observation cannot remain a permanent semantic veto after
     the evidence it described changes.
   - Prove the consumer re-enters the canonical owner path rather than using a
     local reinterpretation.

5. **Pressure and backoff attack**
   - Prove a liveness fix does not bypass owner-owned backpressure, retry-after,
     single-flight, or failure deferral.
   - Repeated callers must not amplify work or turn a bounded retry owner into a
     repair storm.
   - Caller urgency/force intent is not permission to bypass an owner safety
     policy unless the contract explicitly says so.

6. **Wake / release-path attack**
   - Identify the event or revision that can make the blocked decision become
     satisfiable.
   - Prove that transition re-drives or invalidates the consumer through the
     canonical owner queue/path.
   - Polling/timers may remain recovery fallbacks; they must not be the sole
     correctness progression mechanism.

7. **Projection-authority attack**
   - Enumerate diagnostic and presentation projections that expose related
     state.
   - Prove none is promoted into a competing operational authority merely
     because it is cheaper, fresher-looking, or easier for a harness to read.

8. **Controlled-negative / treatment-fidelity attack**
   - When the proof uses a fixed/reverted A/B or red-on-revert control, prove the
     treatment actually changes source/behavior, not only the pass criterion.
   - Bind the control to source/change fingerprints and keep expected-negative
     samples out of the positive certification population.

9. **No local escape hatch**
   - Search touched callers for direct raw reads, alternate retry loops, force
     flags, fallback success, or duplicated decision predicates that bypass the
     registered pair.
   - Any surviving exception must be explicit in the interaction contract,
     bounded, and covered by the paired witness.

10. **Contract + registry + proof stay aligned**
    - The changed paths are covered by the named impact contract.
    - The registered pair has live endpoints and exact primary-classified
      witness tests.
    - Contract/model/decision-table changes and the witness change together when
      semantics change; a source-only semantic change is a rejection.
    - The registry entry rides in the same product Quest as the owner change
      (`test/shards/impact-contracts.json` classifies as `test`); it needs no
      separate Quest.

## Verdict bar

Approve only when the same candidate preserves both participant invariants,
keeps a single semantic decision owner, and has a reachable event-driven release
path under pressure. A local fix that merely moves the failure to the adjacent
owner is a rejection even when its focused unit test is green.


---
categories: [concurrency-serialization]
---

# Verification Template: Concurrency / Locking / Single-flight

For changes to single-flight keys, claim CAS, serialization gates, or
concurrent create/dispatch paths. Each item requires an evidence path.

1. **The synchronous gate vs the async observer.** Concurrent creates
   cannot be serialized by async row observation alone (rows mid-persist
   are invisible) — show the synchronous in-memory gate AND the async
   backstop (run-20 interlock pattern: ensureOperationLedgerSelfMoveSerialized
   + runOperationLedgerInterlockAccountedCreate).
2. **TOCTOU after awaits.** Every check-then-act separated by an await must
   re-validate after the await or prove single-writer.
3. **Single-winner claims.** Multi-driver dispatch (wakes, replays,
   planner) must funnel through one claim CAS on durable state; extra
   drivers must be no-op nudges.
4. **Reentrancy from timers.** Actions invoked from setInterval/setTimeout
   callbacks: what in-flight operations on the same entity can they
   interleave with, and why is that safe (or gated)?
5. **Lock scope honesty.** Mutex keys: is the KEY the resource actually
   contended (an inert budget classification on the wrong key serializes
   nothing — run-21 verifier finding)?


---
categories: [transport-delivery]
---

# Verification Template: Transport / Delivery / Wake Semantics

For changes touching messageRouter delivery, wakes, dispatch handoffs, or
response classification. Each item requires an evidence path.

1. **ACK is not processed.** Transport `acknowledged: true` can coexist
   with `noHandler: true` (ACK-before-handler-lookup; mid-startup targets
   drop messages). Every consumer of a delivery outcome must branch on
   `noHandler`/processing evidence, not `acknowledged` alone. (run-26 wake
   drop; contract suite: test/contract/message-router-contract.test.js.)
2. **Late responses.** SERVICE_RESPONSEs can arrive after the waiter
   retired; verify late-honor paths cannot cancel the only remaining
   re-drive on ambiguous (row-invisible) evidence.
3. **Outcome classification.** New response shapes: run them through
   `classifyTransportDeliveryOutcome` semantics — DELIVERED/DEFERRED/FAILED
   mapping, `deferRetry`, `retryAfterMs` — and verify the retryable-error
   classifier accepts what must be retried.
4. **Undeliverable never hangs.** Missing handler / no connection must
   resolve with a retryable signal within a bounded time, never hang the
   awaiting workflow.
5. **Stub fidelity.** Any test stub of the router in the change: does it
   honor the contract suite (register/deliver semantics, undeliverable
   shape)? Prefer `createContractMessageRouterStub`.

# Contract addendum for independent vet
Read the new OWNER-CONTRACT.md at solve/quests/seed-control-current-proof-amortization/evidence/native-owner-contract-20261015. Review all semantic sections and the source map. Binding user decisions are fixed; proposed HOLD conditions, result adapter, capacity reservation and application snapshot scope are explicitly not approved. Identify any extra authority, implied new protocol, false unchanged behavior, unbounded retention claim or hidden gap. Distinguish review-ready HOLD with explicit decisions from an implementable/approved contract. Native local PAUSE is not committed HOLD. Compare actual source before accepting assertions. Every prior F1-F8 needs a resolved semantic decision or exact blocker. Do not require production code within this evidence-only task. Include all prior category checklists plus retry checklist below; this contract changes no retry loops but proposes finite reservation/backpressure, whose missing proof must remain loud.
---
categories: [retry-loops]
---

# Verification Template: Retry / Re-drive / Follow-up Loops

For changes to retry registration, follow-up timers, rearm logic, or
re-drive lanes. Each item requires an evidence path.

1. **Retry-must-fire.** Any registered retry that other seams TRUST (e.g.
   `SKIP_LIVE_DEFERRED_RETRY`-style suppression) must provably fire or
   loudly stop — trace the firing path under the failure conditions that
   scheduled it. A registered-but-dead retry suppresses every other rescue.
   (run-26: the 1s verification follow-up self-cancelled silently while its
   live window suppressed the only planner rearm.)
2. **Bound from frozen evidence.** If the loop's stop decision reads the
   operation/row, what bounds it when the row is UNREADABLE? Snapshots must
   carry timestamps; degenerate evidence must stop loudly, not loop.
3. **Every stop is loud.** Enumerate all exits (terminal, ineligible,
   budget, degenerate); each must log a typed reason. Silent self-cancel is
   the run-26 class.
4. **Mutual suppression / livelock.** Does A defer to B while B defers to
   A? Show the tick where progress is guaranteed.
5. **Retry storm ceiling.** Cadence x max-duration x concurrent instances:
   compute worst-case attempts and log volume; verify per-target sheds or
   throttles exist where the product is large.
6. **Duplicate-effect safety.** A retry that re-fires after late success
   must be a no-op nudge (CAS/single-flight/authoritative re-read at the
   receiver), not a duplicate mutation.
7. **Reset semantics.** What resets attempt counters — and can a
   success-that-wasn't (transport ACK without processing) reset them
   forever?
