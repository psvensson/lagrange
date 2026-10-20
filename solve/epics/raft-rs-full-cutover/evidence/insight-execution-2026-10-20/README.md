---
audience: development
documentClass: evidence
---

# First insight execution checkpoint, 2026-10-20

Status: **HOLD for landing and release**. The bounded provenance repair and
selected A/B owner witnesses are implemented and independently reviewed.
The composed candidate passed 10 files / 62 cases. The original seed file
remains red, the retry-suppression control is blocked by an audit, and the
required corpus and release gates are incomplete.

The [approved plan](../../insight-execution-plan-2026-10-20.md) remains planning
authority. This checkpoint does not amend an older seal or certify U1, TX1,
FreshMG, activation, the cutover or a release.

## Candidate and ownership

The execution tree is `work/control-refusal-provenance-20261020`, built from
`be93c7e5d9a76a39e76a530c93715521b2281356`. Its product/analysis ancestor is
`be25caa5f0c3612feec662d4feaa9ba28f8f34df`. The composed runtime measurement
is pinned to **`32dfdc388cf80c695b70207e1b659bce8d5d6ad5`**.
Later evidence and documentation commits do not retroactively become measured
runtime commits; the [input manifest](execution-inputs.json) binds the source
and witness bytes.

The shared integration checkout and its pre-existing staged work were left
untouched. A recovery writer, a physical-custody writer and an independent
source reviewer worked in isolated trees. Root owned the shared fixture
composition, the three product files and the final evidence integration.
Mutant source branches are experimental controls and are excluded from the
positive branch.

The product change preserves three bounded primitive observations from an
already returned failed control answer: `controlMissingFact`, `controlPhase`
and `controlReason`. Each is at most 512 UTF-16 code units; unavailable,
inherited, accessor, proxy and non-string values supply no observation.
They grant no authority. The repair adds no owner acquisition, protocol
dispatch, retry, deadline extension or durable effect.

Normal precommit audits also required extracting existing operations within
the same cutover owner. Operation and read ordering were independently
reviewed. Tail-called async phases add Promise adoption and may delay outer
settlement; schedule equivalence is not claimed. The composed native run
includes these exact bytes.

## Measured owner interactions

| Unit | Trigger and current authority | Effect, durable boundary and remaining owner |
| --- | --- | --- |
| A: expiry before ENABLE | The actual control release succeeds; the dependent PAUSE answer consumes the original deadline. | The client sends no dependent ENABLE. The dependent has no origin and remains closed; the prior control origin remains. The authorization owner requires current fresh-storage or operator authority for the no-origin continuation; this witness uses a new operator request. |
| A: lost ENABLE answer and restart | The registered route commits a dependent origin before its answer is lost. The same native files are recreated; actual dependent consensus notifications are dropped and current control authority is unavailable. | Recovery refuses while retaining the origin and closed admission. After control recreation, the existing scheduled retry obtains current facts and opens the exact replacement, allowing a real SQL write. The timer is a wake, not permission. Its necessity remains incompletely discriminated because the suppression control is blocked. |
| B: pending exact-old stop | An actual bound service is created and published. Exact-old endpoint deletion is held before physical retirement. | A successor may be selected, but its metadata resource publication grant is refused while predecessor custody remains. After exact-old cleanup, the successor is created. Replaying the exact-old manager STOP through the physical sink leaves that successor's database, object, endpoint and row intact. |
| B: uncertain native close | The actual old database close throws during registered REMOVE. | REMOVE does not complete. The old database/object, cleanup obligation, releasing resource and in-progress journal remain owned. The successor grant is refused. Restoring close and retrying the same operation completes cleanup. |

These are actual registered/native interactions in controlled component
fixtures. A uses retained RF1 stores; B includes native RF3 formation in one
process with a component metadata gateway. Neither is a cross-host metadata,
storage-loss, resource-bound or production latency certificate. The ordinary
unbound WASM creation route is explicitly excluded by its existing contract;
the generic legacy physical ingress remains a separate unresolved obligation.

The [A witness design](../../../../quests/participant-release-deadline-recovery-witness/design.md)
and [B design and corrections](../../../../quests/wasm-creation-genesis/evidence/recovery-20261017/u1-bound-stop-composed-witness-design-20261020.md)
record the full operation chains and fixture ceilings.

## Positives and discriminators

All listed native measurements used the existing locked lab runner with
retries disabled. Different hosts and thermal observations are recorded in
the raw logs; timings are not a comparative performance result.

| Measurement | Exact commit | Result |
| --- | --- | --- |
| Provenance red, actual protocol | `0e9ff4fdc11152e6b4da39adb5a1046615d19be4` | Original 14 cases pass; both new cases fail only on missing nested provenance after engagement. |
| Provenance and recovery positive, adam-laptop | `a72609dadfca7f8292c347d041175990b09e2c54` | 8 files / 57 cases pass. |
| B positive and existing embedding, adams-gamla | `0e19f5e07da01d6d8fe59131b7617ac8ed33b758` | 2 files / 5 cases pass. |
| Composed A/B, adams-gamla | `32dfdc388cf80c695b70207e1b659bce8d5d6ad5` | 10 files / 62 cases pass, attempt 1. |
| Projection removed | `34ca6d5738cfc45995104df8268d2eb66614fbd4` | Both provenance cases fail on missing details; the original 14 pass. |
| Client deadline exclusion weakened | `27d00cd4be71fe4445fc20a2049e933b3ae63b60` | Unexpected delivered ENABLE count 1 instead of 0. The receiver still refuses; this distinguishes pre-dispatch exclusion. |
| No-origin authorization bypassed | `187221614f26fd2bc2c16342d35a1ebf6cf09564` | A live unprivileged request returns `cut_over` instead of `release_operator_required`. |
| Physical target reduced to service ID | `aa66604f7e9dbfecd952d30e8e124317175c4dea` | Exact-old STOP replay closes the published successor's database. |
| Failed cleanup marked final | `4654c81a5e50326f9cded41bedf0cc6e0db0384a` | An actual close failure falsely completes REMOVE. |

