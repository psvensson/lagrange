---
audience: development
documentClass: evidence
---

# Independent fixture and custody review

Date: 2026-10-21. Reviewer: `subagent:/root/control_source_review`.
Verdict: APPROVE the bounded test changes and proposed diagnostic control for
measurement. This is code/design review only. No tests, native execution,
staging, commits, production changes or receipt changes were performed by
this reviewer. Exact-candidate results, metadata and applicable gates remain
pending; no landing, U1, startup recovery or release approval is given.

The review read the sealed Quest, design, PR139 reuse assessment, all three
declared verification templates in full, the complete changed assertions and
the actual identity, partition, message-group and WASM retirement owners.
The three test preimages are based on 2016726f66bdb910e8b4de04bdedb89d2689bb0d.
HEAD advanced to 92ae06ef40df6610cb2163edd7d6476cd65bb3ef during read-only
review; approval binds the following bytes, not uninspected parallel work.
The source worktree diff was empty at the final inspection.

| Reviewed path | SHA256 |
| --- | --- |
| test/address/address-manager-peer-location-authority.test.js | 2b065854935daa61218ef0b336dab84e75c70c6bea9d08ac2bf5a47744a97aea |
| test/node/replica-transport-handler-identity.test.js | 2e21365eb7924472c944999c86df7d906ae21067a49fc2bf4646bc50720295c1 |
| test/partition/raft-rs-transport-demux.test.js | 01a92788de336c7625ebd119571fd768627b1aaa042c033f8dfd5ddd7d1ecc32 |
| solve/quests/exact-handler-fixture-custody/quest.json | 23c38de35032ff80d6466467ef58ed5da18775e6f75165d3a7a66aab7c0b78a8 |
| solve/quests/exact-handler-fixture-custody/design.md | 5e4ef3aaeac223474a01ea2c90b2f5b0109eebbfd29682d0cdf6f96a1c7b2266 |

Paths and lines below refer to these reviewed bytes. For readability, identity
test means `test/node/replica-transport-handler-identity.test.js`; identity
owner means `src/node/replica-transport-handler-identity.js`; WASM lifecycle
means `src/wasm-service/wasm-service-replica-lifecycle.js`.

## Harness fidelity: all six items

1. **Correct red cause.** The preserved
   `solve/quests/seed-release-failure-custody/evidence/owner-regression-comparison.md`
   records the three unchanged typed-refusal expectation mismatches on both
   baseline and repaired source. Identity owner lines 30-35 requires RETIRED
   or ALREADY_ABSENT before dependent release; partition lifecycle lines 63-76,
   message-group helper lines 44-60, and WASM lifecycle lines 290-304 enforce
   it. The old positive expectations contradict that contract. The PR139
   provenance assessment preserves the historical positive-adapter failures
   and exact preimages, but its separate Ubuntu jobs are not same-host proof.
   New exact-candidate positive and custody-negative measurements are pending.
2. **Binding seam.** Address test lines 139-160 and demux test lines 31-47 now
   retain actual registered function identities in a Map and conditionally
   remove only the supplied identity, corresponding to
   `src/transport/message-router-handler-registry.js:112-126`. They simplify
   network delivery; no claim of full transport conformance follows. Identity
   test lines 43-60 deliberately lacks both identity methods until lines
   65-72 are invoked after the refusal assertions. Presence is never treated
   as exact identity during the negative.
3. **Time fidelity.** The diff changes no timeout, election, retry cadence,
   budget or clock. Native WASM initialization and shutdown remain awaited.
   The adapters introduce no sleeps, polling or scheduling policy.
4. **Field fidelity.** Identity test lines 238-248 constructs the real WASM
   replica with an explicit nonempty replica set, ID, node, service and
   database path, awaits real initialization and captures its original DB.
   Lifecycle state assertions use the production enum. Partition and MG
   children deliberately exercise their retirement boundary with registered
   handlers; they do not claim native partition/MG persistence evidence.
5. **Nonvacuity.** Identity test line 248 requires the original native DB open
   before shutdown; lines 249-259 require typed refusal, same registered
   handler, exact retained DB, still-open DB, CLEANUP_REQUIRED and reporting.
   Lines 262-275 require same-owner settlement before directory removal.
   The unchanged address fixture requires real leadership and peer admission
   at lines 202-220; unchanged demux assertions require one actual operation
   port step at lines 80-89 and real runtime traffic at lines 109-112.
6. **Live-binding ceiling.** No new run was reviewed. These bytes are fit to
   measure; their positive engagement and controlled negative must appear in
   actual locked-run artifacts. Historical green cannot certify this amended
   native resource lifetime or current composition.

## Concurrency and serialization: all five items

1. **Synchronous gate.** Map identity comparison and deletion are synchronous
   in all three adapters. Production identity owner lines 95-104 performs
   exact retirement through the existing lane when present. WASM lifecycle
   lines 343-357 installs STOPPING and its settlement before invoking retire;
   retirement starts before awaiting reconciliation (lines 260-278).
2. **Post-await identity.** WASM lifecycle lines 294-295 clears only the
   captured handler. `src/wasm-service/wasm-service-consensus-port.js:233-264`
   snapshots port/DB/KV and clears references only when they still match after
   the relevant awaits. The fixture has one writer and awaits each shutdown
   before restoring capability or deleting storage; it introduces no competing
   mutation between a check and effect. It does not claim to test every race.
