# Independent verification — readiness-planning-diagnostic-retention-bounds-v2

Verdict: **APPROVE**

Verifier: `verify_formation_cure`  
Review: `review-6737ad4f9ab995bdfe535943`  
Review SHA-256: `7d2f874f5d3ffe60d6a48ee93c10345068b159161919825435e313f8f36da7be`  
Base: `cdda789003b2310b98bbdddea5c3b4b57a6bceac`  
Candidate/aggregate SHA-256: `9f631992aa786e0d561a26ffb887188e739bb107635c674a715d9007792f7f1c`  
Ordered path/content manifest SHA-256: `cfd8bfface17c19add664e73ef91d08bb812c3d336db175ede72ebf8067c096c`

## Decision

APPROVE. The exact eight-path candidate bounds two deterministic diagnostic-retention owners without introducing a second operational authority. `ReadinessPlanningSnapshotOwner` remains the snapshot/build owner and delegates only its sample ledger to `ReadinessPlanningDiagnosticRetention`; `OwnerKeyReconcileQueue` remains the claim, fence, retry, and timer owner while its existing diagnostic projection owner gains bounded stale-claim sampling. Aggregate counters remain exact, live operational maps are not evicted, and shutdown is the sole explicit terminal graph-release edge.

This approval is content-bound and limited to the safety/coherence of the deterministic retention changes. It does not infer memory behavior from the unit witness. Separately, the available bounded-retention GCP run is honestly source-bound: its run status records dirty HEAD `cdda789003b2` plus `srcFingerprint=ceacbf64ba4e4c46`, which exactly equals the current candidate source fingerprint. Its enforcing report analyzes 7/7 nodes and 1,011 process-RSS samples, with 102–119 post-warmup samples per node, no insufficient-analysis reason, and zero detected leaks. That evidence must remain governed by the parent release Quest rather than being silently substituted by this child verdict.

## Exact candidate and generated dependencies

`git diff --binary --full-index --no-ext-diff cdda789003b2310b98bbdddea5c3b4b57a6bceac -- <eight review paths>` produced 23,766 bytes, SHA-256 `9f631992...f1c`, and byte-compared equal to `attempt-1.diff`. `assertReviewCurrent` passed for this immutable review.

The five implementation/test bytes exactly match the previously reviewed candidate, permitting reuse of its focused ESLint, strict cyclomatic/cognitive, owner-history, interaction, and impact-pair evidence:

| Path | Bytes | SHA-256 |
|---|---:|---|
| `src/control-plane/readiness-planning-diagnostic-retention.js` | 3,736 | `33bb2d654423b010021faf57b948b8ce628070141673a44baa48bdcb61015f7c` |
| `src/control-plane/readiness-planning-snapshot-owner.js` | 26,096 | `4c0688703e1d5317732e1bdb21f5809229c62de3865d664958a667758646e5b0` |
| `src/workflow/owner-key-reconcile-queue-snapshots.js` | 3,688 | `fd59ef08e4b790ff7350912d11efe8aa40b9acfef9de737706753fdc9f6e973f` |
| `src/workflow/owner-key-reconcile-queue.js` | 23,158 | `eac56093e368dcc5c3d7c6900ab435a156aaf0625994a921998ef0728978609f` |
| `test/control-plane/readiness-planning-diagnostics-retention.test.js` | 5,860 | `5ae983e6e26f7ec7d6bed6ae075693a64a740b590faad0713e6895ccc141607b` |
| `test/shards/primary-classes.json` | 148,528 | `2d1007917e00407d80960403bb5675cef7ecb05b0b69ab9d58794fbeb3fe8521` |
| `test/shards/resource-classes.json` | 155,528 | `f8ca85239c4f81db3ebc9c6ed4d4ce56af9747f6add2d597027460eda59b5fdb` |
| `test/shards/subsystem-classes.json` | 172,907 | `53ce4413f0501829ca290ea8569b7a1bbf895aa4eb706ab9754eac462fff82c9` |

