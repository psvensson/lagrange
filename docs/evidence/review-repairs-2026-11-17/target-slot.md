---
audience: evidence
recorded: 2026-11-17
---

# Target-slot observation repair

## Assignment and source

The operator authorized repair of the verified review errors on 17 November
2026. This component is authored by `core_args_control` on
`work/review-target-slot-fix-20261117`, from defect baseline
`4b0c8ec1de59e9a074afa97ce260afb2868685c5`. Root owns integration, managed-lab
execution, independent review and publication.

Loaded instruction owners: rule-set revision 5; `AGENTS.md`; rules/router;
`solver-quests.md`; the rebalancer owner card; runtime contracts and
authority-and-recovery; test fixtures, harness, regression and release-gate
policies; code style; concurrency, admission, owner-interaction and
harness-fidelity verification templates.

This is a direct repair under the unchanged
`phase-b-system-spread-policy-admission` contract. Before production edits,
root approved consuming the existing array without adding another read or
changing observation ownership. An additional boundary or policy change needs
a recorded scope/Quest reassessment.

## Writable paths

- `src/rebalancer/rebalance-coordinator-concurrent-budget-gate.js`
- `test/rebalancer/rebalance-coordinator-create-budget-intent-serialization.test.js`
- `test/rebalancer/target-slot-authority-fixture.js`
- `docs/evidence/review-repairs-2026-11-17/target-slot.md`

Test-selection metadata and generated inventories belong to root. No new
production state store, getter, SQL query, retry, timer, read budget or local
operation map is included. Priority-lane exceptions and Phase B policy remain
unchanged. Local product/test/checker execution and pushing are excluded.

## Proven cause and existing interaction

The repository initializes `lastIncompleteOperationObservation` as an array
(`replica-operation-repository.js:519`). Its real incomplete-operation owner
read passes canonical operations to `recordIncompleteOperationObservation`,
which clones that array (`replica-operation-repository-incomplete-read-methods.js:492`
and `replica-operation-repository-visibility-methods.js:306`).

The serialized ordinary ADD budget reader populates this observation before
the target-slot decision. The new collector instead reads `.operations` from
the array, silently losing the owner records. Correct that access only. The
different `getIncompleteOperationVisibilityObservation` API does return an
envelope; no additional call is needed just to convert this already-produced
array into that other representation.

The existing `create-budget:add` lane still spans budget admission and
operation persistence. The operation identity, target identity, terminal
predicate, global budgets and priority-lane policy remain with their current
owners. The receiving slot policy continues to count its supplied operation
records; a known occupying operation must not become absence at this binding.

## Original evidence and faithful regression

Managed-lab job 4904 at the exact defect baseline proved that two hidden live
owner records produced occupancy zero and permitted a third persisted row.
One hidden occupant permitted the valid second operation; two cache-visible
occupants refused the third. Native log SHA256:
`63d0d97e898e7460d4f05ecfef101bdc117be70a088aef7eaa8259bd6fa5636b`.

Job 4899's first fixture failure remains distinct: the generic SQL emulator
treated the production source-or-target predicate as source-and-target. The
regression fixture preserves canonical repository writes and executes that
exact owner-read SQL with its real parameters in native SQLite, using the
production schema/index builders and the fixture's independently persisted
rows. No admission decision is replaced. Cached delivery is delayed at the
existing fixture's cache-publication seam.

Acceptance through real `createOperation` and repository observations:

1. One hidden live occupant admits and persists the second operation.
2. Two hidden live occupants refuse the third, with the existing typed target
   slot reason and no extra persisted row.
3. Two visible live occupants still refuse the third.
4. The actual completion owner commits a terminal ADD transition; publishing
   that canonical terminal row releases capacity and the next create succeeds.
5. Existing serialized-lane and priority-dispatch witnesses remain green.

The first focused run must retain the known-bad baseline failure or an
equivalent causal revert. The new witness observes the actual repository
array before the target gate and asserts that the owner read engaged, so an
empty fixture or a detached helper cannot satisfy it. Real time is used; no
production timeout or retention interval is changed. Teardown shuts down the
coordinator and closes the native SQLite database.

This proves admission and owner persistence through substituted gateway,
readiness, storage and committed-membership ports. It does not prove physical
cluster dispatch, distributed durability or measured formation performance.

## Verification obligations

The following entries describe source review and the pending focused witnesses;
they are not managed-run results.

