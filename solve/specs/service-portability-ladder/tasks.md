# Service Portability Ladder Tasks

## Deployment ladder mapping

The program serves the three-rung deployment goal (requirements "Program
result"):

| Rung | Developer story | Phases |
| --- | --- | --- |
| 1 | Unchanged pg-talking app in an OCI container, managed and placed near its data | 0, 1, 2 |
| 2 | Native OCI Call Cells: same program/runtime, data-local functions with native libraries | 5 |
| 3 | Genuine WASM component through the same install/call surface | 3 |

Phase 4 (base evaluator proof) spans rungs 1 and 3. Rung 2 receives its own live
terminal after real managed OCI activation exists; it must not widen E3 silently
(see requirements R8 and `architecture/native-oci-call-cells.md`).

Every row below is one executable concern and therefore one Quest unless noted as
an existing Quest. Product runners write versioned reports under
`test-output/reports/` and must engage the production composition root. Every
source-changing Quest requires exact-patch and aggregate content-bound subagent
verification before Solver checkpoint and handoff.

## Phase 0 - Truth and external application portability

| Order | Quest | Result |
| --- | --- | --- |
| F0 | `service-portability-claims-contract` | Docs/examples name only capabilities that current artifacts prove; legacy JS-envelope WASM claims fail a static guard. |
| F1 | existing `lagrange-devops-onboarding` plus bounded successors | Consume valid image, cluster, and service-visibility slices without assuming external psql success. |
| F2 | `pgwire-authentication-cutover` | External sessions require real credentials; loopback trust remains explicit. |
| F3 | `pgwire-tls-policy-cutover` | One require/prefer/disable policy owner rejects downgrade and invalid-certificate cases. |
| F4 | `dockerized-pg-client-compatibility-example` | Same application image talks to PostgreSQL and Lagrange with configuration-only differences. |

Milestone M1 proves database portability only.

## Phase 1 - Install and control plane

| Order | Quest | Result |
| --- | --- | --- |
| S0 | `service-control-transport-decision` | First-class lifecycle SQL over authenticated PG wire is the selected ingress; the CLI is a client and the admin WebSocket remains a local compatibility adapter. |
| S1 | `external-service-manifest-contract` | Versioned external schema accepts digest-pinned `oci_container`/`wasm_component` and rejects `native_js`. |
| S2 | `installable-service-artifact-owner` | One OCI/local-layout resolver verifies digest, media type, and configured signature policy. |
| S3 | `service-install-catalog-owner` | Durable desired package/revision/install/rollout/failure state references canonical actual-state tables. |
| S3b | `service-lifecycle-sql-control-surface` | Authenticated, action-authorized lifecycle SQL submits intent to the catalog owner and returns typed operation outcomes. |
| S4 | `service-installation-reconciler` | Existing lifecycle machinery converges desired installs with typed failure and recovery. |
| S5a | `service-init-scaffold` | CLI scaffolds an external service project and manifest. |
| S5b | `service-local-oci-layout` | Development build produces the same OCI-compatible layout consumed by installation. |
| S5c | `service-install-lifecycle-cli` | Install/dev-install/list/status/remove use the selected control transport. |

Milestone M2 proves a validated artifact is durably recorded. Unsupported
activation is explicitly `recorded_not_running`.

## Phase 2 - Managed OCI execution and placement

| Order | Quest | Result |
| --- | --- | --- |
| C0 | `oci-runtime-host-contract` | Docker Compose host-agent provider boundary and production binding are sealed; Kubernetes is excluded. |
| C1 | `oci-container-driver-live-activation` | Provider-backed digest pull/create/start/inspect/stop/remove replaces in-memory lifecycle simulation. |
| C2 | `oci-container-health-endpoint-log-recovery` | Real probes, canonical endpoints, logs, provider kill, and exactly-one replacement work; generic Cell request continuity is consumed from its sibling terminal, not re-owned here. |
| C3a | `service-replica-identity-contract` | Credential issuance, rotation, revocation, and redaction semantics are sealed. |
| C3b | `oci-service-sql-identity-attribution` | Authenticated server-derived identity produces fresh canonical access evidence. |
| C4a | `oci-activation-evidence-owner` | Image presence and pull/activation evidence have one owner. |
| C4b | `placement-objective-composition` | Existing placement owner composes affinity, activation, load/spread, and movement costs. |
| C4c | `placement-movement-hysteresis` | Movement trigger and stability policy are deterministic. |
| C4d | `placement-composition-directed-proof` | Real-seam deterministic proof is red on revert. |
| C4e | `placement-composition-live-engagement` | Live production decision consumes fresh access and activation evidence. |

Milestone M3 proves the unchanged application image is Lagrange-managed and
produces authentic affinity evidence. It does not prove native OCI Call Cell
invocation.

## Phase 3 - Genuine WASM component

| Order | Quest | Result |
| --- | --- | --- |
| W0 | `wasm-component-abi-runtime-decision` | Pinned engine/toolchain, component classification, WIT ABI, invocation, identity, and result path are sealed. |
| W1 | `wasm-component-binary-execution-cutover` | The production driver validates, compiles, instantiates, and invokes a real component without JS fallback. |
| W2 | `wasm-oci-artifact-activation` | Shared artifact owner installs and activates the component through the catalog/public surface. |
| W3 | `wasm-service-template-dev-loop` | Reproducible template builds, tests, packages, installs, and proves result parity. |

Milestone M4 proves genuine component execution through the same install surface.

## Phase 4 - Base evaluator proof

| Order | Quest | Result |
| --- | --- | --- |
| E1 | `service-portability-example-fixture` | Versioned Node/`pg` fixture, data, manifests, compose stages, and exact expected results exist. |
| E2 | `service-portability-example-runner-report` | One command creates isolated artifacts and emits the versioned evidence report. |
| E3 | `service-portability-example-live` | Fresh-clone production-path proof covers parity, security, provider-specific OCI recovery, consumed generic Cell continuity, attribution, placement, WASM, negatives, teardown, and replay. |
| E4 | successor `movielens-portability-ladder-live` | Advanced dataset reuses terminal MovieLens evidence and the canonical owners. |

Milestone M5 is the complete base evaluator journey for rungs 1 and 3.

## Phase 5 - Rung 2: native OCI Call Cells

Phase 5 is downstream of real OCI activation (C1/C2) and the existing public
Call Cell path. Its canonical architecture is
[`architecture/native-oci-call-cells.md`](../../../architecture/native-oci-call-cells.md).
No row may add an OCI-specific scheduler, partition router, reduce path, durable
callback registry, or fallback from failed WASM execution.

| Order | Quest | Result |
| --- | --- | --- |
| K0 | `native-oci-call-cell-invocation-contract` | Seal the application-initiated process registration/invocation topology, exact manifest-export match, authenticated replica/revision identity, bounded envelopes, `ctx` projection, typed ambiguous outcomes, and the selected multi-language transport. The proof must show transport has no placement or retry authority. |
| K1 | `oci-container-driver-call-cell-invoke` | `OciContainerDriver.invoke()` reaches one exact ready managed replica through the node-local broker from `ServiceRuntimeLifecycle.invoke()`; lifecycle host agent remains pull/create/start/inspect/stop/remove only. Driver/broker direct tests are necessary but not product acceptance. |
| K2 | `native-call-cell-code-first-sdk` | One language SDK lets source call a local operation descriptor while packaging derives the existing Artifact, call Binding, export/interface identity, and outbound-call policy. The managed process registers the export; invocation carries no source/closure/module path. |
| K3 | `native-call-cell-data-local-multinode` | A real `CALL BINDING`/SDK call fans out across partitions on different nodes, each destination revalidates its partition fence, reads its local replica, invokes the same pinned OCI revision, emits through existing coordination, and completes through the ordinary reduce lease/result path. |
| K4 | `native-call-cell-native-library-recovery` | The fixture uses a genuine native dependency unavailable on the current WASM path, kills a named worker during execution, proves typed ambiguous/retry behavior and exact revision identity after replacement, and demonstrates that arbitrary external side effects are not claimed exactly-once. |
| K5 | `native-call-cell-second-language-conformance` | A second materially different language/runtime consumes the same broker and Call Cell context semantics with no language-specific routing or lifecycle fork. |
| K6 | `native-call-cell-evaluator-live` | Fresh-clone production-path terminal proves the rung-2 journey end to end, including native dependency, cross-node locality, nested call/emit, failure/replacement, negative identity/export cases, teardown, and replay semantics. |

Milestone M6 proves a customer can keep an ordinary language/runtime and native
libraries while moving selected functions to the data through the same
Artifact / Binding / Cell system as WASM.

## Phase 5 acceptance details

K0 must decide the wire transport only after measuring the SDK runtimes intended
for K2 and K5. Candidate transport technologies are implementation choices, not
new product surfaces. The selected protocol must support an application-initiated
long-lived channel so a managed container needs no public callback listener.

K2's source-level function reference is an authoring descriptor only. Its live
proof must inspect the generated manifest and Binding and then show that the
runtime invocation names those immutable identities rather than serialized
function bytes.

K3 must traverse this exact owner route:

```text
CALL BINDING or compiled SDK operation handle
  -> CallCellInvoker
  -> existing host/activation decision
  -> RuntimeServiceHandler Call Cell admission
  -> local partition read / bounded batch
  -> ServiceRuntimeLifecycle.invoke
  -> OciContainerDriver.invoke
  -> node-local native invocation broker
  -> exact managed process/revision/export
```

Reverting host restriction, partition-fence validation, manifest-export match,
or the `ServiceRuntimeLifecycle.invoke()` provider boundary must turn the proof
red. A harness that invokes the driver or broker directly cannot close K3/K6.

K4 records the stable invocation id before killing the worker. The replacement
may execute the callback again; acceptance distinguishes exactly-once-visible
Lagrange result publication from at-least-once risk for arbitrary external
side effects.

K5 is deliberately later than the first native-library proof. It verifies that
the broker/context contract is language-neutral after the semantics are stable,
rather than forcing two SDK implementations to discover the protocol together.

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
- E3 is the base-program terminal for rungs 1 and 3. Native OCI Call Cells
  terminate at K6, never by silently widening E3.
- K0 cannot start implementation before C1 has a real provider-backed managed
  container; K1 and later cannot close on the current in-memory OCI lifecycle
  scaffold.
- K1 may extend only the runtime-provider edge. Any proposed OCI-specific
  planner, route resolver, call table, retry owner, or reduce path is a design
  failure and must return to K0.
- K2 must preserve Binding as durable execution intent; an SDK that sends an
  arbitrary function/module path at runtime fails the architecture contract.
- K3/K6 must use the production Call Cell owner route and inspect destination
  partition locality; same-node or direct-broker-only tests are insufficient.
- K4 must include one real native dependency, not a pure-language echo fixture.
- K5 cannot introduce semantics unavailable to the first SDK; it is a
  conformance proof, not a second feature design.
