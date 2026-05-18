# Title

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "YYYY-MM-DD",
  "lane": "runtime-owner-boundary",
  "scenario": "scenario-or-none",
  "artifact": "path/to/artifact-or-none",
  "playback": "path/to/playback-or-none",
  "owner": "canonical_runtime_owner",
  "boundary": "owner_boundary",
  "dominantReason": "current_owner_reason",
  "currentState": "one-line current state",
  "nextAction": "focused owner-boundary action",
  "proof": [
    "focused owner-path test",
    "affected consumer proof",
    "static guardrails"
  ],
  "writeScope": [
    "src/example.js",
    "test/example.test.js"
  ],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "src/example.js",
    "test/example.test.js",
    "work/packages/active-YYYYMMDD-package.md"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction",
    "escalationTriggers": [
      "owner boundary changes",
      "proof requires unrelated runtime files",
      "representative scenario migrates to a new owner"
    ]
  }
}
-->

## Why

Describe the runtime owner-boundary problem.

## Lane

- Selected lane: runtime owner-boundary
- Primary owner:
- Primary boundary:
- Escalate to scenario lane if:

## Core Logic Brief

- Canonical outcome:
- Inputs/signals:
- State model or invariant:
- Non-goals and forbidden interpretations:
- Proof mapping:
- Wrong-slice trigger:

## Expected Representative Delta

Required when a representative artifact selected this runtime package.

- Baseline artifact:
- Expected metric, owner, boundary, dominant reason, or route delta:
- Local proof class:
- Representative proof class:
- Stop if unchanged:

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `not-needed-inline-gate`
- Artifact budget: `one-artifact`
- Proof command budget: `two-or-three-canonical-commands`
- Decision record: classification gate stays inside this runtime package unless
  owner, boundary, required action, stop condition, or successor choice changes.
- Successor action: `update-current-package`
- Runtime promotion rule: this package is already the
  `runtime-owner-boundary` successor for stable owner/boundary evidence.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc
`jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits:
   `npm run work:package:doctor -- --suggest <package>`,
   `npm run work:package:doctor -- --fix-dry-run <package>`,
   `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence:
   `npm run work:evidence-summary -- <artifact>` plus any focused extractor
   for this failure class.
3. Owner discovery:
   `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing:
   `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup:
   `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which
canonical extractor was tried and why it was insufficient.

## Shared Boundary Contract

- Semantic owner:
- Canonical evidence inputs:
- Canonical state or outcome vocabulary:
- Allowed consumers:
- Forbidden reinterpretations:
- Operational authority:
- Diagnostics-only views:
- Owner-internal retained state:

## Scope

In scope:

1. Item

Out of scope:

1. Item

## Static Drift Ledger

Preflight:

- [ ] Decision-boundary guard recorded.
- [ ] Runtime-grammar guard recorded when runtime meaning changes.
- [ ] Metadata gateway guard recorded when system-table ingress changes.
- [ ] Scalar/literal guard recorded for materially edited runtime files.

Closure:

- [ ] Same guardrails rerun.
- [ ] No relevant guardrail count increased.
- [ ] Any out-of-scope inherited violation has a linked follow-on package.

## Subagent Sequencing Ledger

Required for this lane unless the user explicitly disables subagents.
Use `npm run work:validate -- --pre-impl` before implementation and
`npm run work:validate -- --closure` before close/commit. Before closure only,
unavailable delegation may be recorded as `human-waived`,
`tool-unavailable`, or `blocked-by-environment-policy` with `reason: ...`;
closure still requires complete real proof unless human policy explicitly
changes the package.

- [ ] Review subagent recorded:
      Agent <name> (<agent-id>) reviewed <package>;
      result `<clean|fixes-required>`.
- [ ] Fix subagent recorded or explicitly not needed:
      Agent <name> (<agent-id>) fixed <package>, or `not-needed` only when
      review result is `clean`.
- [ ] Implementation subagent recorded:
      Agent <name> (<agent-id>) implemented <this package>;
      parent revalidated focused proof: yes.

## Subagent Progress Ledger

Required with the sequencing ledger. Each real subagent appends one checked
update after every completed subtask; the Sequencing Ledger remains the
role-completion proof.

- [ ] Agent <name> (<agent-id>) <role> context loaded: scope and blocker confirmed; evidence: package, sprint, and handoff files read; next: first focused probe.
- [ ] Agent <name> (<agent-id>) <role> probe complete: state/cause confirmed or contradicted; evidence: command and result; next: edit, validate, or blocker handoff.
- [ ] Agent <name> (<agent-id>) <role> validation complete: package proof refreshed; evidence: commands and results; next: final handoff or successor action.

## Subagent Attempt Ledger

Required with the sequencing ledger. Every real subagent attempt records the
latest checkpoint, validation state, parent action, and recovery decision.
Interrupted or partial-unvalidated attempts must be followed by a checked
superseded/discarded/revalidated line before closure.

- [ ] Agent <name> (<agent-id>) <role> attempt: status: <started|running|interrupted|partial-unvalidated|validated|superseded>; last checkpoint: context loaded; parent action: pending; evidence: package, sprint, and handoff files read; next: first focused probe.
- [ ] Agent <name> (<agent-id>) <role> attempt: status: validated; last checkpoint: package proof refreshed; parent action: revalidated; evidence: commands and results; next: final handoff or successor action.
- [ ] Agent <name> (<agent-id>) <role> recovery: status: superseded; last checkpoint: replaced interrupted or partial-unvalidated attempt; parent action: superseded; evidence: superseding proof; next: continue from clean checkpoint.

## Validation

1. Focused owner-path test:
2. Affected consumer proof:
3. Static guardrails:
4. Representative scenario or blocker probe, if scenario-driven:

## Residual Closure Inventory

- [ ] Owner-path cutovers are complete.
- [ ] Tail consumers are cut over.
- [ ] Diagnostics, admin, harness, and reporting surfaces match the contract.
- [ ] Superseded paths, booleans, or vocabulary are deleted.
- [ ] Required proof layers are complete.

## Commit And Push Ledger

- Focused package commit: `<sha>`
- Pushed to: `<remote>/<branch>`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `<yes>`