| Template | Applied evidence and boundary |
| --- | --- |
| Admission 1, 6: state and freshness | The serialized global budget read records the actual incomplete array before the synchronous target-slot consumer. The regression observes both the native SQL result and that array at the consumer. The existing planner and enforcement continue to use `system-spread-transition-policy.js`; no planner policy changes. |
| Admission 2, 3, 4, 7: reason and budgets | The same `createConcurrentOperationBudgetError` retains `BUDGET_EXCEEDED`, the target-slot reason, the actual occupying operation identity and limit two. Refusal tests check its existing shape. No wait, timeout or budget changes. |
| Admission 5, 8: release and progress | Actual `completeOperation` emits the canonical completion event and commits the terminal row. Publishing that row makes the same contender succeed, and replay adds no duplicate row. Existing continuation-wake witness remains selected. This does not measure distributed CDC release latency. |
| Concurrency 1, 2, 5: atomic interval | `runConcurrentCreateBudgetGate` retains the existing process-local `create-budget:add` lane across the awaited owner read and operation persistence. The repair adds no await and changes no lock key or target identity. Existing shared-lane tests hold one factory pending while another waits. No cluster-wide slot-CAS claim is added. |
| Concurrency 3, 4, 6: custody | Dispatch/replay claim ownership, priority dispatch, timers and durable workflow recovery remain unchanged. The focused release/replay case plus the existing priority-dispatch and continuation witnesses cover affected interactions; this repair does not certify arbitrary restart or lost-response cases. |
| Harness 1, 5: discriminating control | The known-bad baseline must show two hidden owner rows admitted as zero occupants. The new tests assert nonempty native results, real consumer engagement, zero creator hints and actual persistence/refusal; one hidden row is the valid control. |
| Harness 2, 4, 6: producer and entrypoint | Canonical `createOperation` records go through real repository persistence, with exact production SQL/schema/index builders for the owner read. `createTestCoordinator` composes the real global and target admission decisions. The only new substitution corrects the fixture SQL predicate evaluator. |
| Harness 3, 7, 8: time and ceiling | Real time, native SQLite and canonical row delivery are used. Readiness, membership, storage and gateway transports remain fixture ports. No interval is compressed. Both finite-delivery progress and refusal safety are asserted. First native failures must remain classified and retained by root. |

The terminal-publication case enters the real completion owner directly, as
valid target-completion evidence would. It proves that owner's committed
transition and its admission consequence; it does not manufacture a replica
effect or claim to have run a full dispatch/replication lifecycle.

## Separate stale-cache diagnostic

Retaining the older nonterminal cache row after an authoritative terminal
write is a separate diagnostic, not an assumed extension of this repair.
The incomplete observation legitimately removes terminal records, and the
existing Phase B policy can merge cached nonterminal rows again. If that
sequence demonstrates another cause, retain and report it before editing
policy, changing authority or expanding acceptance. Ordinary publication
release remains part of this repair's positive progress control.

The standalone managed-lab diagnostic is
`/workspace/scratch/1d848e6f888d/target-slot-retained-cache-diagnostic.mjs`.
It retains the old cache object across the real completion commit, checks the
fresh owner array, then publishes the actual terminal row and retries on the
same coordinator/cache/repository bindings. Its result must remain separate
from the array-shape acceptance and any broader starvation claim.

## Current status

The consumer now reads the actual retained array. The existing registered
serialization suite contains the one-hidden, two-hidden, two-visible and
ordinary terminal-publication release cases, using the dedicated native-SQL
fixture. No production read, state, budget or policy was added.

Managed-lab validation and independent review are pending. No local project
code or checker has run. No repair approval, landing, publication or
campaign-measurement claim is made here.
## Managed repair verification, 17 November

Job [4910](https://github.com/psvensson/lagrange-lab/issues/4910) ran the exact
component source `15e862b306a47e0d8471ca33ecb42a73342904be` (tree
`261f649e74e79d051d32c854d6084d4546c2022c`) on `local-workstation` and closed
all execution, container and thermal scopes. The complete 18,757-byte native
log has SHA256 `23bdf5bac1870606e625761c0606a61266ab076a9cbe0b5c9660a0e1098958f4`;
the original worker log has SHA256
`343d818575eeff6fce8a86dd5d9cd3f84da1965dfa3b4a5fced076f085d09828`.

With the new test and fixture on the original `4b0c8ec1` product, real owner
query and array engagement passed. One hidden occupant was counted as zero;
two hidden occupants admitted and persisted a third. The visible-occupant and
completion/publication/retry controls passed. The repaired candidate passed
all five registered interaction suites, reporting 272 assertions. ESLint,
file-size, literal, decision-boundary and silent-catch checks passed for their
applicable scopes. The ambient-intrinsics checker had zero applicable files
and supplies no broader coverage claim.

Independent source review by `core_args_runtime` found no blocking defect;
root inspected the source, fixture and complete native evidence. This accepts
the bounded array-binding correction, not physical formation or publication.

### Separate retained-cache observation

The separately retained diagnostic in the same run confirmed that the existing
cache union can retain an excess slot after a genuine terminal commit and an
authoritative by-ID read. The next owner query returned only the remaining live
operation, while the older cached PENDING row still caused refusal. Publishing
the actual terminal row allowed admission on the same coordinator, repository
and cache.

This is a publication-dependent admission delay. The run does not establish
indefinite starvation, real CDC latency, or a missing automatic wake. It is
owned by the repository-observation / Phase B admission / publication-wake
interaction and remains separate from the repaired array binding. Removing
cache contributions or changing authority/re-drive semantics requires its own
scope assessment and causal physical witness; this repair makes neither change.
