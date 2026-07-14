# Service Portability Ladder Tasks

Every row below is one executable concern and therefore one Quest unless noted as
an existing Quest. Product runners write versioned reports under
`test-output/reports/` and must engage the production composition root. Every
source-changing Quest requires exact-patch and aggregate content-bound subagent
verification before Solver checkpoint and handoff.

## Phase 0 — Truth and external application portability

| Order | Quest | Result |
| --- | --- | --- |
| F0 | `service-portability-claims-contract` | Docs/examples name only capabilities that current artifacts prove; legacy JS-envelope WASM claims fail a static guard. |
| F1 | existing `lagrange-devops-onboarding` plus bounded successors | Consume valid image, cluster, and service-visibility slices without assuming external psql success. |
| F2 | `pgwire-authentication-cutover` | External sessions require real credentials; loopback trust remains explicit. |
| F3 | `pgwire-tls-policy-cutover` | One require/prefer/disable policy owner rejects downgrade and invalid-certificate cases. |
| F4 | `dockerized-pg-client-compatibility-example` | Same application image talks to PostgreSQL and Lagrange with configuration-only differences. |

Milestone M1 proves database portability only.

## Phase 1 — Install and control plane

| Order | Quest | Result |
| --- | --- | --- |
| S0 | `service-control-transport-decision` | One authenticated lifecycle mutation transport and security boundary is selected. |
| S1 | `external-service-manifest-contract` | Versioned external schema accepts digest-pinned `oci_container`/`wasm_component` and rejects `native_js`. |
| S2 | `installable-service-artifact-owner` | One OCI/local-layout resolver verifies digest, media type, and configured signature policy. |
| S3 | `service-install-catalog-owner` | Durable desired package/revision/install/rollout/failure state references canonical actual-state tables. |
| S4 | `service-installation-reconciler` | Existing lifecycle machinery converges desired installs with typed failure and recovery. |
| S5a | `service-init-scaffold` | CLI scaffolds an external service project and manifest. |
| S5b | `service-local-oci-layout` | Development build produces the same OCI-compatible layout consumed by installation. |
| S5c | `service-install-lifecycle-cli` | Install/dev-install/list/status/remove use the selected control transport. |

Milestone M2 proves a validated artifact is durably recorded. Unsupported
activation is explicitly `recorded_not_running`.

## Phase 2 — Managed OCI execution and placement

| Order | Quest | Result |
| --- | --- | --- |
| C0 | `oci-runtime-host-contract` | Docker Compose host-agent provider boundary and production binding are sealed; Kubernetes is excluded. |
| C1 | `oci-container-driver-live-activation` | Provider-backed digest pull/create/start/inspect/stop/remove replaces in-memory lifecycle simulation. |
| C2 | `oci-container-health-endpoint-log-recovery` | Real probes, canonical endpoints, logs, kill, and exactly-one replacement work. |
| C3a | `service-replica-identity-contract` | Credential issuance, rotation, revocation, and redaction semantics are sealed. |
| C3b | `oci-service-sql-identity-attribution` | Authenticated server-derived identity produces fresh canonical access evidence. |
| C4a | `oci-activation-evidence-owner` | Image presence and pull/activation evidence have one owner. |
| C4b | `placement-objective-composition` | Existing placement owner composes affinity, activation, load/spread, and movement costs. |
| C4c | `placement-movement-hysteresis` | Movement trigger and stability policy are deterministic. |
| C4d | `placement-composition-directed-proof` | Real-seam deterministic proof is red on revert. |
| C4e | `placement-composition-live-engagement` | Live production decision consumes fresh access and activation evidence. |

Milestone M3 proves the unchanged application image is Lagrange-managed and
produces authentic affinity evidence. It does not prove OCI callbacks.

## Phase 3 — Genuine WASM component

| Order | Quest | Result |
| --- | --- | --- |
| W0 | `wasm-component-abi-runtime-decision` | Pinned engine/toolchain, component classification, WIT ABI, invocation, identity, and result path are sealed. |
| W1 | `wasm-component-binary-execution-cutover` | The production driver validates, compiles, instantiates, and invokes a real component without JS fallback. |
| W2 | `wasm-oci-artifact-activation` | Shared artifact owner installs and activates the component through the catalog/public surface. |
| W3 | `wasm-service-template-dev-loop` | Reproducible template builds, tests, packages, installs, and proves result parity. |

Milestone M4 proves genuine component execution through the same install surface.

## Phase 4 — Evaluator proof

| Order | Quest | Result |
| --- | --- | --- |
| E1 | `service-portability-example-fixture` | Versioned Node/`pg` fixture, data, manifests, compose stages, and exact expected results exist. |
| E2 | `service-portability-example-runner-report` | One command creates isolated artifacts and emits the versioned evidence report. |
| E3 | `service-portability-example-live` | Fresh-clone production-path proof covers parity, security, OCI recovery, attribution, placement, WASM, negatives, teardown, and replay. |
| E4 | successor `movielens-portability-ladder-live` | Advanced dataset reuses terminal MovieLens evidence and the canonical owners. |

Milestone M5 is the complete evaluator journey.

## Quest authoring rules

- A Quest statement names its externally observable result, not a suspected
  mechanism.
- The exact runner, pathscope, negative attacks, and red-on-revert engagement
  proof are declared before the first attempt.
- One Quest may not silently absorb a later table row.
- Activation-cost Quests cannot begin before C1 is terminal.
- F4 cannot close before authentication and TLS are terminal.
- W1 cannot close on core magic bytes alone; the chosen component classification
  and public invocation must be measured.
- E3 is the only whole-program terminal. Earlier milestones make narrower claims.