Each A mutation leaves its other case passing; each B mutation leaves its
other case passing. Setup failure and timeout-only failure were not accepted
as semantic negatives.

The retry-suppression mutation has **no commit or native verdict**. Touching
its recovery owner exposes an unchanged fresh-create retry loop to the normal
decision-boundary audit. Independent review found no permitted mechanical
resolution within this witness-only seal. Its exact proposed patch, normal
hook failure and blocker record are preserved. No hook, guard, baseline,
deadline or assertion was weakened.

Evidence:

- [Independent source, harness and measurement review](../../../../quests/participant-control-refusal-provenance/evidence/independent-review-20261020.md)
- [Composed inputs and results](../../../../quests/participant-control-refusal-provenance/evidence/composed-candidate-32dfdc38/input.json)
- [A negative controls and blocked attempt](../../../../quests/participant-release-deadline-recovery-witness/evidence/negative-controls-20261020/README.md)
- [B positive packet](../../../../quests/wasm-creation-genesis/evidence/recovery-20261017/bound-stop-native-positive-20261020/SHA256SUMS)
- [B negative packet](../../../../quests/wasm-creation-genesis/evidence/recovery-20261017/bound-stop-native-negatives-20261020/README.md)

Commit `32dfdc38` initially omitted eight ignored B raw logs despite their
checksum references. The later preservation checkpoint tracks lossless JSON
representations of those logs and verifies their decoded bytes against the
original manifests from Git objects. This correction changes no measurement.
The same representation preserves whitespace in other raw runner outputs.
See [evidence verification](EVIDENCE-REPRESENTATION.md).

## Original entry and unresolved recovery

The one declared original-seed measurement ran at `32dfdc38` on adam-laptop.
The file has two passing and three failing cases. Its complete passive trace
contains 1,515 completed deliveries and no drops, capture errors or incomplete
records. All 82 control RELEASE calls returned `cut_over`.

The first terminal seed divergence is on `sql_transaction_participants-p1`.
ENABLE starts 10 ms before the shared deadline, returns an observed origin
10 ms after it, and the client refuses applied-position observation before
dispatch. Bootstrap reports 3,011 ms against the unchanged 3,000 ms budget,
ordinal 42/46 and 41 completed cohorts. No affected final census or RESUME
follows in this trace.

This differs from the earlier measured pre-ENABLE expiry. It does not
reproduce the historical `current_control_owner_fact` refusal. Neither
nonrecurrence nor the separate recovery fixture proves that this startup
recovers. The committed origin is an outstanding obligation; expiry is not
cancellation. The two other failing cases observe paused mutation admission.
Their failure records remain open rather than being relaxed.

The [source-bound causal explanation](../../../../quests/participant-control-refusal-provenance/evidence/original-entry-32dfdc38/causal-explanation.md)
links the exact trace, owner chain and limits. No additional seed run was
used to seek a preferred schedule.

## Read-only C/D/E results

| Review | Current finding and next required witness |
| --- | --- |
| [Placement sanction and shared budget](placement-sanction-shared-budget-review.md) | Existing durable carrier and common budget serialization exist. The carrier's sealed scope is decision-neutral. Compose actual operations sharing one allowance across loss/restart and native promotion before claiming enforcement or double spending. |
| [TX1/TX2 prerequisites](tx1-tx2-prerequisite-review.md) | Existing decision, prepared-work and replay owners retain their seals. Current parent/child evidence is incomplete; TX2 handoff and reclamation are not supplied by topology hints or local TTL. Preserve overlapping historical work and continue TX1 within its existing prerequisites. |
| [Snapshot/CDC lineage and coverage](snapshot-cdc-lineage-coverage-review.md) | Event/debt correspondence does not establish committed recipient coverage. Current source, historical design approval and absent implementation paths remain distinct. The native custody case's earlier recipient-proposal failure is not evidence for its later custody assertions. |

## Gates and next owner decisions

The provenance receipt is partial: three of four requirements pass. The A
recovery receipt is partial: three of five pass. Both retain `status: fail`;
neither Quest has landed. Existing U1 and historical passive seals are
unchanged.

The canonical range-selected static aggregate at `32dfdc38` ran 19 audits,
skipped four and failed five. The clean predecessor ran all 23 and failed
six. Independent comparison found seven removed complexity violations and
one removed cognitive violation, with no added ones. The operation-progress
and retired-namespace findings match the predecessor. The emitted guideline
summary matches, but does not enumerate every finding. Six newly introduced
documentation references were corrected; all 292 predecessor documentation
findings remain. Historical attribution does not waive any gate.

The proof selector requires the full **2,416-file corpus** because its
coverage digest input does not bind the coverage edges. This corpus was not
run, and the focused result cannot stand for it. No Solver landing, publisher,
main merge, distributed release formation or physical release certification
was executed.

The next bounded work is to resolve the retry-control audit through its
existing owner and to follow the original startup's post-ENABLE obligation
through its failure/cleanup and recovery owners. That continuation needs its
own reviewed contract and actual-entry witness; increasing the seed deadline
or borrowing the RF1 fixture result would not establish it. Composition,
historical failure recovery, publication and frozen-head certification retain
their original independent gates.
