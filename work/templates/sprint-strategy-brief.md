# Sprint Strategy Brief

Use this section near the top of active scenario-driven, release-gate, and
causal-escalation sprint files. Keep each field concrete enough that a future
package can tell whether it is still following the right strategic path.

## Sprint Strategy Brief

- Goal state: <concrete representative green or release-gate success condition>
- Current causal thesis: <current best explanation for why the gate is red>
- Competing hypotheses: <credible alternates that could redirect owner, boundary, or proof sequence>
- Confidence and evidence: <confidence by hypothesis plus artifacts, probes, or extractor outputs>
- Expected green path: <expected package sequence from current residual to success>
- Wrong direction signals: <evidence that the sprint is following the wrong path>
- Next best package: <next package to continue or activate after the current package closes>
- Stop or escalate rule: <condition that opens causal, architecture, or human escalation>

## Sprint Systemic Insight Gate

Use this section when a sprint starts producing adjacent-owner bounces,
same-frontier loops, or fixes that explain one symptom but not the repeated
shape of failure.

1. Contradiction: <facts that appear simultaneously true and need one system-level explanation>
2. Competing causal theories: <producer, consumer, lifecycle, retry/wake, admission/gating, observability, and stale-evidence explanations>
3. Missing system object: <runtime code, vocabulary, invariant, owner contract, evidence projection, fixture coverage, or architecture policy>
4. Next package as experiment: <the theory being tested and the owner/boundary/files implied by that theory>
5. Falsifier: <evidence that redirects owner, boundary, package sequence, or escalation path>
6. Negative proof: <proof the change does not reintroduce old debt, reinterpret downstream symptoms, or depend on stale diagnostics>
7. Representative checkpoint: <fresh route or rerun required before another local patch on the same unchanged artifact>
8. Stop rule: <condition that triggers architecture or human escalation instead of another local patch>
