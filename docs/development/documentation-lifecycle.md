---
audience: development
documentClass: current
---

# Documentation Lifecycle

Repository documentation is a current view of the system, not an archive of how
the current implementation was reached. Historical execution evidence remains
available through Git and the Solver evidence store without appearing as current
guidance.

## Document Classes

The repository derives a document class from its location. Frontmatter may state
`documentClass` when a file is an intentional exception.

| Class | Home | Content contract |
| --- | --- | --- |
| `current` | Root guides plus maintained Markdown under `architecture/`, `charts/`, `ci/`, `docs/`, `examples/`, `src/`, and `test/` | Current behavior, operations and architecture; required development conduct distinguished from its implemented enforcement |
| `planning` | Human root roadmaps, `solve/epics/`, and `solve/specs/` | Intent linked to active or draft work, including the current epic coordination summary |
| `steering` | Canonical sources under `docs/steering/` | Current rules and stable scope/sequence maps that bind repository work |
| `generated` | Generated steering packs and indexes | Rebuilt from canonical sources; never hand-edited |
| `evidence` | Solver logs, changes, artifacts, retained reports, explicit case studies, and formal-model narratives under `models/` | Proof or execution provenance; never presented as runtime-current guidance. Mutable formal-model narratives still receive link and repository-path validation. |
| `compatibility` | Small path-pinned pointer documents | Redirect only; no copied architecture or process narrative |
| `history` | Changelog and release history | Deliberate release chronology |

The human roadmap and the agent feature map intentionally have different
classes. Root `roadmap.md` is a planning narrative for product direction.
`docs/development/agpl-feature-map.md` is a stable steering contract whose row
identities constrain implementation scope; it does not record active execution
state. Active goals and evidence remain owned by the Solver.

## Current Summaries And Steering Revisions

An active epic has one mutable `## Current work` summary near its beginning,
maintained by the integration owner. Keep the `#current-work` anchor stable as
dates and assignments change. Adopt this heading when updating an existing
summary; do not create another status record or mass-retitle historical
checkpoints. Where another epic coordinates the same work, link its current
summary instead of copying live state. Aim for a short entry point (roughly 300-600 words,
not a quota); link detail rather than copying it. Record:

- last-checked time, governing rule-set revision and source commit;
- published baseline, actual integration candidate and active writer when known;
- last measured candidate, configuration and original evidence;
- current bounded unit, first demonstrated blocker, next action and its owner;
- work awaiting review, test or integration, including solved but unintegrated units;
- actual pending request/run and observer, if any, under
  [Quest Closure](quest-closure.md#blocked-exhausted-and-superseded).

Distinguish a published baseline from accepted runtime proof. A dated handoff
cannot establish a live writer or candidate; mark unknown or unmeasured state
explicitly and reconcile it before overlapping work. Link each claim to its
contract, Quest/PR or immutable evidence. The summary is an index, not a second
acceptance ledger, capability declaration or replacement for logs. Update it
when work integrates, the blocker changes or responsibility hands off. A
standalone `class: fix` uses its existing Quest record and log.

Recorded attempts, findings, verdicts, receipts and terminal entries remain
immutable. Correct them with a new record. Current explanatory documents and
planning summaries can be edited to reflect present authority; changed sealed
acceptance is explicitly superseded under R09. Historical claims retain the
source and outcome actually observed.

When revising steering, update all affected active instructions, routed owner
documents, templates and enforcement/help surfaces together. Record a coverage
checklist and any preserved historical exceptions in the existing review or epic
record. Publish an identifiable rule-set revision and source commit. At resume
or handoff, agents reconcile their local instructions and pending work with that
revision; do not overwrite another worktree or silently retarget sealed claims.
Retain standing rules separately from dated operating heuristics and hypotheses
that still need measurement. Distinguish required conduct from executable
enforcement, including any narrower automatic scope. Route an implementation
gap to its existing active owner rather than creating a permanent gap matrix in
steering. A policy update never establishes a new product capability; generated
capability facts change only with their own evidence. Revise the rule-set
manifest only when an invariant changes, not for detail within its existing owner.
A wording or routing clarification retains the invariant revision and is identified
by its source commit. Review semantic scope and obligations as well as the
manifest: the structural rule-set checker cannot establish prose equivalence.

## Evidence-bound capability and convergence claims

The canonical [capability source](../current-capabilities.json) describes
the checked-in code, not an unmerged candidate or an earlier backend.
Generated [public status](../current-capabilities-and-limitations.md)
is a projection, not independent proof (R05/R19/R22). For every material
capability, distinguish: a component can be constructed; the owner actually
invokes it in the selected backend; its public ingress preserves semantics;
and the complete integrated failure/recovery scenario passed at an exact
source. These are separate observations. Missing measurements are
`unverified`, not `active`. A historical lab receipt never transfers
automatically to a different backend, topology or candidate.

When source and public claims disagree, correct the canonical capability
source, its producer, source-bound checker, generated output, and affected
current operational/architecture explanations together. Bind positive
claims to the relevant owner and original executable witness; a grep or
passing unrelated unit test does not turn an integrated product claim green.
Keep implementation gaps visible to pilots without inventing a separate
capability ledger. The [current-capabilities checker](../../scripts/check-current-capabilities.js)
is a source consistency guard, **not** end-to-end certification.

Where existing records permit, extend the current summary with distinct
unresolved causal families and their ages or recurrence, and elapsed diagnosis,
review, queue, test and integration phases from original timestamps.
Derive every entry from the existing Quest/PR/runner records. Say
`unmeasured` for unavailable counts or phase times, never manufacture a
trend, sum incompatible test cones or create another tracker. Update on
material integration/blocker change, not each agent heartbeat. Bounded
repair completion, public-service readiness and full release remain
different claims.

Expected negative-control rejection and useful defect detection show the
process working; do not penalize their detection as avoidable failure. Classify
the underlying defect honestly, including a real product regression found in
review. Use original timestamps and causal classifications to identify waiting
and repeated rework, rather than rewarding a green count.

## Graduation Rules

When a change finishes an operation, the same Quest must:

1. update the canonical current document;
2. move unresolved work into an active epic or specification;
3. remove temporary migration, rollout, review, or completion prose;
4. update every path-pinned consumer before deleting a document; and
5. leave immutable Solver evidence unchanged unless an explicit retention
   migration classifies and verifies every affected artifact.

Do not create documentation archive directories. Git and Solver evidence preserve
history. A terminal epic or specification is not deleted merely because its linked
work reached terminal state; planning graduation is a separate retention-governed
operation.

## Enforcement

`npm run audit:documentation-current` classifies every tracked documentation
zone, checks maintained Markdown links and repository-path references, rejects
planning/history section roles in current documents, and rejects obsolete
narrative directories. Generated files and immutable Solver evidence are exempt
from reference validation; mutable formal-model evidence is not.
History keeps Markdown-link validation but may cite repository paths that
existed only at the recorded point in time.
References to declared ignored projections such as `solve/state/` are checked
against the lifecycle allowlist rather than the mutable contents of a local
working tree.

`npm run audit:doc-audience` independently checks audience zoning. Both run in
`npm run test:static`.
