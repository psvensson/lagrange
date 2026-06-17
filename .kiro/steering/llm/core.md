---
scope: core
status: manual-pack
always_load: true
source_of_truth: self
canonical_rules: .kiro/steering/workflow-guidelines/solver-quests.md
last_reviewed: 2026-06-01
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
| Park / parked | A frontier set aside with no honest remaining local move; the scheduler redirects elsewhere. |
| Owner / owner boundary | The single component that owns a semantic decision or resource; others observe (cache), they do not re-derive it. |
| Proof ladder | A compact sequence of 3-5 executable commands that demonstrates a claim. |
| Subagent | A spawned worker that produces verification or research; recorded as evidence `subagent:<id>`. |
| SOLVED / EXHAUSTED | Terminal Solver states: `doneWhen` met, or every frontier parked with no honest move. |
| MAX_CYCLES / THEORY_REQUIRED / BLOCKED | Non-terminal run gates the executor resolves and resumes (not handoff points). |

## North Star

Preserve the highest-level owner boundary, choose the lightest Quest shape that
proves the boundary was not weakened, and do not locally patch symptoms when
the owner contract is porous.

## Default Posture: Autonomy

On a non-trivial task, drive the Quest to a true terminal (SOLVED or EXHAUSTED)
without pausing for confirmation. Non-terminal gates (MAX_CYCLES, THEORY_REQUIRED,
recoverable BLOCKED) are yours to resolve and resume — they are not handoff points.
Prefer `run ... --keep-alive` for longer work so the loop survives those gates.

Stop and ask the user ONLY when one of these holds:

1. **Authorization** — an irreversible or outward-facing action (push, publish,
   delete, deploy, send) that is not already durably authorized.
2. **Goalpost ambiguity** — the success condition itself is genuinely undetermined
   and cannot be resolved from the repo, the Quest, or a sensible default; a wrong
   guess would change what "done" means. (A wrong guess about *how* to implement is
   NOT this: pick the obvious option, record a finding, proceed.)
3. **EXHAUSTED** — no honest remaining move.
4. **Safety / scope** — a destructive boundary, or work outside the sealed Quest
   scope.

Otherwise: choose the obvious default, record a finding stating the choice and why,
and keep going. Surface the decisions in the final report, not mid-run.

## Default Posture: Parallelism

When sub-tasks are independent, run them concurrently rather than in sequence:

- Batch independent reads/searches into one step; fan out read-only Explore or
  research subagents for breadth instead of reading serially.
- Verify N independent findings with N concurrent verifiers, not one at a time.
- For broad mechanical work (audits, migrations, sweeps over a known file list), use
  the Workflow harness to pipeline the work-list.

Serialize ONLY when outputs feed each other, or when workers would mutate the same
files (then isolate via worktrees or order the writes). Parallelism applies to the
work, never to the proof: the subagent-verify-before-handoff gate, measured theory
promotion, and one-Quest-per-commit stay serial and intact.

## Source Authority Precedence

Compact packs under [`.kiro/steering/llm/`](.) are the runtime surface. Each
generated domain pack is a priority-ranked SUBSET (capped per `maxRules`), not the
full rule corpus — consult [`rules-index.md`](rules-index.md) or `npm run rule` for
every rule in a domain. Source steering under [`.kiro/steering/`](../) is consulted
only to chase cited detail behind a compact-pack rule or to repair pack drift. If
source detail shows the pack is wrong, fix the source and regenerate with
`npm run steering:llm:pack`.

## 30-Second Must-Not Checklist

Use this list before non-trivial work:

1. **Do not move Quest goalposts** after the first declaration. (Gradient
   refinement — sharpening a frontier metric within the same sealed `doneWhen`
   predicate — is allowed; see solver-quests.md "Gradient Refinement".)
2. **Do not claim SOLVED** without live `doneWhen` evidence.
3. **Do not trust agent self-report** for done or metric movement; probes decide.
4. **Do not use `git:<sha>` as attempt proof**; attempt `changeRef` must be
   `diff:<path>`.
5. **Do not bypass frozen architecture decisions** without explicit user
   override/confirmation.
6. **Do not widen, model, or change approach** on a stalled frontier without
   selected Quest theory evidence.
7. **Do not exceed file-size caps** when modifying or creating files; refactor
   first if exceeded.
8. **Do not write runtime/domain scalars inline**; use named constants or
   ingress normalization.
9. **Do not encode runtime state with `null` or `undefined`**; use explicit
   variants.
10. **Do not implement semantic decisions as independent branch piles**; collect
   evidence and emit one canonical outcome.
11. **Do not let callers reproduce owner logic locally**; owners decide and
    caches observe.
12. **Do not weaken guardrails, scripts, allowlists, or scan scope** to make
    proof pass.
13. **Do not keep patching a parked frontier**; record findings and redirect to
    another frontier or end EXHAUSTED.
14. **Do not hand off solved Quest work without git durability**; after Solver
    audit passes, commit and push all Quest-scoped changes, excluding unrelated
    dirty worktree entries.
15. **Do not hand off Quest source changes without subagent verification**;
    spawn a subagent verifier and record a Solver finding with evidence
    `subagent:<id>` before audit/git handoff.
16. **Do not hand-roll a shell command where a script already does it**; consult
    `npm run commands` / [`tools-index.md`](tools-index.md) first (see "Tool
    Discovery").

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

| Abstract Rule / Constraint | Canonical CLI Guardrail Command | Enforced By File/Script |
| --- | --- | --- |
| Quest status | `node scripts/solve.js status --id <id>` | `scripts/solve.js` |
| Quest report | `node scripts/solve.js report --id <id>` | `scripts/solve/report.js` |
| Quest probe | `node scripts/solve.js probe ...` | `scripts/solve/probe.js` |
| Quest theory | `node scripts/solve.js theory ...` | `scripts/solve/theory.js` |
| Quest health | `node scripts/solve.js health --id <id>` | `scripts/solve/health.js` |
| Touched/created file-size limits | `npm run audit:file-size` | `scripts/check-file-size-thresholds.js` |
| Runtime syntax and grammar | `npm run check-runtime-grammar` | `scripts/check-runtime-grammar.js` |

## Quest Shape Picker

| Shape | Use when |
| --- | --- |
| `read/review` | Answering, review, or explanatory docs with no implementation truth change. |
| `maintenance` | Bounded docs, templates, generated steering, or tooling cleanup. |
| `proof` | Tests, validation evidence, or diagnostic classification without runtime behavior change. |
| `experiment` | A bounded hypothesis or probe decides the next owner/action. |
| `runtime` | Runtime behavior, owner contracts, shared metadata, diagnostics grammar, or affected consumers can change. |
| `scenario` | Distributed, integration, load, release-gate, repeated same-frontier, or causal-closure work. |

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