3. **Single winner.** No claim owner or retry loop is added. WASM STOPPING
   joins the existing settlement (lifecycle lines 333-346); CLEANUP_REQUIRED
   re-enters that same shutdown owner. Partition and MG children retry their
   original service/retirement objects (identity test lines 201-231).
4. **Timer reentrancy.** Ordinary WASM shutdown still stops native activity
   through `src/wasm-service/wasm-service-replica.js:770-777`; lifecycle closes
   admission and joins reconciliation before resource release. The fixture
   does not drive native timers, add callbacks or replace the shutdown owner.
   Concurrent-timer stress remains outside this bounded fixture proof.
5. **Resource-key honesty.** The exact address/function pair remains the
   registration identity. The physical obligation is the captured original
   DB object, not a path-only or lifecycle-state surrogate. Existing real
   router stale/successor controls at identity test lines 96-140 are unchanged.

## Owner interaction: all ten items

1. **One question owner.** Whether the captured handler may retire is decided
   only by identity owner lines 86-105. The fixtures supply identity capability
   and observations; logger output never authorizes cleanup.
2. **Typed boundary.** REFUSED_NO_IDENTITY remains a typed refusal. The raw
   identity primitive returns it, while consuming lifecycle owners require
   settlement and throw it (identity owner lines 30-35). Revised tests preserve
   this distinction rather than treating every API as returning the same shape.
3. **Paired invariants.** Identity test lines 245-275 pairs refusal without
   native release with subsequent exact retirement and original DB closure in
   the same child. Assertions do not merely accept an exception and abandon
   native custody. The proposed source negative below attacks this exact pair.
4. **Stale then fresh.** Lines 261-262 restore genuine exact identity over the
   same Map, then re-enter the same replica shutdown. Partition/MG children do
   likewise. Unchanged lines 96-140 retain delayed-old/successor protection.
5. **Pressure/backoff.** There is one explicit fixture retry after capability
   restoration, no new production retry policy, force flag, suppression or
   budget increase. This is not a pressure or broad liveness certification.
6. **Wake/release path.** The fixture's changed fact is availability of exact
   identity methods over its existing registrations. Its explicit next normal
   shutdown/retirement call is the trigger. No automatic production wake on
   transport API mutation is asserted or required by this fixture.
7. **Projection authority.** Logger records (lines 157-178), DB-open and
   lifecycle assertions observe the result only. Operational settlement comes
   from the ordinary owner call, not logger output, presence, or CLEANUP_REQUIRED.
8. **Controlled treatment.** Proposed catch-only mutation below is source-side
   and retains the refusal vocabulary. Its exact fingerprint and unchanged
   witness hashes must be preserved when actually constructed and executed.
   No expected-negative sample may count as a positive certification run.
9. **No escape hatch.** No handler nulling, fake ALREADY_ABSENT, direct native
   close, arbitrary unregister or forced success is introduced. The helper
   at lines 75-94 retains a thrown primary error and aggregates cleanup failure.
   TAP assertion failures remain recorded by the unmodified TAP exports in
   `src/test-helpers/tap.js`; their nonthrowing nature does not make them green.
   Lines 262-275 await owner shutdown and refuse directory deletion while the
   replica still owns a DB or the captured DB remains open. A cleanup rejection
   leaves the directory intact.
10. **Contract/registry/proof alignment.** The sealed statement and design
    correctly bound this to three fixture contracts and native WASM custody.
    Explicit occurrences of these three test paths were not found in the
    current `test/shards/impact-contracts.json` during review. Root must establish
    the applicable existing contract/pair coverage and regenerate actual
    composition metadata; historical PR139 generated metadata is not reusable
    acceptance. This remains a pending gate, not an inferred registry waiver.

## Proposed controlled negative

Design approval applies to adding exactly
`await releaseWasmServiceReplicaConsensus(replica)` at the start of
`retireReplica`'s existing catch in WASM lifecycle (before lines 303-304 set
CLEANUP_REQUIRED and rethrow). It must be an isolated diagnostic source branch,
never merged, with the reviewed test bytes unchanged.

The first real shutdown must still reach REFUSED_NO_IDENTITY at lifecycle
line 293. The mutation then invokes real consensus/DB closure through
`src/wasm-service/wasm-service-consensus-port.js:229-264`, leaving the handler
registered and retaining the original typed error after successful close.
Expected discriminating failures are identity test lines 254 and 255: the
replica no longer retains the original DB and that DB is closed despite refused
retirement. Initial DB-open line 248, typed rejection lines 249-251 and handler
retention lines 252-253 must be positively engaged first. CLEANUP_REQUIRED and
reporting can still pass, demonstrating why those alone are insufficient.

The later fixture retry must retire the retained handler through the same
owner and finish teardown; it does not hide the already recorded assertion
failures. If native setup fails, the inserted release rejects before the
original refusal is restored, or the run dies before the named custody
assertions, that is not the intended semantic kill. Inspect the full result,
not just a nonzero exit. No mutant has been executed or final bytes approved
by this review.

No blocking code finding was identified in the reviewed three-file delta.
Current-source measurement, exact source-negative engagement, registry and
metadata correspondence, applicable owner audits and independent result review
remain obligations. All receipt values remain untouched by this reviewer.
