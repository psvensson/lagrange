# Workflow Leverage Rebalance Sprint

Status: active. Opened 2026-05-25.

## Goal

Rebalance the workflow from enforcement-heavy ceremony toward reflective
problem-solving. Reduce package micro-fragmentation, make pre-implementation
thinking visible in the queue, and replace evidence-of-work proof rituals with
evidence-of-understanding discriminators — without weakening worktree safety,
owner contracts, or runtime guardrails.

## Strategic Premise

A 17-day window produced ~590 `done-*` packages and 6 theory-ledger entries
(≈1% reflection rate). Sibling `*-modularization-*` and `rolling-restart-*`
series show 10+ near-identical leaves per frontier. The active workflow lacks:

1. A unit of work larger than a leaf but smaller than a sprint (epic/frontier).
2. A first-class lane for lateral framing before scope hardens (discovery).
3. A proof contract that distinguishes falsifiers from regression checks.

The remaining items are friction reduction: literal-phrase validator gates,
steering surface depth, manual closure steps.

## Sprint Strategy Brief

- Goal state: `epic`, `discovery`, and discriminator-aware proof are recognised
  by the lane picker, validator, and templates; `work:close` collapses
  closure recipe steps 4–7; steering pack drift is CI-checked.
- Current causal thesis: ceremony optimised for runtime owner work is being
  applied to every lane, fragmenting problems and burying causal reasoning.
- Competing hypotheses:
  1. Fragmentation is a deliberate auditability tradeoff and should not be
     consolidated (falsifier: epic retros show no learning was missed).
  2. The 1% ledger rate reflects mostly-mechanical work that genuinely had
     nothing durable to record (falsifier: sample 20 random done-* packages
     and find unrecorded surprises in commit messages or diffs).
- Confidence and evidence: medium-high on fragmentation and discovery-lane
  gaps (direct package-name analysis, active package exists *because* the
  workflow lacks a discovery lane). Lower confidence on validator literalism
  causing real harm vs. just smelling brittle.
- Expected green path: items 1 → 2 → 3 unlock structural change; 4 → 5 → 6
  reduce friction; 7 → 8 close the loop with automation and audits.
- Wrong direction signals: any package in this sprint introduces a *new*
  validator literal phrase, adds a fourth steering layer, or requires manual
  renumbering work elsewhere.
- Next best package: see Package Queue item 2 once item 1 closes.
- Stop or escalate rule: if item 2 (discovery lane) or item 3 (epic packages)
  cannot be expressed without weakening pre-impl validation, stop and open a
  bounded experiment package; do not weaken guardrails to ship structure.

## Current Edge Card

```text
Representative artifact: none
Visible first frontier: unknown
Active package: none
Active package owner: unknown
Active package boundary: unknown
Selected cause: unknown
Required action: none
Representative status: unknown
Causal outcome: unknown
Architecture gate: not-required / unknown
Expected delta: unknown
Current state: All packages are completed successfully.
Allowed edits: none
Candidate runtime files: none
Forbidden edits: none
Required latest proof: none
Allowed stop modes: none
```

## Scope

- In: `work/RULES.md`, `work/README.md`, `work/templates/*`,
  `scripts/work-tracker.js`, `scripts/lane-picker.js` (if present), validator
  phase modules, lane definitions, sprint-queue automation, steering pack
  generator drift check, workflow audit scripts under `scripts/audit-*` or
  `scripts/work-*`, generated LLM steering packs.
- Out: runtime code under `src/`, owner contracts, scenario routing, roadmap
  status, edition matrix, AGPL/Pro/Enterprise scope decisions, the active
  rolling-restart blocker (no current blocker is live as of opening).

## Package Queue

1. [Discovery Gate Workflow Alignment](../packages/done-20260525-discovery-gate-workflow-alignment.md)
   - Lane: `lightweight-maintenance`
   - Purpose: package-local Discovery Gate guidance (closed before this
     sprint opened). Listed here as the partial down-payment on recommendation
     B; this sprint promotes Discovery from package-local section to a
     first-class lane in item 2.
   - First-run reason: prior work; included for traceability.

2. [Discovery Lane First-Class](../packages/done-20260525-discovery-lane-first-class.md)
   - Lane: `lightweight-maintenance`
   - Purpose: promote Discovery from a package-local section to a named lane
     with explicit no-runtime-writes scope, a discriminator-output contract,
     and a validator rule that high-ambiguity `runtime` packages must cite
     a `discovery` predecessor or open one.
   - First-run reason: structural prerequisite for items 3 and 4; without a
     named discovery lane, epic packages have nowhere to record route
     selection at the parent level.

