---
id: gate-work-consolidation
status: open
proof: deterministic
roadmapRow: null
doneWhen:
  probe: test-receipt
  args:
    file: solve/epics/gate-work-consolidation/evidence/receipt.json
    requiredReceipts:
      - structural-metrics-produced-once
      - fixed-proof-duplicates-eliminated
      - import-graph-input-owner-canonical
      - whole-tree-checks-input-triggered
      - push-eslint-range-scoped
      - repository-health-coalesces
      - proof-plan-owns-resources
      - inert-push-does-not-cancel-behaviour-canary
      - local-and-ci-plan-parity
quests:
  - repository-health-single-producers
  - repository-health-coalescing
  - push-proof-stage-deduplication
  - import-graph-input-authority
  - input-triggered-whole-tree-checks
  - push-range-eslint
  - proof-obligation-registry
  - plan-driven-ci-provisioning
  - behaviour-canary-activation-concurrency
  - gate-work-certification
authorizes:
  - .github/workflows/ci.yml
  - .github/workflows/repository-health.yml
  - .github/workflows/full-corpus-canary.yml
  - .githooks/pre-commit
  - .githooks/pre-push
  - package.json
  - scripts/check-fast-static.js
  - scripts/generate-global-owner-debt-inventory.js
  - scripts/global-owner-debt-inventory
  - scripts/checks/push-gate-corpus-worktree.js
  - scripts/checks/run-static-audits.js
  - scripts/checks/change-selection-constants.js
  - scripts/checks/test-resource-classification-constants.js
  - scripts/generate-test-resource-classes.js
  - test/manifests/project-hardening-proof-postpush-manifest.json
  - test/shards
  - test/scripts
  - solve/epics/gate-work-consolidation
---

# Gate work consolidation

Commit, push and CI proof should pay once for each obligation and should prepare
only the environment the selected proof actually needs. The current apparatus
already has a sound change-scoped behavioural selector, but verification on
2026-09-13 found substantial work around that selector that is either repeated
on the same tree or scheduled without regard to whether its inputs changed.

This epic owns cost and scheduling, not proof semantics. `proof-authority-integrity`
owns the exact pushed subject and non-import observation closure. Work here that
merely removes exact duplicate execution can proceed while that epic is open;
anything that skips an obligation or derives resource provisioning from the
proof cone waits for `proof-authority-integrity` to close.

The largest measured low fruit is `repository-health`: on one 2026-09-13 run,
`test:owner-debt:prepare` spent roughly 2m43s producing complexity, cognitive
complexity, circular-dependency and duplication reports, after which
`test:static` produced the same whole-tree reports again. The ordinary hosted
change gate also spends most of a small change's wall time on environment setup:
a docs-only change selected only the 34-test safety spine, while full-history
checkout, package installation, external tool setup and import-graph preparation
dominated the job.

## Binding invariants

- **One producer per concern.** Complexity, cognitive complexity, cycles,
  duplication and other report-producing analyses have one producer for one
  tree; consumers read that report and verify its identity rather than rerun it.
- **Whole-tree remains whole-tree.** A whole-repository ratchet may be activated
  only when one of its inputs changed, but once activated it still evaluates the
  complete tree. "Changed-files duplication" is not an optimization.
- **No semantic classifier in YAML.** Workflows receive a repository-owned plan
  or capability projection and execute it. They do not learn what `src/raft`,
  docs, WASM or a subsystem means.
- **Unknown means run.** If an obligation's input surface or resource need cannot
  be derived safely, it runs with the conservative environment.
- **The safety spine is not the first target.** Remove measured duplicate work,
  global static repetition and provisioning waste before trying to shrink the
  unconditional behavioural spine.
- **No per-test result cache.** `test-file-content-receipts` remains parked.

## Quests, in strict order

**repository-health-single-producers** — eliminate same-job duplicate metric
production. The checker scripts remain the metric authorities and produce their
normal reports once. Reorder or refactor repository-health so the global
owner-debt projection consumes those exact complexity, cognitive, cycle and
duplication reports (plus its import-graph input) and verifies report/tree
identity instead of invoking the producers again. A stale or mismatched report
refuses. The acceptance proof instruments the four producers and asserts one
invocation each for a health run while both the static verdict and owner-debt
inventory remain byte/semantically equivalent to the pre-change outputs.

**repository-health-coalescing** — add latest-tree concurrency semantics to the
non-gating repository-health lane. It describes current structural debt, so a
newer main tree subsumes an older in-flight health measurement. Concurrent main
pushes coalesce to the newest tree; manual dispatch remains possible. This is
separate from the behavioural canary because an inert push has different
cancellation semantics there.

**push-proof-stage-deduplication** — remove exact repetition inside one push
proof without changing which obligations exist. The fixed `focused-contracts`
manifest currently overlaps the always-run safety spine; every fixed contract
is classified: if it is fundamental enough to run on every change it has one
home in the spine, otherwise its owning subsystem/impact edge selects it. The
same quest removes a second push-time file-size verdict where an earlier stage
already evaluated the identical pushed tree. Proof: a ledger of command/test
identities for representative pushes contains no duplicate obligation id while
the union of obligations is unchanged.

