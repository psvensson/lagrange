---
id: es6-owner-safety
status: open
proof: deterministic
audience: development
documentClass: planning
roadmapRow: RM-0.2.9-published-operating-contract
doneWhen:
  probe: test-receipt
  args:
    file: solve/epics/es6-owner-safety/evidence/receipt.json
    requiredReceipts:
      - committed-batch-recovery-witness
      - durable-prepared-conflict-authority
      - production-construction-and-binding
      - proposal-attempt-replay
      - runtime-contracts-and-owner-navigation
      - independent-verification
quests:
  - replica-placement-admission-owner
authorizes:
  - src/partition
  - src/query
  - src/rebalancer
  - src/control-plane
  - test
  - dependency-cruiser.config.cjs
  - eslint.config.js
  - architecture/contracts
  - solve/quests
  - solve/epics/es6-owner-safety.md
  - solve/epics/es6-owner-safety
---

# ES6 owner safety and production verification

Make the participant transaction and placement interactions easier to change
correctly: one durable authority, validated construction, canonical runtime
records, and tests through actual production application and replay. The pilot
uses ordinary ES6 JavaScript and the existing Node runtime, lint, dependency
checks, test runners and evidence owners.

The user approved this plan and its documentation merge on 19 November 2026.
Current coordination and any unresolved assignment are recorded in
[operation integrity](operation-integrity-and-reliable-formation.md#current-work).

## Current work

The integration owner maintains live source, assignments, blockers and next
actions in [operation integrity](operation-integrity-and-reliable-formation.md#current-work).
Reconcile this pilot's packages and receipt applicability there before starting
overlapping work. The checkpoint below retains its dated implementation credit;
it does not establish a current candidate, writer or runtime acceptance.

## Planning checkpoint (20 November 2026)

- **Planning base:** main `3f5a67599e5b91138e34977934703c9af2eaee15` (PR #229),
  refreshed at WP0 to main `5edfcadb508f9a82783159026364d3005836cc5c` (PR #234),
  rule-set revision 5. Loaded authorities: AGENTS, rules, router, Quest workflow,
  Solver runbook, roadmap policy, feature map and documentation-only proof policy.
- **Integration base:** candidate `0970ab012f65456cad34cfadfa92fb420f7f09ef`
  -> `d66a533196b53c2193e8c2baf6e68655d8493e2a` ->
  `5a5f8baf554129fd7bb335ea837b851106c3683a` ->
  `6c0bdff11f24e32459178e9d2c0d9f563e7cd790` on
  `candidate/reconciliation-20261119` (composed with the 20 November 2026
  WP0–WP10 ES6 strengthening and integration programme coordinated in
  [`operation-integrity-and-reliable-formation.md`](operation-integrity-and-reliable-formation.md)).
- **State:** packages P1 (`committed-batch-recovery-witness`), P2
  (`durable-prepared-conflict-authority`), P3 (`production-construction-and-binding`),
  P4 (`proposal-attempt-replay`), and P5 (`runtime-contracts-and-owner-navigation`)
  are implemented in ES6 JavaScript, including the post-review durable generation
  footprint ledger (`_partition_write_generation_history`), retained historical
  `PREPARED` contradiction inspection (`inspectRetainedPreparedObligations` /
  `HISTORICAL_PREPARED_CONTRADICTION`), pre-fingerprint placement outcome replay,
  durable unresolved placement attempt persistence (`_placement_owner_unresolved_attempts`)
  and late `REFUSED` recovery on `LEADERSHIP_START`, automatic production attachment
  via `PartitionService.prototype.ensureReplicaPlacementOwnerAttached()`, and the
  real `requestPlacementAdmission` / `requestPlacementHoldRelease` formation drain
  witness. The historical [receipt](es6-owner-safety/evidence/receipt.json)
  records classified results, source/test digests and independent reviewer names.
  The recovered task-3804 output confirms 18 passing files and 1,428 assertions,
  but does not itself bind the executed source, runtime and host. Original-run
  provenance and composition applicability remain with programme item 07; this
  is implementation credit, not full current acceptance.
- **Programme continuation:** items 02-06 consume P1-P5 and the later deadline,
  terminal-consumer and completed-growth repairs. Close the remaining persistence
  adapter/policy strictness, admission work custody and real production
  construction/recovery proofs before dependent service claims. Item 08 applies
  interface clarity during those owner repairs; no TypeScript/checkJs migration
  or new dependency-injection framework is introduced.
- **Remaining physical/service gates:** the placement Quest
  ([`replica-placement-admission-owner`](../quests/replica-placement-admission-owner/quest.json))
  retains its physical lab drain (`lab-drain-mechanism-and-metrics-product-defaults`)
  and comparative smoke (`comparative-smoke-setup`) receipts under
  [`operation-integrity-and-reliable-formation`](operation-integrity-and-reliable-formation.md).
- **Handoff:** [local client instructions](es6-owner-safety/local-client-handoff.md).

## Scope and existing authority

This is bounded correctness and maintainability work within the existing
[0.4.1 operating-contract allocation](../../docs/development/agpl-feature-map.md#phase-041--bounded-correctness-and-claim-repairs).
It adds no product version, release track, new SQL capability or broader
readiness claim. The [operation-integrity epic](operation-integrity-and-reliable-formation.md)
retains service coordination and the [stabilization epic](release-0-2-7-stabilization.md)
retains its acceptance. The [navigability epic](code-navigability-and-mistake-resistance.md)
retains repository-wide ratchets, decoder work and file organization.

| Concern | Existing owner to preserve | This epic's contribution |
| --- | --- | --- |
| Participant decisions and reservations | [TX1 Quest](../quests/replicated-transaction-decision-and-apply/quest.json), its current design and participant store | Batching/recovery witnesses and a bounded repair of durable conflict authority |
| Transaction fast path | [Scenario A transaction Quest](../quests/scenario-a-transaction-coordination-fast-path/quest.json) | Reconcile existing concurrency changes before assigning another writer |
| Placement admission and cutover | [Candidate placement Quest](../quests/replica-placement-admission-owner/quest.json) | Construction, real binding and replay obligations within that owner's cutover |
| Runtime collaborator validation | Existing readiness construction/wiring owner; placement owner for its own inputs | Reuse the JavaScript validation pattern on the selected real constructors |
| Proof and publication | Existing Quest, receipt, interaction-selection and publication owners | Better witnesses and exact-content review, without a second proof system |

The placement Quest exists on the reviewed candidate and is not present on the
planning main. Its pinned link is intentional. The local client reconciles it
into its actual work graph; it must not recreate its admission authority under
a new name. The Scenario A fast-path Quest is historically solved; any newly
demonstrated defect uses a bounded successor, not an edit to that seal. Terminal
Quest history and historical receipts remain unchanged. Broad architecture
convergence remains subject to its existing activation gate; this pilot does
not authorize that programme through a maintenance label.

The `authorizes` list is an outer boundary, not a worker assignment. Each actual
Quest records exact writable paths, producer/consumer symbols, candidate/base,
dependencies and exclusions before writing. A necessary change outside that
assignment is recorded under existing authority before editing. Do not widen
this maintenance pilot to unrelated owners.

## Fixed implementation constraints

1. **ES6 JavaScript only.** Follow the standing
   [language and toolchain constraints](../../docs/development/code-style.md#language-and-toolchain).
   This pilot does not authorize syntax, dependency or runtime migration.
2. **One semantic path.** Reuse existing owners and remove the replaced path
   with its affected callers. No compatibility reader, dual authority, silent
   fallback, dormant replacement behind a flag, or test-only safety policy.
3. **Bounded mechanisms.** No new DI/schema/state-machine framework, generic
   outbox, duplicate transaction ledger, simulator project or context generator.
4. **One writer per changing interaction.** Parallelize read-only review and
   independent work. Coordinate the local client's existing source work and
   integrate dependent changes in order; do not reset or discard its WIP.
5. **Evidence has a ceiling.** Shape checks, import checks and pure-function
   tests do not establish durable authority, production activation or physical
   fleet behavior. Keep bounded repair, service and release claims separate.
6. **Use existing gates.** Do not weaken ratchets, rewrite old evidence, invent
   successful receipts, bypass gates or add delays/polling to hide a failure.

### Superseding the earlier type-checking direction

The user's ES6-only decision supersedes the proposed TypeScript/checked-JS
mechanism for this pilot. The historical
[contract-first authoring Quest](../quests/contract-first-authoring-and-producer-fidelity/quest.json)
contains `real-producer-contract-typecheck` and a type-checking prescription.
That sealed record and its receipts remain historical; they are not renamed,
reinterpreted or counted as proof of this work. This epic uses actual runtime
construction, producer conformance and negative behavior witnesses instead.
When an active sealed work item inherits the incompatible mechanism, append the
specific supersession and use a bounded successor before implementation; do not
edit the old seal or add a compiler to satisfy it.

The underlying goals survive: malformed inputs and missing required methods
are rejected, fixtures consume real producer contracts, and the real interaction
demonstrates refusal, recovery and cleanup. Ordinary JavaScript cannot promise
repository-wide phantom-member rejection or static exhaustive outcome handling.
Only the exercised and checked boundaries receive those narrower claims.

## Ordered implementation packages

P1-P5 are package labels, not already-started Quests or an additional task
system. Keep `quests` empty until the local client binds actual executable
records. Continue an existing active Quest where it owns the interaction and
its seal permits the work; otherwise create a bounded successor and link it
here. Do not reopen a solved record or create a duplicate implementation owner.
Seal a Quest only after its actual probe measures a genuine negative.

### P1. Expose batching and reconstruction in the existing apply fixture

**Start here.** Extend the existing
[committed-application helper](https://github.com/psvensson/lagrange/blob/0970ab012f65456cad34cfadfa92fb420f7f09ef/test/test-helpers/controllable-consensus-port.js#L92-L120),
which already uses the production codec and application-transaction owner but
currently supplies one entry. Accept an ordered command sequence and explicit
batch boundaries, using the existing test runner and storage fixtures.

Witnesses must exercise the real participant/store/application path:

- Replay the same fixed committed order as `[1, 1]` and `[2]` batches.
- Reopen retained SQLite state after PREPARE and between application boundaries,
  reconstructing owners without volatile histories or caches.
- Inject an application failure and show that rows, reservations, outcomes and
  applied position roll back together; failed-transaction notifications do not
  escape as success.
- Compare authoritative rows, participant decisions, retained results and
  relevant durable obligations. Do not require incidental metrics or observer
  scheduling to be identical, and do not compare different committed orders as
  though they must choose the same winner.
- Demonstrate that the known batching defect is rejected. An implementation
  that lacks the behavior needed by P2 stays red honestly.

**Done:** the helper's declared behavior is independently verified, and the
production regression discriminates faulty from correct application. P1 may
land only coherent passing helper tests while retaining a bounded product
reproducer in the owning Quest, or integrate the product regression with P2.
Do not weaken, skip or bless a failing regression to land a green test-only PR.

### P2. Make PREPARE's promise durable and complete

Use the existing
[participant store](https://github.com/psvensson/lagrange/blob/0970ab012f65456cad34cfadfa92fb420f7f09ef/src/partition/partition-participant-transaction-store.js#L1-L10).
Record the complete transition and supported conflict scope with the current
TX1 owner before changing its persistence contract.

- Persist PREPARED and its reservations atomically in the real application
  transaction. Retain protection until the recorded decision settles it.
- Cover the supported operation's full conflict domain, including relevant
  secondary UNIQUE/index semantics and schema assumptions. Primary-key
  disjointness alone does not prove independence. Use SQLite's actual semantics;
  do not invent an independent JavaScript uniqueness evaluator.
- Make ordinary writes and schema changes respect outstanding reservations.
  A declared broader reservation for operations without a proven fine-grained
  scope is part of the same reservation policy, not a catch-and-fallback path.
- Make committed decisions depend on durable authority, with disposable local
  accelerators reconstructed from that authority. Do not merely move a history
  callback earlier or delete generation checks before replacing their protection.
- Give the repaired applier a validated command, committed position and narrow
  store operations. Preserve the real committed-entry/application transaction;
  a small facade or `db.inTransaction` alone is not proof of that provenance.
- Keep authoritative changes and owed work transactional. Notifications follow
  commit; an in-memory effects list is not a durable outbox. Reuse existing CDC
  and obligation owners and keep rollback behavior explicit.
- Define treatment of already persisted PREPARED rows, reopen and snapshot
  reconstruction before changing stored representation. Preserve their promises
  through the existing migration/recovery mechanism; never discard or silently
  abort them or add a permanent alternate reader. A needed change to a sealed
  persistence premise is explicitly superseded first.
  Fence conflicting new admission until the owner can establish the retained
  reservation from authoritative facts or authoritative recovery settles the
  obligation. If historical rows already contradict each other (for example,
  incompatible UNIQUE writes with two committed COMMIT decisions), retain and
  report the blocked obligations through the existing TX1 owner for explicit
  incident disposition. Do not invent rollback, claim both writes succeeded or
  count that unresolved state as a passing recovery case.

**Done:** P1's same-log batching/restart/rollback witnesses pass, as do same-key,
same-UNIQUE-value/different-key, genuinely disjoint, ordinary-write, schema and
history-pressure cases. At least two supported disjoint transactions must both
become durably PREPARED before either decision, then both bound COMMITs succeed
exactly once. Distinct-primary-key attempts conflicting on a secondary UNIQUE
value must be prevented from receiving two incompatible PREPARE acknowledgements.
Reuse the existing native three-replica participant fixture and real transaction
producer/coordinator path for a bounded witness of that progress and refusal;
a crafted committed stream alone is insufficient. Replicas with different
disposable local state reach the same authoritative result. Retained PREPARED
obligations survive the declared recovery path. Removing the repair makes the
relevant negative controls fail. This adds no whole-fleet or comparative gate.

### P3. Validate construction and prove actual production binding

Within the existing placement cutover, validate required collaborators and
their used methods before listeners, timers or writes start. Reuse the readiness
owner's explicit construction/late-binding pattern. Misconfiguration fails
clearly; a legitimate unbound or temporarily unavailable state uses the existing
named refusal and the canonical binding/clearing wake. Absence of a safety owner
never grants admission.

The production entry point and integration fixture must use the same ordinary
JavaScript construction path and real admission/replay implementation. Inject
clock, storage and transport faults at declared seams; do not replace the safety
algorithm with a fixture callback. Direct decider tests keep their unit claim.

**Done:** omit or malform each required collaborator through the real factory
and prove rejection before side effects; prove valid construction and useful
progress after legitimate binding. Removing production registration or restoring
the replaced owner makes the integration witness fail. Preserve the existing
remove-safety and placement cutover constraints, including caller retirement.

P3 prepares the real construction witness; production activation also requires
P4's identity/replay guarantees and the placement owner's existing cutover
acceptance. If construction and activation cannot land independently without
leaving a dormant alternate path, integrate P3 and P4 as one coherent changing
interaction. Do not activate a known-unsafe owner between the packages.

The existing mock-only dependency validation test is not production evidence:
[mock constructor and test](https://github.com/psvensson/lagrange/blob/0970ab012f65456cad34cfadfa92fb420f7f09ef/test/bootstrap/required-dependency-validation.property.test.js#L18-L49).
Method shape checks prove callability, not authority or correct semantics.

### P4. Own proposal identity and replay once

Use the existing proposal edge and canonical command builder. The
[write kernel](https://github.com/psvensson/lagrange/blob/0970ab012f65456cad34cfadfa92fb420f7f09ef/src/partition/partition-write-kernel.js#L240-L244)
already has an identifier-minting mechanism. Replace reconstruction-sensitive
sequence identity without adding a dependency or randomness to committed apply.

- Mint once for a logical attempt and retain its canonical command unchanged.
- Retry or observe an unknown outcome with the same identity and command.
- Allocate a new identity for genuinely new work.
- Bind retained identity to command meaning and reject a same-ID/different-command
  replay. Do not assume that canonical body validation alone establishes that
  cross-attempt identity binding.
- Define recovery of unresolved attempts using the existing request/workflow
  owner. Preserve retained-result replay; do not add another retry ledger.

**Done:** through P3's actual request/kernel/apply/replay path, commit followed by
a lost reply and retry produces one effect; reconstructed new work cannot obtain
an older attempt's result; a changed command under the same ID is rejected;
and an unresolved attempt is reconciled after restart before it is treated as
fresh work. Include leadership replacement in the retained-attempt witness.
A UUID generated on every retry does not satisfy this package.

### P5. Finish runtime contracts and local navigation on repaired paths

Reuse owner-defined builders/decoders and outcome constants. Validate meaningful
field combinations at construction and actual decode/replay boundaries. Copy
caller-owned nested mutable data where a retained command must remain stable.
Use named arguments where identities or log positions could be confused.

Exercise each outcome through its real consumer, including invalid outcomes,
refusals and the event that clears a waiting condition. Mutating original input
after construction must not change accepted command bytes or behavior. A frozen
outer object, a label named COMMITTED, or handler presence alone proves neither
deep immutability nor durable semantics.

Keep apply dependencies narrow. Use the existing dependency checker for a few
actual forbidden imports and prove their rejection; inspect indirect capabilities
too. Keep existing ESLint coverage and report its exact candidate/range. No new
lint ecosystem, artificial file-size target or global organization project.

For the repaired owners, update the owner header and existing navigation with:
public entry, required collaborators, durable authority/commit point, permitted
post-commit work, recovery/wake entry and representative production test. Link
to canonical contracts rather than duplicating them. Respect generated INDEX
ownership and use its existing producer only when affected.

**Done:** real-boundary malformed-input, mutation, outcome/wake and forbidden-import
negatives discriminate the error; ordinary correct behavior remains covered;
applicable existing checks pass on the integrated content; the replaced paths
are removed and the local source/test entry points can be found from the owner.

## Evidence, integration and closure

Integrate P1 -> P2 -> P3 -> P4 -> P5, attaching runtime validation and owner
headers to the interaction that introduces them rather than deferring safety
until P5. Independent investigation and review can proceed in parallel. Existing
work that already satisfies a package is credited after exact-content review and
evidence applicability; never reimplement it solely to match these labels.

The front-matter receipt IDs name obligations, not synthetic pass booleans. Use
the existing `test-receipt/1` format and proof owner to admit the actual retained
Quest receipts/reports with their original IDs, source/configuration, commands,
test/dependency versions, substrate and artifact identities. The aggregate is an
index to those proofs, not a replacement for them. Hand-authored successful
results, Quest status alone, imported modules alone and file existence are
insufficient. Stale, missing, skipped or refused evidence cannot be accepted.

Before closing, the local integration owner records one composed candidate and
independent verification of the changed owner interactions, fixtures, contracts
and evidence applicability. Run the smallest discriminating proof first, then
the affected interaction and normal exact-candidate publication requirements.
Use the authorized lab facilities for runtime suites and physical work; record
actual request IDs, results and remaining blockers. No GCP provisioning or
comparative campaign is created by this plan.

The deterministic epic proves the bounded mechanisms actually exercised. The
placement Quest's physical drain evidence, the service journey and release or
comparative acceptance remain with their existing owners and requirements.

Documentation adoption follows the existing
[documentation-only proof scope](../../test/guidelines/release-gate.md#documentation-only-changes):
relevant schema, links, roadmap/documentation checks and independent review.
It creates no runtime or corpus receipt.
