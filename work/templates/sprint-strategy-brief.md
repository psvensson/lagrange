# Sprint Strategy Brief

Use this section near the top of active scenario-driven, release-gate, and
causal-escalation sprint files. Keep each field concrete enough that a future
package can tell whether it is still following the right strategic path.

> [!NOTE]
> Active packages in active progress contract sprints must declare the canonical `progressContract` metadata field in their front matter (containing: `owner`, `boundary`, `state`, `reason`, `nextAction`, `wakeSource`, `retryAfterMs`, `terminalState`, `evidencePath`, `blockingDependency`).

## Sprint Strategy Brief

- Goal state: <concrete representative green or release-gate success condition>
- Current causal thesis: <current best explanation for why the gate is red>
- Competing hypotheses: <credible alternates that could redirect owner, boundary, or proof sequence>
- Confidence and evidence: <confidence by hypothesis plus artifacts, probes, or extractor outputs>
- Expected green path: <expected package sequence from current residual to success>
- Wrong direction signals: <evidence that the sprint is following the wrong path>
- Next best package: <next package to continue or activate after the current package closes>
- Stop or escalate rule: <condition that opens/selects autonomous architecture experiment, causal escalation, or human-only escalation for blocked/contradictory evidence>

## Theory Loop Generative Brief

Use this section for theory-loop sprints. Keep the entries concrete and
evidence-linked; options are hypotheses to compare, not queued future packages.

1. Evidence Anchor: current problem, representative artifact, success
   condition, stable facts, changed facts, and current unknowns.
2. Mechanism Card: mechanism taxonomy term, rejected alternatives, deciding
   owner, missing transition or observation, smallest falsifier, expected
   movement, negative result meaning, and escalation rule.
3. Theory Option Set: 2-4 options, each with mechanism, intervention style,
   source or test code modification, cheapest discriminator, promotion trigger,
   and rejection signal.
4. Creative Move Menu: ownership inversion, minimal trace, opposite
   intervention, boundary swap, missing object, or another named move that can
   produce a non-obvious option.
5. Discriminator First: cheapest discriminator runs or is named before code
   edits unless the active package owns it as first proof.
6. Real Package Rule: a promoted theory-loop work package must change source or
   test code inside declared write scope, verify the theory with a falsifying
   proof command, and record the result; evidence-only discriminators remain in
   the sprint until they promote real code work.
7. Promotion Rule: only the evidence-selected option becomes one executable
   package with explicit owner, boundary, write scope, proof, and stop rule.
8. Learning Rule: record supported, avoided, falsified, fixed, migrated,
   representative-green, architecture-gap, or needs-rerun before selecting a
   successor.

## Sprint Systemic Insight Gate

Use this section when a sprint starts producing adjacent-owner bounces,
same-frontier loops, or fixes that explain one symptom but not the repeated
shape of failure.

1. Contradiction: <facts that appear simultaneously true and need one system-level explanation>
2. Competing causal theories: <producer, consumer, lifecycle, retry/wake, admission/gating, observability, and stale-evidence explanations>
3. Missing system object: <runtime code, vocabulary, invariant, owner contract, evidence projection, fixture coverage, or architecture policy>
4. Failure mechanism taxonomy term: <observation_gap | selection_gap | admission_gap | transition_gap | scheduling_gap | budget_gap | concurrency_gap | contract_gap | ownership_gap | downstream_symptom>
5. Next package as experiment: <the theory being tested and the owner/boundary/files implied by that theory>
6. Falsifier: <evidence that redirects owner, boundary, package sequence, or escalation path>
7. Negative proof: <proof the change does not reintroduce old debt, reinterpret downstream symptoms, or depend on stale diagnostics>
8. Representative checkpoint: <fresh route or rerun required before another local patch on the same unchanged artifact>
9. Expected mechanism movement: <how the mechanism classification or boundary is expected to move or migrate after this change>
10. Stop rule: <condition that opens/selects an autonomous architecture experiment instead of another local patch; human escalation only for blocked/contradictory evidence>
