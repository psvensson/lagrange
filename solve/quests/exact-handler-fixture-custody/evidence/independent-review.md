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

## Independent measured-result review

Date: 2026-10-21. Reviewer: `subagent:/root/control_source_review`.
This round reads preserved results only; it runs no tests and edits no source,
test or receipt. It supplements the code review above without changing its
scope. The first three receipt rows now have sufficient bounded evidence;
the fourth remains HOLD.

### Provenance and integrity

All entries in each local packet's sha256.json were recomputed: four entries
each for fixture-baseline-2016726f and fixture-candidate-a0dc88427, and five
for fixture-negative-92cb2d72b. All matched. Each of the ten paths in
candidate-bindings.json was independently read from the candidate Git object;
its blob identity and SHA256 matched the manifest. This verifies the local
packet and candidate object correspondence, not later committed-blob or
remote-publication preservation.

The baseline is 2016726f66bdb910e8b4de04bdedb89d2689bb0d. The positive is
a0dc88427b61a51d3cea7fc2ff8cdaa7fbdf7ec5. Both have the identical complete src
tree 00b72e3dfe4f9738fe4163383c141f55a07ef1f0. The three amended fixture hashes
match this review's earlier table. The other three positive files are the
unchanged adjacent exact identity/activation controls recorded in the binding
manifest. The original three failing fixture bodies remain preserved at the
baseline; their failures were not hidden by weakening the owner.

The diagnostic is 92cb2d72b5dc0c812b30eb4f6ebe084fd5153837. Its src diff from
the positive is exactly the reviewed insertion of
`await releaseWasmServiceReplicaConsensus(replica)` and a diagnostic comment
in retireReplica's catch, before CLEANUP_REQUIRED and the original rethrow.
The executable identity test is byte-identical. The only difference under
test/ is generated impact-graph-seal.json; it is not a changed behavioral
witness. This source-only control remains diagnostic and must never be merged.

### Baseline, positive and negative engagement

All three input.json files select adam-laptop with retryFailedOnce=false.
Controller logs confirm their exact placement-head values and retry:0;
every results.ndjson entry has attempt:1 and retriedOnce:false. Canonical
thermal holds completed before execution. These are same-host comparisons,
not independent cross-host proof. Automatic placement factors differ (baseline
and negative 2, positive 1.9); no timing-performance equivalence is claimed.
The test/source differences introduce no deadline or timeout increase.

Baseline: all three original files fail, with 66 reported assertions. The
demux and address failures occur at actual partition cleanup with
refused_transport_without_handler_identity. The identity file reaches its
partition, MG and WASM children, whose old successful-return expectations
conflict with the typed refusal. The preserved TAP shows these actual owner
stacks and codes; they are not import/setup failures. The original failing
observations remain obligations accounted for by this explicit fixture repair.

Positive: all six selected files pass, 237 reported assertions:

| File under test/ | Reported assertions |
| --- | ---: |
| node/message-group-executor-activation-handler-boundary.test.js | 43 |
| node/replica-transport-handler-identity.test.js | 42 |
| partition/raft-rs-transport-demux.test.js | 15 |
| address/address-manager-peer-location-authority.test.js | 26 |
| transport/exact-handler-identity-api.test.js | 36 |
| bootstrap/message-group-activation-handler-boundary.test.js | 75 |

Negative: the identity file reports 42 assertions and fails at exactly the two
intended native custody leaves. The enclosing child/top-level failures are TAP
propagation, not additional independent defects. The full controller.log shows:

- Lines 64-66: actual original DB open, expected typed shutdown rejection and
  retained handler all pass before the semantic assertions.
- Line 67: `refusal retains the exact database object` fails because replica.db
  was discharged by the deliberately premature release.
- Line 100: `refusal retains the original open database` fails because the
  captured original DB is already closed.
- Lines 127-133: CLEANUP_REQUIRED, refusal reporting, same-owner retry,
  no address-only removal, completed shutdown, DB discharge and original DB
  physical closure all pass. The partition/MG children and stale/successor
  controls pass as well.

Thus the mutant retains the typed vocabulary and handler refusal while breaking
physical custody, and the amended fixture detects that distinction. Native
setup, close failure, timeout or abandoned teardown did not produce this red.

The separate controller-setup-error.log is retained and hash-verified. It is a
local eval SyntaxError before the wrapper could execute (`Unexpected token
')'`), not a native measurement or retry of a failed test. It supplies no
semantic evidence. The later complete input/controller/results/exit packet
is the one classified above.

### Checklist disposition and receipt recommendation

The prior six harness items now have exact baseline, positive and negative
binding for this component scope. The five concurrency items remain bounded
to the existing identity/single-flight owners, sequential fixture restoration
and retained DB; the run is not an exhaustive race or timer-pressure proof.
Owner-interaction items 1-9 are supported by unchanged production authority,
the paired native custody/settlement witness, preserved stale/successor
controls and the engaged source-only negative. Item 10 and the applicable
gates remain incomplete.

`gates-a0dc88427/fast-static.txt` reports fast-static success for the explicit
2016726f..HEAD range. `owner-statics.json` still reports three literal findings
and one raw-empty-state finding across the bounded owner collaborators. The
separate cleanup-exception-audit-correspondence unit owns their repair and
classification. Being inherited or partly a classifier false positive does
not turn this gate green, and this review does not waive it.

Receipt recommendations, bound to the measured candidate above:

1. preserved-original-red: **true**.
2. reviewed-fixture-contracts-and-custody: **true**.
3. exact-candidate-positive-and-negative: **true**.
4. applicable-gates-and-independent-result-review: **false / HOLD**. This
   independent result review is complete, but canonical bounded-owner findings
   remain unresolved; later repaired composition and required gates still
   require their own exact evidence.

Overall status remains fail/open. This approves the measured fixture
correspondence and its native custody discriminator only. It is not general
transport conformance, automatic recovery, U1, full-suite, landing, main or
release certification. No receipt file was changed by this reviewer.
