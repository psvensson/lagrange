---
scope: core
status: manual-pack
always_load: true
source_of_truth: self
canonical_rules: docs/steering/workflow-guidelines/solver-quests.md
last_reviewed: 2026-07-13
---

> **Manual pack - edit here directly.** This file is the always-load operating
> contract for LLM work in this repository. The active workflow canon is the
> Quest system described in
> [solver-quests.md](../workflow-guidelines/solver-quests.md).

# Core Steering Pack

## Vocabulary

These terms are used throughout this pack and the Quest workflow. This is the
canonical first-read glossary; `boot.md` points here.

| Term | Meaning |
| --- | --- |
| Quest | One sealed unit of work under `solve/quests/<id>.json`. |
| Sealed | Fixed at declaration; not changed mid-Quest (see Must-Not #1). |
| `doneWhen` | Binary terminal success predicate, measured by a probe. |
| Probe | Automated reader over real artifacts that answers `doneWhen`/metric; the Solver trusts probes, not self-report. |
| Frontier | An independent attack surface within a Quest, with its own metric. |
| Attempt | One measured try against a frontier, recorded with a `changeRef`. |
| Finding | A durable recorded result: tested hypothesis, ruled-out approach, or decision. |
| Theory | A testable causal explanation (system- or frontier-level) selected to break a stall. |
| Park / parked | A frontier set aside with no honest remaining local move; the scheduler redirects elsewhere. Classified by kind × provenance: kind `exhausted` (counts toward EXHAUSTED) vs `cannot_measure` (resumable measurement park; never closes a quest), and ladder (measured, no provenance field) vs operator (`provenance: operator` via `solve.js park`, a recorded decision). |
| Rung | A position on the strategy ladder for an attempt (`observe`, `local-fix`, `widen-scope`, `model`, `change-approach`, `park`); a stalled frontier climbs rungs. |
| Dossier | The pinned-frontier attempt bundle `solve.js step` prints (rung, metric, evidence) and that a delegated worker is handed. |
| Owner / owner boundary | The single component that owns a semantic decision or resource; others observe (cache), they do not re-derive it. |
| Proof ladder | A compact sequence of 3-5 executable commands that demonstrates a claim. |
| Subagent | A spawned worker that produces verification or research; recorded as evidence `subagent:<id>`. |
| SOLVED / EXHAUSTED | Terminal Solver states: `doneWhen` met, or every frontier parked with no honest move. |
| MAX_CYCLES / THEORY_REQUIRED / BLOCKED | Typed non-terminal stops. Only progress-bearing MAX_CYCLES is replayed automatically; judgment and measurement actions return to the external driver. |
| Guard decision | The Solver's advisory → reroute → explore → park-resumable → terminal classification. |
| Verification precondition | The exact attempt or aggregate approval required before checkpoint or terminal handoff. |
| Live statistical run | A distributed statistical experiment; unrelated to Solver stops and verification preconditions. |

## North Star

Preserve the highest-level owner boundary, choose the smallest proof surface that
proves the boundary was not weakened, and do not locally patch symptoms when
the owner contract is porous.

## Default Posture: Autonomy

On a non-trivial task, drive the Quest to a true terminal (SOLVED or EXHAUSTED)
without pausing for confirmation. Typed non-terminal stops identify the next
owner: only progress-bearing MAX_CYCLES is replayed automatically; judgment or
measurement repair returns once as a typed action for the external driver.

Stop and ask the user ONLY when one of these holds:

1. **Authorization** — an irreversible or outward-facing action (push, publish,
   delete, deploy, send) that is not already durably authorized.
2. **Goalpost ambiguity** — the success condition itself is genuinely undetermined
   and cannot be resolved from the repo, the Quest, or a sensible default; a wrong
   guess would change what "done" means. (A wrong guess about *how* to implement is
   NOT this: pick the obvious option, record a finding, proceed.)
3. **EXHAUSTED** — no honest remaining move anywhere, including no
   higher-altitude Quest/epic worth authoring. (EXHAUSTing one Quest in order to
   author and drive a higher-altitude Quest is NOT this trigger — that pivot is
   autonomous work; see "Questioning a Quest's altitude" below. Stop only when
   the pivot itself does not exist.)
4. **Safety / scope** — a destructive boundary, or work outside the sealed Quest
   scope.

Otherwise: choose the obvious default, record a finding stating the choice and why,
and keep going. Surface the decisions in the final report, not mid-run.

**Questioning a Quest's altitude is not pausing and is not moving goalposts.**
Autonomy means driving to a *true* terminal, not grinding a frame that an altitude
(framing) reflection shows is wrong. When the evidence says the real lever is an
owner boundary or cutover the current Quest cannot touch — or that the modeling or
arrangement, not the next patch, is what must change — the correct move is to
honestly EXHAUST this Quest and author the higher-altitude Quest/epic, capturing the
insight durably first (finding / epic / system theory). See solver-quests.md
"Mandatory Step-Back Reflection Turn".

## Default Posture: Commit On Completion

When a unit of work is complete and coherent — a Quest terminal, a bug fix, a
docs or tooling change, any task you would report as "done" — **commit it.** Do
not leave finished work sitting uncommitted waiting to be asked. The user has
durably authorized committing completed work, so a commit is NOT an Authorization
stop-trigger; only never-before-authorized *pushes/publishes* still pause under
"Default Posture: Autonomy".

Scope every commit to the work at hand (the Quest's or task's own files), never
sweeping unrelated dirty worktree entries (see solver-quests.md "Git Handoff").
This applies to ad-hoc work just as much as to Quests; for Quests the Solver's
post-audit commit handoff already does it. Work on `main` (the user's standing
directive), and end commit messages with the configured co-author trailer.

Committing never implies pushing. Mid-Quest persistence is explicit:
`solve checkpoint` runs only after exact attempt approval. Terminal handoff
requires aggregate approval and the full audit. The Solver never pushes; a
never-before-authorized push remains an Authorization stop-trigger.

## Default Posture: Parallelism

When sub-tasks are independent, run them concurrently rather than in sequence:

- Batch independent reads/searches into one step; fan out read-only Explore or
  research subagents for breadth instead of reading serially.
- Verify N independent findings with N concurrent verifiers, not one at a time.
- For broad mechanical work (audits, migrations, sweeps over a known file list), use
  the Workflow harness to pipeline the work-list.

Serialize ONLY when outputs feed each other, or when workers would mutate the same
files (then isolate via worktrees or order the writes). Parallelism applies to the
work, never to the proof: the content-bound verification precondition, measured theory
promotion, and one-Quest-per-commit stay serial and intact.

## Pack vs Source Precedence

This section governs the **pack-vs-source** axis (which copy of a rule is
authoritative). For the separate **execution-time** precedence among instructions
(user/safety > Quest canon > domain packs), see boot.md "Authority Order".

Compact packs under [`docs/steering/llm/`](.) are the selective runtime surface.
Each generated domain pack contains every packed rule in that domain, so scope
selection controls context without silently omitting binding rules. The manifest
assigns every configured source an explicit `packed`, `direct-load`, or
`reference-only` role. Use [`rules-index.md`](rules-index.md) or `npm run rule`
for ID lookup and aliases. If source detail shows the pack is wrong, fix the
source and regenerate with `npm run steering:llm:pack`.

One carve-out: the Quest workflow canon (`AGENTS.md`,
[solver-quests.md](../workflow-guidelines/solver-quests.md), and the active Quest
file) is execution-time authority in its own right at Level 2 of boot.md's
Authority Order — above the domain packs — even though solver-quests.md also
feeds the generated governance pack. Do not demote it to "pack source". The same
applies to the runtime-primary source docs AGENTS.md mandates directly:
[operational-ground-truth.md](../operational-ground-truth.md) (required reading
BEFORE any distributed-harness or convergence work) and
[memory-boundary.md](../memory-boundary.md) are read as sources in their own
right, not only to chase cited detail or repair drift.

## 30-Second Must-Not Checklist

Use this list before non-trivial work:

1. **Do not move Quest goalposts** after the first declaration. (Gradient
   refinement — sharpening a frontier metric within the same sealed `doneWhen`
   predicate — is allowed; see solver-quests.md "Gradient refinement of the
   sealed metric".)
2. **Do not claim SOLVED** without live `doneWhen` evidence.
3. **Do not close a cutover Quest on a dormant mechanism.** When a Quest's sealed
   `doneWhen` is "X becomes the authoritative owner" or "the old path is retired",
   SOLVED requires evidence the new mechanism is ENGAGED and authoritative in a real
   run — not merely that its code or tests exist. A flag that leaves the old path as
   the live default while the new mechanism sits dormant is an unfinished cutover. This
   does NOT block the legitimate building-block pattern (a lever validated within
   the session — its flag still may not outlive the session; see Must-Not #19) —
   see solver-quests.md "Closure of cutover vs building-block Quests".
4. **Do not trust agent self-report** for done or metric movement; probes decide.
5. **Do not use `git:<sha>` as attempt proof**; attempt `changeRef` must be
   `diff:<path>`.
6. **Do not bypass recorded architecture decisions** — the owner boundaries and
   contracts recorded under `architecture/` and in active specs — without
   explicit user override/confirmation; a sanctioned exception must be explicit,
   owned, and time-bounded (system-guidelines.md §13.7).
7. **Do not widen, model, or change approach** on a stalled frontier without
   selected Quest theory evidence.
8. **Do not exceed file-size caps** when modifying or creating files; refactor
   first if exceeded.
9. **Do not write runtime/domain scalars inline**; use named constants or
   ingress normalization.
10. **Do not encode runtime state with `null` or `undefined`**; use explicit
    variants.
11. **Do not implement semantic decisions as independent branch piles**; collect
    evidence and emit one canonical outcome.
12. **Do not let callers reproduce owner logic locally**; owners decide and
    caches observe.
13. **Do not weaken guardrails, scripts, allowlists, or scan scope** to make
    proof pass.
14. **Do not keep patching a parked frontier**; record findings and redirect to
    another frontier or end EXHAUSTED.
15. **Do not keep patching a sealed Quest when an altitude reflection shows the
    lever is out of its scope**; capture the insight durably (finding / epic /
    system theory), then honestly EXHAUST and author the higher-altitude Quest/epic.
16. **Do not leave completed work uncommitted**; commit every finished, coherent
    unit of work (a Quest terminal or an ad-hoc task), scoped to its own files and
    excluding unrelated dirty worktree entries. For Quests this is the post-audit
    commit handoff (commit only — the Solver never pushes). See "Default
    Posture: Commit On Completion".
17. **Do not checkpoint or hand off Quest source changes without content-bound
    subagent verification**; attempt approval names the exact patch fingerprint,
    terminal approval names the aggregate source fingerprint, and handoff also
    requires the full audit.
18. **Do not hand-roll a shell command where a script already does it**; consult
    `npm run commands` / [`tools-index.md`](tools-index.md) first (see "Tool
    Discovery").
19. **Do not let a feature flag survive the session that lands it.** By session
    end, bake the behavior in unconditionally (flag deleted) or remove it with
    its functionality; never pin a flag in a test. Inherited flags are recorded
    debt — retire or promote on contact. See fixtures.md "No Flag-Coupled Tests"
    and roadmap.md "Feature Flag Lifecycle".

## Tool Discovery

Before writing an ad-hoc shell command for a repo task (log triage, artifact
cleanup, evidence extraction, validation, summarization), check for an existing
script first — this repo has 100+ of them and ad-hoc commands routinely
reinvent one. Discovery surfaces:

- `npm run commands` — curated quickstart of the highest-value entrypoints.
- [`tools-index.md`](tools-index.md) — generated complete index of every
  `package.json` script, grouped by prefix.
- `npm run rule` / [`rules-index.md`](rules-index.md) — steering rules.
- For distributed or harness work, read
  [`test/distributed/harness/README.md`](../../../test/distributed/harness/README.md)
  and use the `analyze:*` tools before raw-log grep
  (see [operational-ground-truth.md](../operational-ground-truth.md)).

## Canonical Guardrail Command Map

This table covers the guardrail-relevant subset. For the COMPLETE, generated list
of every `solve.js` subcommand (with usage), see
[`solve-commands.md`](solve-commands.md).

| Abstract Rule / Constraint | Canonical CLI Guardrail Command | Enforced By File/Script |
| --- | --- | --- |
| Quest status | `node scripts/solve.js status --id <id>` | `scripts/solve.js` |
| Quest report | `node scripts/solve.js report --id <id>` | `scripts/solve/report.js` |
| Quest probe | `node scripts/solve.js probe ...` | `scripts/solve/probe.js` |
| Quest theory | `node scripts/solve.js theory ...` | `scripts/solve/theory.js` |
| Quest health | `node scripts/solve.js health --id <id>` | `scripts/solve/health.js` |
| Touched/created file-size limits | `npm run audit:file-size` | `scripts/check-file-size-thresholds.js` |
| Runtime syntax and grammar | `npm run audit:runtime-grammar` | `scripts/check-runtime-grammar-contracts.js` |
| Record a finding | `node scripts/solve.js finding --id <id> --frontier <f> --claim "<learning>"` | `scripts/solve.js` |
| Promote a finding to steering | `node scripts/solve.js promote-finding --id <id> --frontier <f> --domain <domain>` | `scripts/solve.js` |

`finding` records a learning into the Quest event log; `promote-finding` promotes
a recorded finding into in-repo steering as a rule (requires
`--domain <architecture|testing|governance|style>`, then regenerate with
`npm run steering:llm:pack`).

## Core Principles

1. **Workflow and context** - Start from a selected or newly authored Quest.
2. **Proof integrity** - Prefer compact proof ladders of 3-5 executable
   commands. Never weaken guardrails to make proof pass.
3. **Coding constraints**:
   - *No inline scalars* - Import or declare canonical constants.
   - *No state-nulls* - Explicit variants must encode domain/runtime state.
   - *Single path* - Use decision tables or state models instead of nested
     independent `if` statements.
   - *Owner decides* - Cache observes; owners decide.
   - *File-size cap* - Touched/created files must stay within the scope
     thresholds enforced by `scripts/check-file-size-thresholds.js`.
4. **Owner boundaries** - Identify semantic owner boundaries, reduce duplicate
   paths, and do not locally patch symptoms.
5. **Delegation** - Sub-agents and external workers produce findings or
   changes; the Solver decides terminal state through probes.
6. **Closure** - SOLVED and EXHAUSTED are Solver report states. MAX_CYCLES is a
   runner bound, not closure.
