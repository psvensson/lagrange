---
audience: development
documentClass: current
---

# Debugging Lagrange

This guide is the current debugging entrypoint. It points to maintained
diagnostic surfaces and canonical owner state instead of duplicating internal
method names or log-message catalogs.

## Start With The Failing Boundary

1. Reproduce the smallest failing command.
2. Record the first failed boundary: startup, readiness, routing, query
   execution, placement, replication, or resource pressure.
3. Inspect the owner state for that boundary before reading cached projections.
4. Use a focused test or deterministic reproduction before a full distributed
   harness rerun.

The architecture owner maps are in
[Current Owner Maps](architecture/current-owner-maps.md). Distributed-work
diagnostic rules are in
[Operational Ground Truth](docs/steering/operational-ground-truth.md).

## Process Health

The HTTP probe contract is:

- `GET /livez` — process is alive.
- `GET /startupz` — startup has completed.
- `GET /readyz` — the node is eligible to serve.
- `GET /bootstrap/ready` — bootstrap-specific readiness detail.
- `GET /health` — compatibility endpoint only.

Interpretation and Kubernetes wiring are maintained in
[Bootstrap Readiness Probes](docs/bootstrap-readiness-probes.md).

## Runtime Diagnostics

The node-local admin API exposes these maintained diagnostic endpoints:

- `GET /api/admin/diagnostics/services`
- `GET /api/admin/diagnostics/cdc`
- `GET /api/admin/diagnostics/partitions`
- `GET /api/admin/diagnostics/sql`

The node-local admin HTTP/WebSocket listener defaults to port `8081`. For
example:

```bash
curl -sS http://127.0.0.1:8081/api/admin/diagnostics/partitions | jq
curl -sS http://127.0.0.1:8081/api/admin/diagnostics/services | jq
```

See [Admin API Reference](docs/admin-api-reference.md) for the current action
and response contracts. Resource fields and polling guidance are in
[Runtime Resource Diagnostics](docs/runtime-resource-diagnostics.md).

## Canonical State

Use owner rows for decisions and cached projections for observation:

| Question | Canonical state |
| --- | --- |
| Which nodes are members and active? | `nodes` owner rows plus the published-membership projection |
| Who leads a partition? | `partitions.leader_node_id` with the current owner epoch |
| What replica operation is in progress? | `replica_operations` workflow rows |
| Where is a runtime service placed? | `services` rows for `runtime_service` Cells |
| What service should exist? | `service_definitions` desired state |
| Is a node safe to serve or repair? | canonical readiness dimensions and publication state |

`SystemTableCache` is a node-local projection. It is useful for explaining what
a consumer observed, but it does not replace the authoritative owner row when
the two disagree. The same rule applies to retained harness diagnostics.

## Distributed Failure Artifacts

Distributed scenarios write reports under `test-output/reports/` and may emit a
failure bundle with the barrier that actually failed, canonical owner snapshots,
decision traces, and retained observations. Preserve the first failing barrier;
later residuals are supporting evidence, not a replacement verdict.

Use the maintained analyzers for topology failures:

```bash
npm run analyze:topology-convergence -- <report-or-bundle>
npm run analyze:owner-decisions -- <report-or-bundle>
npm run analyze:owner-explain -- <report-or-bundle>
```

The playback UI is documented in
[Distributed Playback Viewer](docs/distributed-playback-viewer.md).

## Focused Verification

Discover repository commands before composing an ad-hoc invocation:

```bash
npm run commands
```

Common focused checks are:

```bash
npm run test:file -- test/path/to/focused.test.js
npm run test:smoke
npm run test:convergence-probes
npm run model:contracts
npm run lint
```

For concurrency, timing, lost-wake, or owner-handoff defects, select the
existing deterministic substrate from
[Deterministic Directed Testing](docs/deterministic-directed-testing-plan.md)
and [Deterministic Repro Tier](docs/deterministic-repro-tier.md).

## Evidence Rules

- Do not infer success from the absence of an error log.
- Do not infer leadership from a local Raft role alone; reconcile it with the
  canonical leader row and epoch.
- Do not treat a timeout as the cause when a typed owner residual identifies a
  deeper blocked transition.
- Do not rely on undocumented object methods or exact log strings as stable
  diagnostic APIs.
- Do not rerun the largest harness until the focused discriminator proves that
  the changed branch engaged.
