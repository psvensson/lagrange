---
audience: development
documentClass: current
---

# Solver Evidence Identity And Reuse

Reuse is valid only when the existing proof owner establishes that evidence
applies to the current claim and candidate. An unchanged filename, a remembered
green command, or a recent artifact is insufficient. Use the current owners
below; this guidance does not introduce a proof cache or a second identity
framework.

## Current Owners

| Concern | Current owner and behavior |
| --- | --- |
| Quest lifecycle and review | `scripts/solve/commands.js` and `store.js`; attempts and verification entries establish the current recorded review, and `land` measures the sealed probe and checks the staged change. |
| Proof selection | `scripts/checks/change-selection.js`, the canonical import graph, and `test/shards/impact-contracts.json`; the selector chooses applicable witnesses and refuses unsafe modular proof. |
| Probe interpretation | `scripts/solve/probes.js`; each supported probe interprets its own result and reports when it cannot measure. |
| Durable evidence bytes | `scripts/solve/evidence-store.js`; uploaded artifacts are downloaded and hashed before a reference is recorded. Byte integrity does not itself prove applicability. |
| Reusable registered proof | `scripts/proof-authority.js`; registered contracts resolve exact-SHA or explicitly permitted release-content identity as described in [`durable-proof-receipts.md`](durable-proof-receipts.md). |

Normal commands and lifecycle requirements remain in
[`solver-runbook.md`](solver-runbook.md). Current Solver does not implement a
schema-v3 landing-review manifest or a generic content-addressed cache of every
probe. Do not rely on retired review fingerprints, imagined automatic candidate
isolation, or an unimplemented post-commit identity check.

## Candidate And Applicability

Keep the repair's exact source and proof inputs identifiable, and isolate its
work from unrelated concurrent edits. Current `land` stages the change, refreshes
owned generated inventories, checks the canonical import graph and pre-commit
guards, and runs the change proof against `HEAD` as the repair delta. Publication
owns the full branch range. Do not describe this as an automatically detached
candidate worktree or use unrelated dirty files as proof inputs.

Before carrying earlier evidence forward, check the current candidate against
its original provenance and the existing selector. Consider changed callers,
contracts, dependencies and lockfiles, configuration, generated inputs, test
code and assertions, model assumptions, and execution environment. When a
relevant input changed or applicability cannot be established, rerun the
necessary proof. A hand-written equivalence claim does not override a selector
refusal or a required exact-candidate gate.

An independently complete repair retains its original evidence and regression
when the next causal repair starts. Select cumulative regression coverage using
the existing import and interaction contracts. Do not reset valid progress, and
do not relabel an old receipt as a fresh measurement of a later candidate.

## Evidence Ceilings And Freshness

A deterministic witness establishes its exercised mechanism and ordering. A
native or physical run establishes only the runtime and failure domains it
actually exercised. Separate safety, recovery progress, and resource claims;
repair, representative service, and release acceptance remain distinct.

`test-receipt/1` contains command results but does not bind every candidate and
proof input for automatic cross-candidate reuse. The current test-receipt probe
checks required receipt ids and pass status; that parser alone does not establish
source identity or environment applicability. Scenario probes likewise consume
reports under their supported semantics; report selection is not a substitute
for source and configuration provenance. Supply the existing provenance and
record the limitation, or obtain fresh evidence for the required claim.

Multiple actual live runs remain distinct measurements. Reusing one artifact
cannot manufacture a streak, sample count, independent failure domain, or fresh
soak. Preserve first failures and expected-negative controls alongside later
successes. Mark product, fixture/harness, verifier, and unavailable-execution
outcomes separately without rewriting original verdicts.

## Landing And Release

Use the current landing preflight to collect independent repairable failures in
one pass. Dependent proof remains untrusted until its prerequisite, such as the
canonical import graph, is valid. Independent review must cover the actual
candidate after the last material repair; bookkeeping alone does not imply a
new source defect, but the tool's current-review checks still apply.

Landing, publication, and release keep their required exact-candidate checks.
Only the registered proof authority may authorize its defined reuse. Current
external availability, publication credentials, physical conditions, and other
freshness-bound facts require current evidence. If a needed reuse guarantee is
not implemented, report that gap and use the supported proof path; do not
silently weaken the claim or build another evidence framework to bypass it.
