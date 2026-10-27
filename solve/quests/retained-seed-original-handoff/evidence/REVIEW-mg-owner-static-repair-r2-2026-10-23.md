# Independent source review: F3 and topology owner repair R2

Reviewer: `subagent:/root/retained_effects_review`.

Verdict: **APPROVE the exact bounded differential source repair for composition
and non-main preservation, conditional on final metadata/guards and exact-source
lab proof.** O1 and O2 are resolved in source. No additional material finding
arose in this finite rereview. Runtime, paired negative controls and composed
native delivery remain unexecuted and unapproved by this review.

## Exact reviewed material

Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.
Base HEAD: `21cfd917d8ceb2f0c1435cade117c0c44a91a03a`.
Author: `subagent:/root/retained_effects_tests`.

| Artifact in `/tmp/mg-owner-static-repair-r2-20261023` | SHA256 |
| --- | --- |
| `manifest.json` | `e9ae837d69adc38459ceaa7dc4c1692f5375dfc05f0979a2551b7134ef66c028` |
| `delta.patch` | `4718a4288258b5566188c5630a56a3b728f2e7abfa5e1ab99e960e7ca6482a33` |
| `NOTES.md` | `6b3c2e04bc66dac600fcce356956bec8bfcdc442bbecd6df797f5704103d0f45` |

The rejected R1 manifest and review are preserved:
`fc9b8a418a18d59e3b5cb16f1ff0a7e6e22ab3fd4ba56298c41a416d9c45f405`
and `REVIEW-mg-owner-static-repair-r1-2026-10-23.md`, SHA256
`841e5f6856565dc0fa934e7870fa903177e9e3380f92d567c9d4d58e8d9c314f`.
The prior review's unaffected dispositions and proof limits remain applicable.

All eight before/after pairs and live after hashes match R2. The four F3
files are byte-identical to their R1 outputs: native delivery methods, routing
methods, CDC propagation runtime methods and forwarding owner. The three
previous topology inputs exactly match R1, with one expressly authorized
existing diagnostic owner added. The only changed R2 outputs are:

| Path | SHA256 |
| --- | --- |
| `src/topology/cdc-group-propagation-durable-delivery.js` | `43aa42c2242fb6aad42c47835326ca6c7bf25432a6a730485a50a22dfc3dd212` |
| `src/topology/cdc-group-propagation-delivery-methods.js` | `4ada1cb1d7b3f21f8b41235720ff4277380ac128bada807253b86008d7a9a87f` |
| `src/topology/cdc-group-propagation-constants.js` | `13804a6528f9380f786b7e3aed894088fd998d8b19e2b5291793d720c7a9332c` |
| `src/topology/cdc-group-propagation-retry-wait-report.js` | `adc81bca8437c9485e26c53b5a6fac256687d8a6da610ba172d3465900273258` |

## O1 resolved: actual stop is enforced at consumption

`cdc-group-propagation-delivery-methods.js:107-110` checks both the helper's
captured STOPPED state and the actual existing stopped predicate immediately
after the await. This precedes consuming an exhausted/duration/advance result.
The failed final-attempt schedule from O1 therefore returns `wave.stopped()`
before the spent reporter, background hook or a successor attempt. A STOPPED
observation already returned by the helper remains decisive even if start has
since changed the current service state.

The helper still checks stop before max-attempt exhaustion (`:59-62,124-126`)
and observes stop after the actual sleep (`:134-138`). The ordinary operation's
stopped result remains the existing typed `buildStoppedFailures` over its
current failed targets (`:79`). The durable operation still revalidates its
bound progress/context when producing a result, and stop still retires its
existing child scope; no fresh lifetime or permission is manufactured here.

This preserves the old owner rather than creating an additional lifecycle
authority. It does not claim a new guarantee that all historical ordinary
stop/start interleavings outside the identified observation boundary have been
measured. The required live stop-at-helper-resolution and captured-STOPPED-
then-restart controls remain runtime obligations.

## O2 resolved: the reporter names the actual bound and continuation

The retry owner now carries ATTEMPTS_EXHAUSTED or INSUFFICIENT_DURATION as
distinct states. The durable preparation reads `context.remainingMs()` once
and returns the same compared remaining value and required delay
(`cdc-group-propagation-durable-delivery.js:144-147`). Equal or shorter remaining
time refuses the next sleep. An expired/currentness-refused context still
throws through its existing owner rather than being converted into a positive
duration observation.

The common foreground loop passes the actual decision and private continuation
classification to the existing reporter (`delivery-methods.js:113-119`).
`cdc-group-propagation-retry-wait-report.js:19-33,78-88` preserves the ordinary
attempt-bound/background wording and background terminal path. Durable attempt
exhaustion names the same attempt bound but awaits canonical native/provisional
coverage and describes unresolved debt returning to the source owner. A duration
refusal replaces the wait name with the remaining-duration-for-next-retry
condition; it does not claim maxAttempts ran or that the deadline has expired.

