---
id: continuous-ai-workflow-landscape
status: done
proof: deterministic
legacy: true
roadmapRow: null
graduatesTo: null
quests: []
authorizes: []
legacyStatus: resolved
---

# Continuous long-horizon AI-engineering workflow landscape (research note)

**Status:** research note — no committed scope. Build-vs-adopt evidence for the Quest workflow.
Graduates into `quest-standing-invariants.md` (the design that acts on this scan).
**Date:** 2026-06-23
**Method:** deep-research workflow (102 agents, 5 search angles, 20 sources fetched, 97 claims
extracted, 25 adversarially verified at 3 votes/claim, 23 confirmed / 2 refuted).

## Question

Is there any system — OSS preferred — that does *continuous, long-horizon, whole-system
architecture evolution* better than this project's bespoke **Quest** harness (event-sourced
Solver, sealed declarative `doneWhen`, frontiers that *park*, recorded falsifiers, a closure
ledger, SOLVED/EXHAUSTED terminals, on Kiro-style steering/spec files)? Specifically, does
anything model **evidence-gated closure / persistent revisitable goal frontiers** — the
project's distinctive capability?

## Bottom line

**No.** Nothing open-source or commercial models evidence-gated closure / persistent
revisitable goal frontiers (sealed `doneWhen` proven against a live event log, parked
frontiers, recorded falsifiers, SOLVED-vs-EXHAUSTED). This is convergent *negative* evidence
across the whole surveyed landscape, not a single source. **Do not replace the Quest layer.**

The ecosystem covers exactly one of our patterns per bucket; none cover closure.

| Pattern | Best OSS option | Gives / lacks | Fit verdict |
|---|---|---|---|
| Persistent cross-session memory | **Letta/MemGPT** (Apache-2.0), **Mem0** | Tiered/editable memory blocks, archival vector store, goals retrievable across sessions — *no goal closure* | Graft **under** the Solver as a memory substrate |
| Stateful long-running orchestration | **LangGraph** | Durable checkpoint/resume, two-tier memory — *forward-resume only; time-travel = debug replay, not convergence* | Plumbing the Solver could run **on**, not a replacement |
| Autonomous CI loops | **GitHub "Continuous AI"** | Many small bounded chores — *explicitly NOT long-horizon goal-state/closure* | Orthogonal complementary delivery mechanism |
| Static workflow verification | **Agentproof** | Verifies graph *topology* (reachability, human-gate order) — *does not prove semantic predicates against a runtime event log* | Strictly weaker than closure on the dimension that matters |

## Key findings (confidence + sources)

1. **[high] The distinctive capability is unmatched.** OpenHands SDK, LangGraph, GitHub
   Continuous AI, Agentproof, and the SDD-tool survey (Spec-Kit, Kiro, BMad, OpenSpec, Tessl,
   Spec Kitty) each independently lack an evidence-gated SOLVED/EXHAUSTED closure model.
   Sources: arXiv:2511.03690, docs.langchain.com/.../langgraph/overview, github.blog
   (continuous-ai-in-practice), arXiv:2603.20356, github.com/cameronsjo/spec-compare.

2. **[high] Closest analogs are EVALUATION BENCHMARKS, not buildable solvers.** **EvoClaw**
   (arXiv:2603.13428, Mar 2026): 98 milestones across 7 itineraries linked by a dependency
   DAG over a persistent, stateful repo, with "verifiable, executable, testable" evolution
   itineraries — structurally the nearest thing to parked frontiers + falsifiers + closure
   ledger. **SWE-EVO** (arXiv:2512.18470): long-horizon multi-file (avg 21 files) iterative
   evolution preserving functionality. Both *measure* agents; neither *is* a graftable solver.
   **Action: adopt as external eval harnesses to score the Quest harness.**

3. **[high] The field confirms why the harness has value.** Frontier agents collapse from
   >80% (isolated) to ≤38.03% overall / 13.37% full-milestone resolve (EvoClaw, 12 models ×
   4 frameworks) and 25% vs 72.8% SWE-Bench Verified (SWE-EVO). Models cannot self-sustain
   long-horizon architectural coherence — the exact gap evidence-gated, falsifier-recording,
   drift-resistant machinery manages. (Caveat: SWE-EVO's 72.8% baseline uses a different
   model than its 25% config, so the headline gap is directional; intra-benchmark rankings
   still hold.) Sources: arXiv:2603.13428, arXiv:2512.18470.

