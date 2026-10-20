---
audience: development
documentClass: evidence
---

# Independent source, harness and measurement review

Date: 2026-10-20. Reviewer: `subagent:/root/control_source_review`.
Composed candidate: `32dfdc388cf80c695b70207e1b659bce8d5d6ad5`.
This record preserves the reviewer's returned findings and receipt decisions.
The reviewer did not edit production source or run these native measurements.

Verdict: **bounded source/harness approval and focused native evidence
established; completion and release gates remain open**.

## Reviewed change and witnesses

The three final production hashes are:

| Path | SHA-256 |
| --- | --- |
| `src/node/participant-release-diagnostic-observation.js` | `07302e1a99ebd82aa10c63ea154bda94bebd60ecc90f2e6b263e36c65cbc92d4` |
| `src/node/replica-handler-participant-cutover.js` | `29614ff0e427e4971cb4a186e000f8deafa55081a91877635833398948210464` |
| `src/partition/partition-participant-transaction-cutover-constants.js` | `59d9a3088e04aa074b29c7143bc8bcaee1a83929e27bbe0613b989cf3d4a6507` |

The observation retains three bounded own primitive strings from an already
returned failed answer, without invoking accessors, proxies or coercion.
It adds no authority grant, owner acquisition, dispatch, retry or deadline
renewal. The required same-owner audit extraction preserves eager topology
reads and status/origin/capability and owner-operation order. Tail-call Promise
adoption can delay outer settlement; identical scheduling is not claimed.

The adversarial test's earlier static self-namespace fixture introduced an
import cycle and was replaced before native measurement. The final test
imports the exact production owner from a temporary self-namespace input,
preserves import/assertion/cleanup failures and retains a static impact edge.
Final test SHA-256:
`33b0d9dea829e09143f01ac35bb4cf8043c97ed3d892d2965dacf2e9054f744a`.
The append-only Quest log preserves each finding, repair and re-review.

A's actual registered route, retained SQLite/native stores, controlled clock,
lost answer, dropped actual consensus notifications, registry wake and retry
were reviewed across the sealed verification categories. B's actual bound
CREATE/REMOVE, native RF3 formation, physical sink, endpoint hold and native
close failure were independently reviewed. B's component metadata gateway and
the excluded ordinary unbound ingress remain explicit ceilings.

The impact mapping includes the direct runtime replica projection owner for
B and the existing retained-native-bootstrap contract/coupled pair.

## Runtime evidence

The composed input, raw output and result ledger agree: **10 files / 62 cases,
all passing on attempt 1**, on adams-gamla with retries disabled. Actual
runner concurrency was ordinary 3, bootstrap 2 and exclusive 1.
Log SHA-256:
`6a1522a8e70ae5ffee88525ccb5b401496590ee6784e4dbbeaffd02dbc38643a`.
Ledger SHA-256:
`ea6c179c17c11471ff41c831c44ebc3b5a22c9df01944f6116fac9b9f415327e`.

The raw semantic-control results were independently inspected:

| Mutation candidate | Observed discrimination |
| --- | --- |
| `34ca6d5738cfc45995104df8268d2eb66614fbd4` | Original 14 protocol cases pass; both new cases fail on missing nested provenance after engagement. |
| `27d00cd4be71fe4445fc20a2049e933b3ae63b60` | Unexpected delivered ENABLE count 1 instead of 0. Receiver refusal remains intact; this distinguishes pre-dispatch exclusion. |
| `187221614f26fd2bc2c16342d35a1ebf6cf09564` | A new unprivileged request returns `cut_over` instead of `release_operator_required`. |
| `aa66604f7e9dbfecd952d30e8e124317175c4dea` | Exact-old manager replay closes the published successor's database. |
| `4654c81a5e50326f9cded41bedf0cc6e0db0384a` | An actual native close failure produces an improper REMOVE completion. |

The two A controls leave the separate restart case passing. Each B control
leaves the other B case passing. These are targeted semantic failures, not
setup failures or timeout-only results.

The retry-suppression control is **blocked and unexecuted**. Its one-line
mutation exposes an unchanged fresh-create retry loop to the normal staged
decision-boundary guard. There is no applicable annotation exception.
Renaming identifiers, hiding the loop, changing baselines, bypassing hooks
or patching after checks would not be a compliant resolution. Guard
classification or fresh-create retry repair requires separately bounded
owner work. The positive recovery result does not supply the missing negative.

## Sole original-entry interpretation

The complete trace hash
`0c699ca94a218acd1913f022c5e407dcc3647c5c70bd039edce999bc3952b97f`
and 4,088,846-byte size were independently checked. Schema and counters
agree: one installation, 1,515 completed records, zero drops, capture errors
or incomplete records.

With deadline D, the affected dependent RELEASE starts at D-39 ms; its
nested control release succeeds by D-16; INSPECT settles by D-14 and PAUSE
by D-10. ENABLE dispatches at D-10 and returns at D+10 with observed origin
index 2 / term 1 and local applied/commit/last indexes 2. The outer request
returns its deadline refusal at D+11. No affected applied-position observation
or RESUME is dispatched.

The precise source is the specialized observation-budget branch in
`src/node/participant-release-client.js:77-94`, consumed at lines 107-110
before dispatch at line 117. It is not the generic line-112 deadline guard
and not a native observation refusal. The existing after-commit application
owner corresponds to the returned origin; follower application, crash
durability and this startup's eventual recovery remain unproved.

All 82 control RELEASE calls succeed; 40 of 41 non-control RELEASE calls
succeed. Bootstrap reports ordinal 42/46, 41 completed and 3,011 ms elapsed
against 3,000 ms. The file remains red, two cases passing and three failing.
The historical control-owner refusal did not recur. Timeout is not
cancellation of the committed origin. The
[causal explanation](original-entry-32dfdc38/causal-explanation.md) preserves
the operation chain and limits.

## Partial receipts and gates

| Quest | Passing requirements | Requirements still false |
| --- | --- | --- |
| Provenance | Nested failure red/green; registered positives and branch controls; independent source and harness review | Exact-candidate audits and composition, because the combined audit/corpus obligation is incomplete |
| Recovery witness | Pre-ENABLE expiry safety; absent-origin authority and authorized progress; lost-answer restart and retained recovery | Semantic negatives; complete independent scope/evidence/static acceptance |

Both receipt files retain overall `status: fail`. No landing is approved.

The range-selected static aggregate ran 19 audits, skipped four and failed
five. The selector requires 2,416 test files because coverage file digests do
not bind its edges; focused green does not satisfy that corpus obligation.
The separate [static attribution review](static-attribution-20261020/attribution.md)
and its [additive terminology correction](static-attribution-20261020/correction.md)
distinguish introduced and inherited findings without waiving a gate.

The reviewer found eight ignored B raw logs absent from the initial `32df`
Git tree despite tracked checksum references. They must be preserved and
verified from committed blobs before packet completeness is claimed.
The later checkpoint supplies that preservation correction, without changing
the measured candidate.

The corrected snapshot/CDC report hash
`87445b37c8cf1c715ac04cedb2d32f38312de9b629baf23cfb96878372e7a497`
was independently approved against the existing O-series header and preserved
round-twelve historical worktree namespace. Its absence findings and unresolved
verdicts are unchanged.

These findings do not establish cross-host metadata authority, storage-loss
safety, complete fresh-seed recovery, resource bounds, U1/TX1/FreshMG closure,
publication or release acceptance.