All three generator-owned files match the SHA/size identities sealed in `manifest.generatedDependencies`. Their independent byte checks pass and enumerate the same 2,075-test census:

- `node scripts/generate-test-primary-classes.js --check`: PASS, 2,075 tests.
- `node scripts/generate-test-resource-classes.js --check`: PASS, 2,075 tests.
- `node scripts/generate-test-subsystem-classes.js --check`: PASS, 2,075 tests and 22 subsystems.

The immutable proof plan is candidate-local, `status=pass`, and selects 2,075/2,075 tests. Its full-suite escalation is conservative classification fallback for the generated resource/subsystem manifests; no full suite was rerun locally under the explicit thermal constraint.

## Owner and history reconstruction

History identifies the existing owners rather than a new parallel path. `ReadinessPlanningSnapshotOwner` entered in `5d60eb451` and is still constructed by `control-plane-readiness-participation-base.js:331-337`; production source/cache changes reach it through the existing readiness-planning snapshot flow. `OwnerKeyReconcileQueue` predates this change and owns single-flight, claims, fences, retry registration, timer callbacks, and stop semantics. The candidate is therefore **EXTENDED**, not a new runtime owner:

- snapshot/build semantics: existing owner reused;
- readiness diagnostic retention: new subordinate owner, called synchronously only after a completed real build (`readiness-planning-snapshot-owner.js:645-674`);
- queue diagnostic projection: existing subordinate owner extended (`owner-key-reconcile-queue-snapshots.js:23-45,85-119`);
- retry/timer/claim/admission semantics: existing queue owner unchanged.

The remaining removed-node cache concern is a separate durable follow-on, not an engaged blocker for this candidate. `completedSnapshotsByOwnerKey`, completed/build-option variants, and deferred memo state are keyed by live owner membership and have no live removed-node eviction; shutdown clears them at `readiness-planning-snapshot-owner.js:727-738`. The measured seven-node GCP topology is static and per-owner variants are already bounded, whereas the corrected leak is per-build/token diagnostic accumulation. Unbounded membership churn should receive its own lifecycle-owner witness rather than widening this fix into operational cache eviction.

## Required templates

### admission-gating

No admission predicate, rejection code, budget, hold, or evaluation cadence changes. The new retention owner observes the already-completed build boundary after `buildNodeReadinessSyncCurrent`; neither bounded-sample eviction nor diagnostics absence is consumed by readiness admission or publication enforcement. Queue stale-fence and retry decisions continue to use canonical operational maps/counters, not the bounded projections. Precheck/enforcement state, reason shapes, and release paths therefore remain unchanged. Pass.

### adversarial-js-intrinsics

The capacity is a module-private safe integer constant (`256`), indices remain in `[0,255]`, drop counters increase once per actual eviction, and modulo divisors cannot be zero. Owner/token keys are internal already-canonical primitives; the retention layer neither reads external fields nor coerces keys. Map operations, map size, object creation/freezing, and diagnostic writes are captured at module import; array copies use indexed own-data copying and no iterator. Queue projection similarly captures Map/Set traversal and `Object.defineProperty`, performs indexed copies, and does not use mutable iterators. No boxed/exotic capacity input, accessor reread, digest coercion, or post-import mutable intrinsic seam is introduced.

At capacity, a distinct token scans at most 256 Map entries using captured `mapForEach`. Prior byte-identical focused measurement was approximately 1.18 microseconds per record over 10,000 records. This fixed work and allocation ceiling is acceptable at observed readiness churn; an O(1) key ring is an optimization only if an exact-source GCP CPU/allocation profile identifies this ledger as material.

### harness-fidelity

The witness owns independent constants `EXPECTED_DIAGNOSTIC_SAMPLE_CAPACITY=256` and `BUILD_COUNT=513`; it does not derive workload size from production diagnostics. It executes 513 real `ReadinessPlanningSnapshotOwner.reconcile()` calls through the actual build/token branches before inspecting diagnostics. The current candidate passes all 23 leaf assertions (three subtests) in 36 ms.

