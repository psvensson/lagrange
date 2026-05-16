# Cockroach Style Control Plane Priority Convergence Class

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-16",
  "lane": "runtime-owner-boundary",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "control_plane_priority_convergence_class",
  "dominantReason": "control_plane_progress_competes_with_ordinary_repair",
  "currentState": "Control-plane publication and active-gate convergence can be delayed by the same pressure and repair machinery used by broader diagnostics. This package makes critical topology convergence an explicit priority class with typed pressure outcomes.",
  "nextAction": "Create a control-plane convergence class with stricter admission and pressure semantics for publication and active-gate critical work.",
  "proof": [
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/admin/admin-control-snapshot-class-part-2.js"
  ],
  "writeScope": [],
  "handoffFiles": [
    "work/tracks/topology-convergence.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/control-plane/control-plane-error-classification.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-websocket-api-segment-3.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "commitScope": [],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/follow-on",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  }
}
-->

## Why

CockroachDB gives system ranges stronger resilience expectations than ordinary
ranges. The local analogue is not CockroachDB range replication. The useful
idea is that metadata needed for cluster correctness should not compete on the
same terms as ordinary or diagnostic work.

This package applies that idea to control-plane publication, active-gate
handoff, and owner recovery. Critical convergence work may still defer under
pressure, but it must receive a stricter admission contract and typed outcome
instead of disappearing behind ordinary repair backoff.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, production guarantees and topology
workflow stabilization. External reference: CockroachDB system range
resilience docs, `https://www.cockroachlabs.com/docs/stable/alter-range`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: a shared pressure/admission class can be added
  without changing user-facing features or edition scope.
- Escalation trigger to a heavier lane: the package needs new user controls,
  broad scheduler policy, or Pro/Enterprise behavior.

## Shared Boundary Contract

- Semantic owner: `topology_publication_owner` owns publication convergence
  class semantics; `startup_active_gate_owner` consumes the class for handoff
  and admission evidence.
- Canonical evidence inputs: control-plane pressure state, owner queue depth,
  publication ACK state, handoff target, retry-after, and bounded progress
  mechanism.
- Canonical state vocabulary: `critical_admitted`, `critical_deferred`,
  `critical_rejected`, `ordinary_deferred`, `diagnostic_deferred`.
- Allowed consumers: publication owner, admin snapshot, active-gate handoff,
  topology convergence graph, and distributed harness.
- Forbidden reinterpretations: no consumer may treat ordinary diagnostic
  repair deferral as critical publication progress.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Add a named critical convergence class for membership publication, control
   plane publication ACK, active-gate handoff, and owner recovery wake work.
2. Route those operations through the existing owner/admission machinery with a
   stricter bounded contract: bounded queue, retry-after, owner key, and typed
   pressure outcome.
3. Keep diagnostics and broad repair on the ordinary class.
4. Add pressure tests proving critical convergence is not silently dropped and
   ordinary diagnostics can defer without blocking the owner command.
5. Update reports to distinguish critical defer from ordinary repair defer.

## Out Of Scope

1. User-visible priority controls.
2. Pro or Enterprise scheduling policy.
3. Unlimited queues or hidden retries.
4. Treating pressure as success.

## Borrowing Details

What is borrowed:

1. Critical metadata gets a distinct resilience/admission class.
2. The class is stricter for correctness traffic than for ordinary diagnostic
   traffic.
3. Failure under pressure is typed and observable.

What is not borrowed:

1. CockroachDB range replication.
2. SQL zone configuration.
3. Operator-facing control surfaces.

Local implementation shape:

1. Define a constant-owned convergence class vocabulary.
2. Add one decision table mapping owner command plus pressure evidence to
   critical outcome.
3. Thread the class through existing publication owner and admin snapshot
   options.
4. Add focused pressure tests with injected failure/latency, not real delay.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/follow-on`
- Output profile: `medium`
- Owned files: this package file until activation; candidate runtime files may
  be promoted only after owner-files proof selects the critical convergence
  class path.
- Forbidden files: non-candidate runtime files, user-visible priority controls,
  unlimited queues, and Pro or Enterprise behavior.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`, `node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/admin/admin-control-snapshot-class-part-2.js`
- Model ledger advisory: `escalate`

## Validation

1. npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown
2. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
3. node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/admin/admin-control-snapshot-class-part-2.js
