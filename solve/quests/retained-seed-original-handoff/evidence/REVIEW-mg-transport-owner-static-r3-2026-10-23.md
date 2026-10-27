# Independent review: transport owner and named values R3

Reviewer: `subagent:/root/retained_effects_review`.

Verdict: **APPROVE the exact six-file differential source correction for
composition and non-main preservation, conditional on the normal final
metadata/guard and exact-candidate lab gates.** No material source correction
is required in this bounded delta. This is not runtime or composed MG delivery
acceptance. It does not approve this reviewer's newly authored F1 tests, the
underlying root invocation implementation, or this reviewer's R4 implementation.
Those require independent review in their own scopes.

## Frozen identity and scope

Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.
Base HEAD: `21cfd917d8ceb2f0c1435cade117c0c44a91a03a`.

| Artifact in `/tmp/mg-transport-owner-static-r3-20261023` | SHA256 |
| --- | --- |
| `manifest.json` | `7673f64c3b5662b802ff7cdbc8b256a3718f658f752e8ae52b78c57163f6ae68` |
| `delta.patch` | `fc1865a51313188ec074f2a7d4b09f3fa109afc76a7c82c7c64174c859fa3e85` |
| `NOTES.md` | `b713217acc126806ccfa3b214d6a2fec6349de7ca94a4990962daa99ad316911` |

The prior independent transport R2 source review remains the baseline:
`REVIEW-mg-delivery-transport-source-r2-2026-10-23.md`, SHA256
`24bd7711ca20e49337b45d4507f4e10079b6066766d4b647624529dbbb37f71a`.
Its T1-T4 proof limits and bounded encoder-cut interpretation remain intact.
The four common transport inputs match its approved R2 output hashes. The
canonical legacy shim and root invocation file are explicitly additional R3
inputs, not retrospectively claimed to have been covered by that R2 manifest.

| Path | Exact R3 SHA256 |
| --- | --- |
| `src/transport/inproc-transport.js` | `41d9d98528ea92c98dd4364cd9f2f26c4e05914366272b9ecfba176d571309f8` |
| `src/transport/message-router-shared-vocabulary.js` | `5fec7f365ad2d1967c11b63fc866c6ed80b032a6a7dbcb4a1fcfc5477bdd6d69` |
| `src/transport/message-router-ack-delivery.js` | `705908af1b3b3dab58bd42e25078f15a5097c45d0d9dfe5ff51482207e5d0e43` |
| `src/transport/message-router-delivery-lifetime.js` | `23cdf9a752920671c6905b73af4d97717913026b88c281b1859c3ecaf586f7a7` |
| `src/transport/message-router-outbound-delivery-registry.js` | `9f7acfeea54a5fe9fe3b47ba41f9a3d5575c35544bae657ead2fc6cfd5df6184` |
| `src/cdc/cdc-delivery-invocation.js` | `5d02b240662e0784175006884effeb9bbf913a192fed300626f4c2a0464e2d84` |

All six preserved `before/` hashes, all six preserved `after/` hashes and all
six live hashes were checked against the manifest. The final source hashes
were checked again after review and scoped static checks; none changed.

## Concrete source assessment

The duplication was systematic at the actual seam: the live connection
environment imported the pair through shared vocabulary, while delivery,
bulk and snapshot fixtures imported the callback-blind legacy pair directly.
`src/transport/router-server-manager.js:24` also imported the legacy registry.
The old implementations shared a global registry but did not share their
socket implementation. Merely testing the newer import could therefore hide
unclosed transport children on the other path.

`message-router-shared-vocabulary.js:1` now imports and reexports the exact
canonical objects (`:458`, `:491`), rather than defining a second class or
factory. `in-process-connection-environment.js:30` consumes those same exports;
the server manager continues to consume `inproc-transport.js`. The process
global registry key and map remain unchanged (`inproc-transport.js:27`).
The canonical constructor, peer wiring, open events, close propagation and
pair construction retain the previous behavior (`:56-84`, `:117-164`).
No new dependency cycle is introduced: the canonical transport owner imports
only EventEmitter, ws and the existing transport constants.

The moved send implementation preserves the previously reviewed R2 behavior
(`inproc-transport.js:94-114`). It captures the actual peer for the queued
operation, checks both endpoints at handoff, and reports completion only after
that microtask has either handed data to the peer or refused a closed peer.
The callback in `finally` reports completed handoff even if a receiver listener
throws; it does not swallow that application exception or convert it into
native acceptance. Closed-before-enqueue and closed-before-handoff both report
an asynchronous error to callback-bearing users. Each branch invokes completion
once. This closes the formerly callback-blind legacy path.

