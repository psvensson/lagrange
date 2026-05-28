# Sprint Strategy Brief

Use this section near the top of active scenario-driven, release-gate, and
causal-escalation sprint files. Keep each field concrete enough that a future
package can tell whether it is still following the right strategic path.

> [!NOTE]
> Active packages in active progress contract sprints must declare the canonical `progressContract` metadata field in their front matter (containing: `owner`, `boundary`, `state`, `reason`, `nextAction`, `wakeSource`, `retryAfterMs`, `terminalState`, `evidencePath`, `blockingDependency`).

## Sprint Strategy Brief

- Goal state: record the representative green condition or release-gate success condition.
- Current causal thesis: record the current best explanation for why the gate is red.
- Competing hypotheses: record credible alternates that could redirect owner, boundary, or proof sequence.
- Confidence and evidence: record confidence by hypothesis plus artifacts, probes, or extractor outputs.
- Expected green path: record the expected package sequence from current residual to success.
- Wrong direction signals: record evidence that the sprint is following the wrong path.
- Next best package: record the next package to continue or activate after the current package closes.
- Stop or escalate rule: record the condition that opens or selects an autonomous architecture experiment, causal escalation, or human-only escalation for blocked or contradictory evidence.

## Theory Loop Generative Brief

Use this section for theory-loop sprints. Keep the entries concrete and
evidence-linked; options are hypotheses to compare, not queued future packages.

1. Evidence Anchor: current problem, representative artifact, success
   condition, stable facts, changed facts, and current unknowns.
2. Mechanism Card: mechanism taxonomy term, rejected alternatives, deciding
   owner, missing transition or observation, smallest falsifier, expected
   movement, negative result meaning, and escalation rule.
3. Theory Option Set: 2-4 options, each with mechanism, intervention style,
   `src/` source-code modification, cheapest discriminator, promotion trigger,
   and rejection signal.
4. Two-Level Theory Rule: repeated-frontier, architecture-gated, owner-migration,
   and causal-escalation sprints first record the whole-system theory, then
   promote only the selected executable slice.
5. Creative Move Menu: ownership inversion, minimal trace, opposite
   intervention, boundary swap, missing object, or another named move that can
   produce a non-obvious option.
6. Discriminator First: cheapest discriminator runs or is named before code
   edits unless the active package owns it as first proof.
7. Real Package Rule: a promoted theory-loop work package must change `src/`
   source code inside declared write scope, verify the theory with a falsifying
   proof command, record the result, and create or link the successor package;
   evidence-only and classification-only discriminators remain in the sprint
   until they promote real source work.
8. Promotion Rule: only the evidence-selected option becomes one executable
   package with explicit owner, boundary, write scope, proof, and stop rule.
9. Learning Rule: record supported, avoided, falsified, fixed, migrated,
   representative-green, architecture-gap, or needs-rerun before selecting a
   successor.
10. Closure Rule: the sprint continues indefinitely until its success condition
    is met. Close only after `## Theory Loop Success Evidence` records
    `Success condition met: yes`, fresh representative evidence, a successful
    result, and why continuation stops. Same-frontier, classification-only,
    needs-rerun, pending, or unknown outcomes keep the sprint active.

## Sprint Systemic Insight Gate

Use this section when a sprint starts producing adjacent-owner bounces,
same-frontier loops, or fixes that explain one symptom but not the repeated
shape of failure.

1. Contradiction: record facts that appear simultaneously true and need one system-level explanation.
2. Competing causal theories: record producer, consumer, lifecycle, retry/wake, admission/gating, observability, and stale-evidence explanations.
3. System theory: record the phase chain, owner-boundary map, stable and changed facts, competing and eliminated theories, downstream symptoms, transition table, migration triggers, architecture-gap triggers, and invariant.
4. Slice theory: record the selected mechanism, source/test contract, focused falsifier, expected representative movement, kill rule, theory-fit score, and wrong-slice triggers.
5. Missing system object: record the runtime code, vocabulary, invariant, owner contract, evidence projection, fixture coverage, or architecture policy that is absent.
6. Failure mechanism taxonomy term: record one of observation_gap, selection_gap, admission_gap, transition_gap, scheduling_gap, budget_gap, concurrency_gap, contract_gap, ownership_gap, or downstream_symptom.
7. Next package as experiment: record the theory being tested and the owner, boundary, and files implied by that theory.
8. Falsifier: record evidence that redirects owner, boundary, package sequence, or escalation path.
9. Negative proof: record proof that the change does not reintroduce old debt, reinterpret downstream symptoms, or depend on stale diagnostics.
10. Representative checkpoint: record the fresh route or rerun required before another local patch on the same unchanged artifact.
11. Expected mechanism movement: record how the mechanism classification or boundary is expected to move or migrate after this change.
12. Stop rule: record the condition that opens or selects an autonomous architecture experiment instead of another local patch; human escalation is only for blocked or contradictory evidence.
