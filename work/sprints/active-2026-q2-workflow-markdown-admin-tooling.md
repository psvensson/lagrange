# Workflow Markdown Admin Tooling Sprint

Status: active. Created on May 26, 2026.

## Goal

Reduce LLM latency, token use, and source-of-truth drift by moving routine
workflow Markdown administration behind deterministic `npm run work:*` tools.
LLMs may still read raw Markdown for unusual analysis, but normal writes and
summaries for packages, sprints, ledgers, tracks, releases, and roadmap handoff
must be tool-owned.

## Strategic Premise

Recent workflow work exposed the same cost pattern repeatedly: LLMs spend calls
and context manually locating sections, editing package/sprint/ledger Markdown,
repairing stale generated handoff, and retrying validator-sensitive prose. The
tooling already owns parts of this flow (`work:context`, `work:close`,
`work:repair`, `work:sprint:advance`), but the seams still require manual
Markdown edits where deterministic commands could parse, patch, validate, and
return the next command.

This sprint turns that operating model into the default: intent tools mutate
canonical Markdown, summary tools read and compress it, and validators reject
stale or manually drifted state.

## Sprint Strategy Brief

- Goal state: common workflow administration is performed through compact
  commands with deterministic output, `--json` support where useful, and
  next-command hints; generated handoff cannot point at missing active
  packages after closure.
- Current causal thesis: the expensive part is not implementation reasoning,
  but repeated manual state administration across package, sprint, ledger,
  track, release, and roadmap documents.
- Competing hypotheses:
  1. Manual workflow Markdown edits are flexible enough that tooling would only
     move the latency elsewhere. Falsifier: closure and evidence updates become
     single-command transactions with fewer validator retries.
  2. Existing commands are enough if LLM steering is clearer. Falsifier: the
     current stale-current-blocker and missing-ledger-heading cases still
     require manual repair after following the documented tools.
- Confidence and evidence: high for closure/publish friction and stale
  current-blocker drift, medium for broader track/release transaction tooling
  until the summary and admin APIs are implemented.
- Expected green path: harden publish/closure first, add intent mutation
  commands, add summaries and next-command hints, combine recurring
  route/admin transactions, then enforce tool-owned semantics in validators and
  steering.
- Wrong direction signals: a package adds another manual checklist without a
  command, validator errors become more prose-sensitive, or one opaque command
  hides state changes without a dry-run/JSON view.
- Next best package:
  `work/packages/done-20260526-workflow-publish-transaction-hardening.md`.
- Stop or escalate rule: if a phase needs runtime behavior, representative
  scenario semantics, or release readiness decisions, stop and split that work
  into a separate runtime/scenario package; this sprint owns workflow tooling
  only.

## Current Edge Card