The additional foreground observation explicitly labels stop reason,
continuation owner, target-failure versus aggregate-durable-wave count unit,
and the exact remaining/delay comparison when present (`retry-wait-report.js:36-45`).
Numeric elapsed time remains unmeasured (`:62-63`); no elapsed value is invented.
Background reporting receives no new foreground fields (`:59,72`). A repository
consumer census finds only the common foreground owner and existing background
call sites; no stale SPENT reference remains.

## Complete bounded category disposition

| Category / attack | R2 disposition and concrete boundary |
| --- | --- |
| Retry loops: cadence, bound, stops, resets and duplicate effects | O1/O2 are resolved as above. `delivery-methods.js:101-111,124-138` retains one common foreground attempt owner, the same maxAttempts and computed delay. The ordinary operation still converts failed targets after sleep and schedules the existing background continuation at maxAttempts+1 (`:65-88`). Durable preparation retains no `onSpent` callback (`durable-delivery.js:128-155`). No budget, retry counter, retry cadence or capacity increases. |
| Concurrency: fresh checks, single winner and reentrancy | The post-helper current stop check closes the new gap (`delivery-methods.js:108-109`) and the returned STOPPED state survives restart. Durable synchronous admission, exact active wave identity and raw child cleanup are unchanged from R1. `context.run` still owns actual sleep and local/transport children; public refusal cannot clear the slot before cleanup. |
| Owner interaction: one decision and typed boundary | Retry count/cadence stay in the existing delivery owner; the prepared durable operation contributes its live duration predicate. The existing report owner alone translates the named stop and continuation into diagnostics. These fields are private observations, not a wire schema, receipt, publication right or replacement source obligation owner. |
| Owner interaction: paired invariants and pressure | Durable no-background behavior coexists with retained raw cleanup and fair source-owned continuation (`durable-delivery.js:149-155`). Ordinary background behavior stays in its prior operation (`delivery-methods.js:86-87`). Canonical progress still decides completion before diagnostics or spent hooks; the aggregate count cannot authorize source ACK. Paired runtime controls remain required. |
| Owner interaction: stale/fresh, wake, projection and no escape | Route/currentness revalidation and the metadata-only rotating progress owner are unchanged. There is no detached topology retry, new payload retention cell, raw Raft authority or diagnostic-derived success. Stop releases actual sleep through the existing lifecycle owner; later source invocation remains source-owned. |
| Admission/gating | The strict delay comparison remains the existing durable condition, now with one captured observation (`durable-delivery.js:144-147`). Busy admission and source mismatch stay before their respective capture/effect boundaries. The change adds no admission bypass or state-owner fallback. |
| Transport/delivery | All four F3 files are unchanged from the reviewed R1 correction. Canonical acceptance, terminal-native/nonretryable stop precedence and constrained cache continuation remain intact. No transport acknowledgment is promoted to native committed delivery by the reporting text or result. |
| Recovery/replay | Source occurrence, binding, obligations, fair coverage retention and ACK semantics are unchanged. The source continuation label describes their existing ownership and does not implement a new recovery or retry authority. |
| Sweep/timer | No new timer is introduced. A duration refusal returns before `wave.wait`; admitted waiting still uses the existing sleep and creating invocation (`delivery-methods.js:128-134`; `durable-delivery.js:149-151`). The report is an observation of the refusal, not another timeout or cancellation mechanism. |
| Formation circularity | Complete canonical provisional coverage can still release the source scan while retaining debt; partial coverage remains unknown. Neither report classification nor common foreground retries fabricate readiness, native leadership or a complete route. Full S2 remains an independent witness. |
| Harness fidelity and contract/registry/proof | No test was changed or run for R2. The old R1 counterexamples must be exercised at actual owner boundaries, with stopped/running and duration-smaller/equal/larger controls. Root retains impact registration, final candidate freeze and exact locked-lab proof. This review is source correspondence, not a substitute for those controls. |

Required runtime evidence remains finite: stop at helper/outer continuation,
captured STOPPED followed by start, ordinary exhaustion/background scheduling,
durable attempt exhaustion, durable positive but insufficient/equal remaining
duration with zero sleep, and a larger-duration control using the unchanged
cadence. Reverting O1 or conflating O2 again must fail the corresponding
semantic assertion. Held-child cleanup, no durable batch/background entries
and canonical coverage/source-debt controls remain part of composed proof.

## Verification and limits

I independently ran eight `node --check` calls and normal scoped ESLint; all
passed. All manifest-listed artifact hashes match. The preserved differential
reports retain twelve identical inherited complexity messages, four inherited
decision findings and zero literal findings; there is no new/increased finding
or changed baseline. These are static facts, not global audit clearance or a
measured predecessor runtime pass.

All eight live and archived after hashes and the manifest were rechecked after
review. No reviewed byte changed. I wrote only this new review, with no source,
test, metadata, Quest, runtime, lab, commit or push action. This approval does
not approve my own separate R4 implementation, the whole moving MG draft,
native delivery acceptance, full classification, protected activation,
durable transfer, two-start, Quest closure, publication or merge.