For callback-less existing users, successful sends still deliver the same data
in one microtask and listener exceptions still propagate. Closed sends still
deliver nothing. The closed-before-enqueue branch now schedules a no-op
microtask when no callback exists; that supplies no event, outcome or authority.
Options are not interpreted as application acknowledgment. This review does
not enlarge the shim into a complete ws emulator: it does not model compression,
kernel buffering, real network cancellation or binary-frame receiver metadata.
The distinct admin helper in `src/test-helpers/inproc-ws.js` is not a second
router transport owner and is outside this correction.

The other four diffs preserve their exact values and control flow. The promise
settlement marker remains `rejected` (`message-router-ack-delivery.js:7,168-169`),
the existing `TRANSPORT_EVENT.ABORT` is `abort` (`src/constants/transport.js:161`),
and invocation cleanup messages are only named at their existing owner
(`src/cdc/cdc-delivery-invocation.js:12-30`). No new error classification,
publication, currentness test, retry, clock or cleanup decision is added.

## Category-complete disposition

The R2 review's nine-category analysis is retained. The following applies each
category to this exact delta and identifies the remaining proof boundary.

| Category | Evidence and disposition |
| --- | --- |
| Transport/delivery | The callback is a write handoff, not ACK or native processing (`inproc-transport.js:106-112`). Actual ACK and write promises still close independently and are joined only in `message-router-ack-delivery.js:55-170`. Late-response classification and retryable delivery shapes are unchanged. Runtime must measure both callback/ACK orders and closed-peer refusal. |
| Owner interaction | One canonical in-process owner now supplies both importer populations (`shared-vocabulary.js:1`; `router-server-manager.js:24`; `in-process-connection-environment.js:30`). No shim projection can mint a CDC receipt. The release event is the actual queued write callback, consumed by the existing raw owner. This preserves both prompt public refusal and retained raw custody. The same-candidate paired witness and impact-contract registration remain final integration gates. |
| Concurrency/serialization | The queued closure captures one peer and invokes one completion branch (`inproc-transport.js:100-114`). `ack-delivery.js:60-65` remains idempotent and its pending ACK deletion checks exact identity (`:103-104`). Outbound in-flight release still awaits actual `deliverFn` completion and checks its captured queue (`outbound-delivery-registry.js:582-618`). No claim CAS, queue key or synchronous admission gate changes. |
| Admission/gating | The physical OPEN check is performed before enqueue and again at the handoff (`inproc-transport.js:96,102`). Existing creating-clock lifetime and shutdown-generation enforcement are unchanged; using the named abort constant changes no grant. No budget or hold-release policy is widened. |
| Retry loops | No retry owner, loop, attempt counter or backoff changes. A failed microtask reports through the existing callback to the original ACK/write operation; it does not schedule a retry or treat successful transport handoff as native success (`ack-delivery.js:151-170`). |
| Recovery/replay | No recovered state, persistent record or replay deduplication changes. Old callback finalizers retain per-operation identity and cannot delete a successor pending ACK (`ack-delivery.js:60-65,98-106`). The source/native recovery gap remains outside this change. |
| Sweep/timer | There is no new timeout, interval, native tick or role action. The microtask handoff remains the established in-process scheduler. Existing signal listener add/remove pairs use the same `abort` value (`delivery-lifetime.js:125-164,189-205`; `outbound-delivery-registry.js:17-40`). Time passage, socket CLOSE and a callback are not conflated. |
| Formation circularity | The unified module adds no SQL, metadata, topology, readiness or consensus dependency (`inproc-transport.js:13-15`). Formation and provisional-route prerequisites are neither bypassed nor established by shim completion. |
| Harness fidelity | Both import paths now have the same actual class and factory; this is source correspondence, not a measured green witness. The newly authored F1 tests include both imports and an actual ws positive but are this reviewer's own work and remain independently unapproved here. Controlled callback holds must be labeled component evidence; actual queued/compressed socket failure remains a separate proof obligation. |

No new hostile-input validator is introduced by this delta. Existing canonical
input and pinned-operation findings in the root/F3/native reviews remain with
those owners; the named-value edits here do not resolve or relax them.

I independently ran `node --check` for all six exact files and normal scoped
ESLint; each exited zero. No runtime module import, test, lab, metadata refresh,
Quest mutation, commit or push was run. The author's exploratory complexity
report identifies inherited outbound-registry functions at 15 and 17; their
function bodies are unchanged by this delta. No baseline was raised and this
review makes no repository-wide debt-clearance claim.

Final scope remains differential source approval only. Native MG receipts,
durable source ACK, S1/S2/W7, complete classification, original startup,
protected activation, transfer, two-start, Quest closure, publication and merge
remain outside this decision.