```text
Representative artifact: none
Visible first frontier: unknown
Active package: work/packages/done-20260526-workflow-summary-api-json-outputs.md
Active package owner: workflow_tooling_owner
Active package boundary: markdown_admin_summary_surface
Selected cause: manual_workflow_markdown_admin_latency
Required action: Add compact package, sprint, track, release, and roadmap summary commands with JSON output and deterministic next-command hints so LLMs rarely need to load full workflow Markdown.
Representative status: unknown
Causal outcome: unknown
Architecture gate: not-required / unknown
Expected delta: unknown
Current state: New package scaffolded from the shared work-package schema.
Allowed edits: scripts/work-summary.js, scripts/work-context.js, scripts/work-track-summary.js, scripts/list-commands.js, package.json, work/RULES.md, work/README.md, test/scripts/work-summary.test.js, test/scripts/work-context.test.js
Candidate runtime files: unknown
Forbidden edits: owned files expand beyond this package, a frozen decision must be reopened
Required latest proof: regression: node --test test/scripts/work-summary.test.js test/scripts/work-context.test.js, supporting: npm run work:summary -- --help, supporting: git diff --check -- scripts/work-summary.js scripts/work-context.js scripts/work-track-summary.js scripts/list-commands.js package.json work/RULES.md work/README.md test/scripts/work-summary.test.js test/scripts/work-context.test.js work/packages/done-20260526-workflow-summary-api-json-outputs.md work/sprints/active-2026-q2-workflow-markdown-admin-tooling.md
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Scope

- In: workflow command scripts, package/sprint/ledger/track/release/roadmap
  Markdown administration tools, command index updates, workflow docs,
  steering rules, generated steering packs, and script-level tests.
- Out: runtime code under `src/`, distributed scenario behavior,
  representative report reinterpretation, release readiness claims, AGPL/Pro
  scope decisions, and product roadmap sequencing.

## Package Queue

1. [Workflow Publish Transaction Hardening](../packages/done-20260526-workflow-publish-transaction-hardening.md)
   - Lane: `lightweight-maintenance`
   - Purpose: implement or harden a single publish/closure transaction that
     validates, closes, stages the rename/deletion set, refreshes
     current-blocker, records commit/push ledger proof, and prints the next
     command without requiring manual Markdown repair.
   - First-run reason: highest-leverage latency reduction and the direct fix
     for stale generated handoff after package close.

2. [Workflow Markdown Intent Mutation Tools](../packages/done-20260526-workflow-markdown-intent-tools.md)
   - Lane: `lightweight-maintenance`
   - Purpose: add structured package evidence, no-ledger, sprint queue, and
     Current Edge Card mutation commands so LLMs express intent instead of
     hand-editing workflow Markdown sections.
   - First-run reason: publish automation still depends on evidence, ledger,
     and sprint state being shaped consistently before closure.

3. [Workflow Summary API And JSON Outputs](../packages/done-20260526-workflow-summary-api-json-outputs.md)
   - Lane: `lightweight-maintenance`
   - Purpose: add compact package, sprint, track, release, and roadmap summary
     commands with `--json` output and deterministic next-command hints.
   - First-run reason: read-side compression is the main token-reduction
     counterpart to write-side intent tools.

4. [Workflow Admin Transaction Commands](../packages/todo-20260526-workflow-admin-transaction-commands.md)
   - Lane: `lightweight-maintenance`
   - Purpose: add transaction-safe admin commands for recurring route,
     migration, sprint advancement, and track/release attachment updates.
   - First-run reason: cross-document state changes are where manual Markdown
     edits most often create stale or contradictory tracker truth.

5. [Workflow Admin Validator Enforcement](../packages/todo-20260526-workflow-admin-validator-enforcement.md)
   - Lane: `lightweight-maintenance`
   - Purpose: enforce tool-owned workflow Markdown semantics in validators and
     steering, including stale active references, missing generated handoff
     refresh, manual ledger drift, and roadmap execution-semantics regressions.
   - First-run reason: enforcement belongs after the replacement tools exist,
     so the validator can point to deterministic fix commands instead of
     asking LLMs to patch prose by hand.

## Validation

Per-package validations are owned by each package proof ladder. Sprint-level
validation at closure:

1. `npm run work:sprint:remaining`
2. `npm run work:advance -- --check`
3. `npm run steering:llm:pack` when steering sources changed
4. `git diff --check -- work/sprints/active-2026-q2-workflow-markdown-admin-tooling.md work/packages/done-20260526-workflow-publish-transaction-hardening.md work/packages/todo-20260526-workflow-markdown-intent-tools.md work/packages/todo-20260526-workflow-summary-api-json-outputs.md work/packages/todo-20260526-workflow-admin-transaction-commands.md work/packages/todo-20260526-workflow-admin-validator-enforcement.md`

## Wrong Direction Signals

- A package adds new required manual Markdown ceremony without adding a command.
- A command writes workflow files without dry-run behavior or a compact summary
  of changed files.
- A command output lacks an actionable next command on success or failure.
- Validator fixes require literal prose phrasing instead of structured fields
  or tool-generated patches.
- The roadmap regains live execution-state semantics.

## Closure Note

This sprint closes when all queued packages are `done-*` or explicitly
superseded, `work:sprint:remaining` reports zero packages left, and the final
workflow validation proves generated handoff does not point at missing active
package files. This sprint is workflow-tooling only and does not claim
representative scenario or release readiness.