**import-graph-input-authority** — expose one canonical predicate/manifest for
what makes the sealed import graph stale and make pre-commit, push and CI consume
it. Today pre-commit broadly treats `src/`, `scripts/` and `test/` as inputs,
while the graph owner also depends on `examples/`, package manifests and resolver
configuration. The owner defines the JavaScript extensions, directories and
authority files once. Irrelevant files beneath a broad directory no longer force
refresh; every true graph input does. No hook keeps its own copy of the rule.

**input-triggered-whole-tree-checks** — distinguish execution scope from
activation. Whole-tree checks such as duplication, cycles, unused exports and
whole-source ratchets declare their actual input surfaces. If no input changed,
the push does not rerun the check; if an input did change, the checker receives
the complete immutable subject tree exactly as today. Missing/unknown input
metadata means run. The quest must demonstrate a docs-only change skipping
source-only analyses and a one-line source change still executing the complete
ratchets.

**push-range-eslint** — once `proof-authority-integrity` has made the pushed SHA
an immutable subject, make the authoritative push lint cover the JavaScript
files changed between the remote base and that subject (including added and
renamed destinations), not every tracked JavaScript file. If the range cannot
be established safely, lint all tracked JavaScript. Pre-commit keeps staged
lint for fast feedback; push lint independently proves the published range and
never trusts that the commit hook ran.

**proof-obligation-registry** — blocked until `proof-authority-integrity` is
done. Generalize the existing repository-owned proof metadata just enough for
each obligation to declare: its identity, canonical input/observation surface,
execution scope (`changed-files`, `whole-tree-when-triggered`, or
`selected-tests`), report producer if any, and external capability requirements.
The registry composes the existing test/subsystem/resource/impact authorities;
it does not replace them with a giant new path switch. A deterministic planner
maps `(base, subject, changed records)` to a deduplicated plan and fails closed
on unknown obligations. Planner/registry changes themselves demand the broad
proof branch.

**plan-driven-ci-provisioning** — the hosted change gate asks the plan which
capabilities are needed before installing optional tooling or fetching optional
data. Node/npm remain the baseline. Java/TLC, PostgreSQL client, Helm,
`wasm-tools`, MovieLens and future external resources are installed/fetched only
when a selected test or obligation declares that capability; an unknown need
uses the conservative superset. The workflow contains no product/path taxonomy.
The docs-only safety-spine case must not pay for Helm, WASM, PostgreSQL or
MovieLens unless a spine test has explicitly acquired such a requirement.

**behaviour-canary-activation-concurrency** — make inert main pushes avoid a
new full behavioural corpus without cancelling the corpus that still represents
the most recent behaviour-changing tree. A cheap plan/activation job is outside
the heavy canary concurrency group. Only a behaviour-relevant subject enters
the heavy group; a later behaviour-relevant subject may cancel/supersede the
older one. A docs/data-only push neither starts the heavy job nor cancels an
in-flight code canary. The full corpus remains non-gating and manual dispatch
remains available.

**gate-work-certification** — adversarial and measured final packet. Run three
representative subjects: documentation-only, ordinary JavaScript change, and an
external-toolchain/model-affecting change. Required receipts prove: structural
metric producers each run once; no fixed behavioural test runs twice in one
push; whole-tree checks skip only when their declared inputs are untouched;
push lint covers the exact changed JavaScript range; local and CI planners emit
the same obligation identities for the same base/subject; optional CI resources
match declared capability needs; an inert push cannot cancel the last relevant
behavioural canary. Record before/after wall time but do not make timing the
correctness oracle.

## Relation to other epics

`proof-authority-integrity` is the semantic prerequisite. The first four quests
above are mechanical consolidation and may proceed independently; `push-range-eslint`
and every quest after it wait for the exact-subject owner where noted.

`apparatus-release-consolidation` remains authority for release publication,
script-count/workflow-size budgets, source-shape policy and repository-wide
consolidation targets. This epic supersedes the *implementation ownership* of
the still-unsealed `workflow-budget` child and the gate-scheduling part of the
still-unsealed `ratchet-realignment` child named there: those apparatus budgets
may measure the result, but a second agent must not independently redesign the
same workflows, hooks or proof scheduling. `ratchet-realignment` retains its
source-quality policy decisions that are unrelated to when a check runs.

The parked `test-file-content-receipts` quest is not revived. If exact proof
reuse is reconsidered after this epic, it is a separate owner decision based on
a stable subject+plan identity, not an implicit cache added here.

## Guardrails

- Never trade a whole-tree invariant for a changed-file approximation merely to
  hit a timing target.
- Never let workflow path filters become a second proof taxonomy; execution
  decisions must be repository outputs.
- Every skipped obligation has a named canonical input predicate and a falsifier
  showing that changing one input reactivates it.
- Resource provisioning is conservative on uncertainty.
- The behavioural canary's non-gating role is unchanged.
- Independent verification is required before landing changes to hooks,
  selection/planning machinery or workflow cancellation semantics.