An isolated base-source replay used the current test unchanged against archived base `cdda789...`. It exited RED after reaching the intended mechanism: `buildCount=513` passed, then capacity was `undefined`, `buildOwnerKeys.length=513`, `buildsByToken` contained 513 keys, both expected drop counts `257` were absent, the oldest key was `node-0` instead of retained-tail `node-5`, and shutdown retained owner keys, token entries, seven completed owners, and seven completed snapshot variants. Queue stale-claim and retry-payload shutdown assertions also failed on the corresponding base owners. This is behavioral red-on-revert, not import/setup/no-work failure.

The fixture uses a fake monotonic clock and no real delay; time ordering is irrelevant to sample retention. Seven owner keys and 513 distinct token generations reach actual owner/token branches. Exact count, exact capacity, drop formulas, chronological endpoints, and shutdown emptiness exclude vacuous success. The production constructor at `control-plane-readiness-participation-base.js:333` binds the live GCP readiness path; the exact source fingerprint match provides live-source binding without treating the unit witness as plateau evidence. Pass.

### recovery-replay

Live operational state is never evicted: only diagnostic samples rotate during processing, and complete graph clearing occurs only after explicit `shutdown()`. Pending, in-flight, fence, retry, and completed snapshot semantics are unchanged while live. Repeated owner/token observations update bounded diagnostics and exact counters without altering published snapshots or queue claims. Evicted/absent diagnostic samples are not used as evidence of completion, absence, restart, enlistment, or terminal state. Pass.

### retry-loops

Retry registration, retry timers, retry state, fence checks, and drain ownership remain in `OwnerKeyReconcileQueue`. The candidate does not add a wait, stop condition, cadence, or suppression edge. Before shutdown, the focused witness confirms a real retryable drain failure retains an active retry owner; shutdown is the explicit loud terminal and clears timer, work, state, and bounded payload graphs. Repeated builds/retries only affect exact aggregate counts plus fixed payload samples, not semantic effects or operational retry counters.

Worst-case new diagnostic retention is fixed per owner: 256 owner-key samples, 256 token/count entries, and the pre-existing 32 stale-fence samples; post-capacity distinct-token work is at most one 256-entry scan per completed build. No new queue/owner deferral cycle or duplicate mutation is introduced, and cleanup does not reset retry counters before shutdown. Pass.

## Focused and static evidence

- Thermal checks preceded every command. CPU readings were 44–71 C; the initial storage check recorded NVMe composite 31.9 C and the secondary NVMe sensor 67.9 C. No broad suite or soak was run, and validation stopped after the short focused/static checks.
- `git diff --check` over the exact eight paths: PASS.
- Current focused witness: PASS, 23/23 leaf assertions, 36 ms.
- Byte-identical prior focused set: PASS, four files / 340 parser assertions (new witness, queue, publication-readiness churn, startup-authority impact pair).
- Byte-identical prior focused ESLint: PASS.
- Byte-identical prior strict scoped cyclomatic threshold 12 and cognitive threshold 20: PASS.
- Source files are 120, 745, 129, and 784 lines; test file is 154 lines, within the 800/1,500 limits.
- Pre-fix GCP report SHA-256 `c9bc87dc5a43a4ba64ef62926015efa96e085345c24c257f88c0f83bd04c504b`: valid RED, 7/7 nodes, 1,068 samples, one detected leak.
- Bounded-retention GCP report SHA-256 `b1985b384e9d252f54b630dab99e82e4f22b1efc4e014a1756cffaa8c117489b`; run-status SHA-256 `9b1d2c1c857844c7601cdeb57e11388bed34148fca3ad93319a92e5992b899d8`; recorded and current source fingerprint both `ceacbf64ba4e4c46`.

No source, Quest, log, artifact, or generated manifest was modified. Only this authorized receipt and its paired strict verdict were written.
