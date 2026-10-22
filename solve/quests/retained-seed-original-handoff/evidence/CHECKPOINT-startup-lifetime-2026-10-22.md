---
audience: development
documentClass: evidence
---

# Startup-owned original lifetime: measured checkpoint

## Exact measured revision and result

The startup-to-native boundary is implemented on
`work/original-handoff-boundaries-20261021-cloud` and measured at
`328532f0274c2a6ed7ce9e1af6a4fcc941bdc84d`.

[Lab #792](https://github.com/psvensson/lagrange-lab/issues/792#issuecomment-6339380493)
completed on tv-dator at 2026-10-22T11:14:38.703Z: **7/7 selected files
completed, 79/79 runner-reported tests passed, zero failures, cancellations,
skips or todos.** Execution, thermal and container scopes are closed.

[Lab #793](https://github.com/psvensson/lagrange-lab/issues/793#issuecomment-6339331559)
completed on local-workstation at 2026-10-22T11:11:57.079Z. Its complete
[evidence #796](https://github.com/psvensson/lagrange-lab/issues/796#issuecomment-6339355973)
confirms all three exits are zero:

- Canonical test metadata audit, with 2,438 test files classified.
- `check-fast-static.js --base 7766ccafbe3767c9e397fabf97f41a197d7fb53e`.
- Tracked-tree diff check.

Those scopes are also closed. The exact requests, receipts and full retained
logs are in MEASURE-startup-successor-328532f0-2026-10-22.json and
REQUEST-startup-successor-328532f0-2026-10-22.json. Read-only export #798 and
evidence #801 recovered the original successful worker bytes without rerunning
the tests; both operations are complete. No owned work is queued or running.

The 79-test total belongs only to 328532f0. It includes the 21-case startup
file plus all 58 tests in the six existing lower-boundary files, rerun
together on this same revision. Earlier results are not added to this total.

## Implemented boundary

The actual seed startup supplies the real directory custodian and startup abort
signal to BootstrapService. One preparation settlement is established before
the bootstrap workflow, infrastructure reconciliation or public BootstrapAPI
initialization can act. Build measurement is followed by renewed ownership
checking, and the preparation object enters exact cleanup custody before its
first allocation acquisition.

The existing preparation owner admits creation descriptors against the complete
original allocation. Admission owns the exact member and native identity,
paths, peer mapping, deferred election, canonical immutable schema and opaque
opening capability. Creation queues cannot mutate desired state or their maps
before this check. Both actual creators recheck after stagger waits and carry
the same opening through the real service to the native operation port.

Shutdown and failure revoke the attempt before yielding. Native services enter
host custody before initialization can complete. A partition's presence in a
creation map does not count as settled creation: pending or failed initialization
remains a typed resource hold. Router construction is retained before setup can
yield; cleanup joins router and lifecycle-owner acquisition, stops the actual
reconciler cadence and retains failed closes for an exact retry.

Seed infrastructure uses the existing listenerless router path with external
admission closed. Retained declarations still return the named
CLASSIFICATION_UNAVAILABLE hold. Elections, ordinary registration, external
admission and successful startup continuation still return
CONTINUATION_UNAVAILABLE. This bounded WIP cannot complete either a fresh or
retained startup.

## Failure lineage and witness correction

| Revision and run | Measurement | Meaning |
| --- | --- | --- |
| 7766ccaf / #735 | 6/6 files, 58/58 tests | Earlier opening/participation checkpoint; preserved as its own result. |
| 3fa20cef / #766 | 2 tests, both failed by engaged assertions | Runtime source identical to 7766ccaf; original queue admission and direct native creation were not fenced by a startup-owned attempt. |
| 7fa4d79a / #769 | 79 tests, 75 pass, 4 fail | Both baseline admission negatives pass. Four new transport observations incorrectly required a literal Boolean false. |
| 328532f0 / #792 | 7/7 files, 79/79 tests | Four reviewed oracle corrections and their later assertions complete on unchanged production source. |

The baseline failures were “Missing expected exception” and “Missing expected
rejection”, through existing APIs rather than missing-method, setup or timeout
failures. Their selected callback bodies remain byte-identical across the
baseline, the original candidate and the revised witness.

Independent source review identified four material draft defects before the
candidate was preserved: native message-group custody after initialization,
partition map presence mistaken for completed initialization, caller-owned
schema reaching DDL, and infrastructure acquisition completing after shutdown.
Those were repaired in their existing owners and covered by seven additional
witnesses.

The four later lab #769 failures had a different proven cause. The unchanged
router owner returns undefined when its self-node connection entry is absent;
its existing tests already assert falsiness. Each new strict-false expectation
was corrected to the established predicate contract and paired with the
stronger exact requirement that the self-node entry be absent from the map.
The server-null and every admission, native, durable-right and custody
assertion stayed unchanged. Production source was not modified for that
oracle correction.

The original 14-case prefix remains in historical commits 3fa20cef and
7fa4d79a. Two oracle changes affect that prefix in the revised file, so the
new file has a new identity and makes no unchanged-prefix claim. The old
failed log and 75/79 result remain intact. The successful full log reports
all 21 startup cases individually as ok, including all six continuation calls
within their complete sequential test.

## Content and evidence binding

| Item | Identity |
| --- | --- |
| Measured repository tree | `3a8369d78e66d4ce618040d1b65aab9ac0170d0a` |
| Complete production src tree | `a3e339f8977ed79796579a3f66cec091267343e8`, identical at 7fa4d79a and 328532f0 |
| Complete test tree | `e6824895267250dd03c2ff51c5d9e135204b22ec` |
| Approved 20-file production manifest SHA-256 | `550cd6fbe3c5a982933066921cfdf691228cfa45765fc8036efd6bce2985fdae` |
| Revised 21-case witness SHA-256 | `2421740ecafb0c9dcb457be3e1ef8286321645a426d23f7814d2d9a91d1e086f` |
| Successful 18,183-byte worker log SHA-256 | `80e03c63f1c44c60944d61b9ff0341ef498c0ebf7a133f42c5c9dd7a02876ca7` |
| Complete 1,603-byte static output SHA-256 | `cef2e59d61e1c6b9fd2cc7e345d71e5b40b5ddbe6fef4a066246b06b3bfc994a` |
| Preserved failed 21,297-byte worker log SHA-256 | `c2116fe04a9e48a11919865b822d01a0e3f9cdb506a24f9f3d90c79365bd26ec` |

Independent reviewer `/root/opening_review` APPROVES the exact source, revised
witness and bounded measured result. Entry 7 of
REVIEW-startup-lifetime-2026-10-22.md records the result review; that complete
48,653-byte append-only review has SHA-256
`fdb57472f11ad0c3790393d909ff662e355e747a8df610791e6abd47b0ce23dd`.
Its earlier source findings, oracle correction, original failures and scope
limits remain intact. This approval is limited to the startup-to-native WIP.

The corrected witness passed the normal local pre-commit hook at bb96af78,
including canonical inventory and metadata refresh. An evidence-only normal
commit followed at 3a4aa540. The GitHub object APIs preserved that exact tree
as 328532f0, and both API ref and fetched Git objects were verified. The local
normal-hook history remains on
`work/original-startup-oracle-local-20261022`.

A later evidence-only checkpoint commit may contain this report and the final
review/receipts. The native batch and static run above measured 328532f0;
evidence-only descendants are not relabeled as separately executed candidates.

## Remaining static finding and acceptance ceiling

The normal source pre-commit at the earlier candidate recorded
`mixed_cache_and_sql_decision` in `createBootstrapPartitionReplica`.
The same file/function/kind finding exists on unchanged 7766ccaf, once at each
revision. It remains routed to the guideline-audit owner. No baseline, checker,
identifier or assertion was changed to conceal it.

The test-only hook scans zero production files for that decision audit. Its
success and the separate fast-static PASS do not clear that source finding,
prove the full corpus, or grant publication. This branch is preserved WIP.

All eight sealed handoff receipts remain false and unchanged. There is no
Solver landing, main merge, complete public startup, serving approval or
release claim from this checkpoint.

## Next owner and implementation boundary

The continuing integration owner is root. The next product boundary is the
existing durable/application owners' read-only retained-command classification.
Use the complete native record, keeping applied history,
committed-but-unapplied work and locally uncommitted suffixes distinct. A null
applied participant origin cannot establish that no ENABLE has committed.
The existing applied-proposal reader does not cover the pending interval.

The approved R1/R2 correspondence requires canonical original command/effect
classification, coherent native ranges and snapshots, immutable allocation
identity and preservation of real pending obligations. Legitimate original
ENABLE must remain replayable through the existing native/application
transaction; an empty-history control or type-only allowlist cannot supply that
proof. Unknown or contrary work remains a named hold.

Cold opening also needs its actual consumers to carry durable-record membership
instead of the fresh declaration's GENESIS stamp. Native restoration may apply
committed work or announce roles before later registration guards, so the
required autonomous-effect exclusions must accompany any admission of that
path. Current CLASSIFICATION_UNAVAILABLE remains until that interaction exists.

Protected activation through exact leader acknowledgment and durable transfer,
complete public-admission exclusions and the composed two-start public proof
remain later unfinished work. The existing seals and all eight receipt terms
continue to own their acceptance.