3. [Epic Package Construct](../packages/done-20260525-epic-package-construct.md)
   - Lane: `lightweight-maintenance`
   - Purpose: introduce an `epic` (or `frontier`) package kind that owns a
     set of sibling leaves with one shared causal question, one shared
     discriminator, and one closure retrospective; leaves cite the parent and
     skip theory-ledger ceremony unless the epic-close retrospective surfaces
     an unanticipated learning.
   - First-run reason: highest-leverage structural change against
     micro-fragmentation; gates item 8's audits because audits are only
     useful once the construct exists.

4. [Discriminator-Based Proof Ladder](../packages/done-20260525-discriminator-based-proof-ladder.md)
   - Lane: `lightweight-maintenance`
   - Purpose: replace "3–5 executable commands" with role-tagged proof:
     one falsifying command, one regression command, optional supporting.
     Validator enforces presence of distinct roles, not command count.
   - First-run reason: aligns proof contract with the causal-reasoning shape
     items 2 and 3 introduce; prevents proof ladders from being padded with
     `--check` repeats.

5. [Structured Validator Front-Matter](../packages/done-20260525-structured-validator-front-matter.md)
   - Lane: `lightweight-maintenance`
   - Purpose: replace literal-phrase gates (`parent revalidated focused
     proof: yes`, `theory ledger: no ledger update`, etc.) with a parsed
     front-matter block. The human-readable Execution Evidence section
     remains, but the validator reads structure, not prose.
   - First-run reason: ceremony reduction; eliminates a class of "validator
     rejected my close because I reworded a sentence" failures.

6. [Steering Stack Collapse Decision](../packages/done-20260525-steering-stack-collapse-decision.md)
   - Lane: `lightweight-maintenance`
   - Purpose: decide and document whether packs or source steering is the
     canonical LLM-facing surface (one source of truth), and add a CI check
     that fails if `steering:llm:pack` would produce a diff. No new layers.
   - First-run reason: closes the drift loop the active sprint goal "reliable
     LLM handoff" depends on; cheap once items 2–5 stabilize.

7. [Closure Automation work:close](../packages/done-20260525-closure-automation-work-close.md)
   - Lane: `lightweight-maintenance`
   - Purpose: a `npm run work:close` script that performs Closure Recipe
     steps 4–7 atomically (rename, status flip, sprint-link rewrite,
     `git add` of `commitScope` + handoff files only) and auto-renumbers
     the sprint queue (today `work:repair` explicitly does not).
   - First-run reason: removes 4 manual `sed`/`mv`/`git` calls per close;
     dependent on item 5 so the script reads structured front-matter not
     literal phrases.

8. [Workflow Audit Reports](../packages/done-20260525-workflow-audit-reports.md)
   - Lane: `lightweight-maintenance`
   - Purpose: three audit commands suitable for monthly review —
     (a) packages with no theory-ledger ref and no runtime files changed,
     (b) sibling packages sharing ≥80% `writeScope` path prefix (epic
     candidates), (c) validator phrases or fields that have never produced a
     useful rejection.
   - First-run reason: feedback loop for items 3 and 5; without measurement
     the workflow drifts back toward ceremony.

## Validation

Per-package validations are owned by each package's proof ladder. Sprint-level
validation at closure:

1. `npm run work:validate -- --closure work/packages/done-20260525-discovery-gate-workflow-alignment.md`
2. `npm run work:validate -- --closure` for each subsequent `done-20260525-*` package as it closes.
3. `npm run steering:llm:pack` and confirm a clean re-run produces no diff.
4. `git diff --check -- work/sprints/active-2026-q2-workflow-leverage-rebalance.md`

## Wrong Direction Signals (sprint-level)

- A package in this sprint introduces a new literal-phrase validator gate.
- A package in this sprint adds a steering layer rather than collapsing one.
- An epic-package retro is filed with `no ledger update` for all retros across
  three consecutive epics — that means epics are being closed without the
  reflection they were designed to force; re-open item 3.
- `work:close` ends up shelling out to manual `sed` commands inside the
  script — that means the structured front-matter (item 5) shipped weak.

## Closure Note

This sprint will be renamed to `done-2026-q2-workflow-leverage-rebalance.md`
when all queued packages are closed (or explicitly superseded with a rationale
in the queue entry). No runtime owner work is in scope; no `current-blocker`
runtime state is affected by this sprint.