4. **[high] Goal-drift literature endorses our design.** Apollo Research (arXiv:2505.02709,
   AIES 2025): drift onset varies by capability (GPT-4o-mini ~16 steps; Claude 3.5 Sonnet
   past 64 steps / 90k tokens) and is driven by *in-context pattern-matching* (worsens with
   distractor examples), not token distance. ~6 sources converge on the mitigation: externalize
   goals/definitions-of-done to persistent files and re-read at every decision point — exactly
   the sealed-`doneWhen` + Kiro steering-file pattern. Caveat: necessary but not sufficient —
   summaries still drift; structural separation of planning vs execution context also helps.
   Sources: arXiv:2505.02709, arXiv:2603.03258, Zylos (2026-04-03), Deep Agents, Ralph pattern,
   InfiAgent arXiv:2601.03204, Git Context Controller arXiv:2508.00031.

5. **[high] Memory layers are graftable under the Solver, not replacements.** Letta
   (continuation of MemGPT): memory-first runtime, in-context editable/shared memory blocks +
   out-of-context vector archival, all DB-persisted. Mem0 (arXiv:2504.19413): extracts/
   consolidates semantic facts so a session-1 goal is retrievable in session 5. Neither models
   closure. Caveat: Mem0's ~26% accuracy / 91% p95-latency claims are vendor-favorable and
   publicly contested by Letta and Zep on methodology — treat as marketing.

6. **[high] LangGraph = orchestration plumbing only.** Self-described "low-level orchestration
   framework for long-running, stateful agents": checkpointers (Postgres/Redis/SQLite/S3),
   two-tier memory (working via checkpoints, long-term via Store), time-travel/fork. But that
   is debug infrastructure, not convergence. Caveat: default InMemorySaver doesn't survive
   restarts; "durable execution" is partly DIY (manual resume, single-process OSS).

7. **[high] "Continuous AI" is bounded chores, not goal-state tracking.** GitHub Next: "many
   small agents, each responsible for one chore" (doc/code alignment, dependency drift,
   coverage burndown), human-gated/read-only by default. Does not address long-horizon
   goal-state, cross-session memory, ADR tracking, or closure. Vendor blog, mild marketing.

8. **[high] Static verifiers verify topology, not evidence.** Agentproof (arXiv:2603.20356):
   BFS over a graph×DFA product, pre-execution; explicitly "does not attempt to prove semantic
   properties of LLM outputs." Its goal/evidence check is structural reachability, not a
   predicate holding against a live event log.

## Recommendations

1. **Keep the Quest layer.** Confirmed best-in-class for long-horizon closure.
2. **Optional graft — memory under the Solver** (Letta Apache-2.0 or Mem0) if cross-session
   recall becomes a pain point. Treat Mem0 benchmarks as vendor claims.
3. **Adopt EvoClaw / SWE-EVO as external eval harnesses** to score whether the closure
   machinery measurably beats bare frontier agents on continuous evolution — strongest possible
   empirical validation of the harness's value.
4. **Two genuine uncovered gaps** nobody fills: agent-driven **ADR tracking** and
   **architectural drift/erosion detection**. Candidate new frontier categories for the
   closure ledger if/when wanted.

## Caveats / scope of evidence

- Fast-moving field; several primary sources (EvoClaw Mar-2026, Agentproof Mar-2026, Zylos
  Apr-2026) post-date the Jan-2026 knowledge cutoff and rely on the harness's live fetches.
  Model names (GPT-5.4, Claude Opus 4.6, Gemini 3 Pro) and benchmark numbers will age fast.
- Two findings lean partly on secondary/vendor sources (Zylos blog; Mem0's contested figures).
- Two claims were 2-1 splits (Mem0 endorsement; spec-compare scope) and are hedged.
- Two claims were REFUTED and excluded: that the Zylos article (vs the arXiv paper) proposes
  the GD_actions/GD_inaction metrics; and a blanket "none of the 6 SDD tools target long-horizon
  evolution" (refuted 0-3 as overreach).
- **Not deeply assessed** (absence of evidence ≠ evidence of absence): Task Master AI, CrewAI,
  AutoGen/AG2, OpenAI Agents SDK, SWE-agent, Devin, Aider, Continue.dev, Zep.

## Open questions

- Does any system combine a persistent memory layer WITH a goal-closure/convergence terminal
  model in one stack, or must this remain a composition we assemble (memory under a bespoke
  solver)?
- How would the Quest harness actually score on EvoClaw / SWE-EVO vs bare frontier agents?
- Are there OSS systems implementing agent-driven ADR tracking and architectural drift
  detection that could be grafted onto the closure ledger as a frontier category?
- What do the un-surveyed orchestration frameworks (CrewAI, AutoGen/AG2, OpenAI Agents SDK,
  Aider architect mode) offer for sustained multi-session codebase evolution?
