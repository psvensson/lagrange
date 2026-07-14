# OCI Runtime Host Contract

## Decision status

The first production OCI runtime provider is a bounded Docker Compose host
agent. This decision is `selected_not_implemented`: it seals the provider,
security, ownership, and production-construction boundaries for C1 and C2, but
does not claim that current source starts a real container.

The current `OciContainerDriver` remains a gated in-memory lifecycle scaffold,
and `docs/service-portability-capabilities.json` remains authoritative with
`realContainerActivation: false` until C1 supplies live production evidence.

## Provider topology

Each Docker Engine host runs exactly one `docker_compose_host_agent`. Only that
agent receives the Docker Engine socket. Lagrange node containers and managed
service containers receive neither the Engine socket nor a raw Engine API.

The Compose deployment provides two separate boundaries:

1. a private control-socket volume shared only by the host agent and the
   Lagrange node containers on that host; and
2. a workload network selected by agent boot configuration and used by managed
   service containers.

The agent control socket is not published as a host TCP port and is not mounted
into managed workloads. The workload network does not expose the control
socket. One node process selects one provider; provider auto-detection,
multi-provider fan-out, and sequential provider fallback are forbidden.

## Authenticated control transport

The version-1 control transport is a framed request/response protocol over a
Unix-domain socket at `/run/lagrange/oci-host-agent/v1.sock`. Each frame is a
four-byte big-endian byte length followed by UTF-8 JSON serialized with RFC 8785
JSON Canonicalization Scheme rules. Compose mounts a distinct per-node
HMAC-SHA256 key into the node and agent as a read-only secret. The key value is
never carried in the request, environment, result, log, or diagnostic.

Every request contains exactly this canonical envelope. Envelope identity
strings are NFC-normalized ASCII matching `[A-Za-z0-9._:-]` and the byte bounds
below, so they compare byte-for-byte and can be used as Docker label values
without a second normalization step:

| Field | Contract |
| --- | --- |
| `protocolVersion` | Exact integer `1` |
| `requestId` | Canonical lowercase ASCII UUID, unique transport correlation identifier |
| `operationId` | Owner-derived identifier matching `[A-Za-z0-9._:-]{1,128}`, stable for one durable operation and resource identity |
| `keyId` | Public ASCII key identifier matching `[A-Za-z0-9._-]{1,128}` |
| `issuedAtMs` | Non-negative JSON safe integer inside the replay window |
| `deadlineAtMs` | Non-negative JSON safe integer greater than `issuedAtMs` and within the operation maximum |
| `nonce` | Base64 encoding of exactly 32 random bytes, unique within the caller key and replay window |
| `clusterIncarnation` | Canonical owner-issued identity matching `[A-Za-z0-9._:-]{1,255}` |
| `nodeId` | Canonical authenticated caller identity matching `[A-Za-z0-9._:-]{1,255}` |
| `serviceId` | Canonical service identity matching `[A-Za-z0-9._:-]{1,255}` |
| `revisionId` | Immutable installed revision identity matching `[A-Za-z0-9._:-]{1,255}` |
| `instanceId` | Canonical replica identity matching `[A-Za-z0-9._:-]{1,255}` |
| `operation` | One closed operation name |
| `payload` | Operation-specific normalized object |

The request frame has exactly two top-level fields: `envelope` and
`authentication`. `authentication` contains exactly
`algorithm: "hmac-sha256"` and `signature`, whose canonical padded RFC 4648
base64 form decodes to exactly 32 bytes. The signature input is the ASCII domain separator
`lagrange-oci-host-agent-request-v1`, a newline byte, and the RFC 8785 canonical
bytes of `envelope`. The four-byte frame length and `authentication.signature`
are not part of the signature input.

The agent maps `keyId` to the envelope's cluster and node identity, uses
constant-time signature comparison, accepts at most 30 seconds of clock skew,
and rejects replayed `(keyId, nonce)` pairs for a five-minute replay window.
Under one exclusive replay-journal transaction, it checks the key latch, nonce
absence, and capacity, then atomically appends and fsyncs either the nonce/expiry
or a permanent `replay_saturated` latch in reserved metadata before operation
admission or response. Concurrent frames cannot over-admit. The journal survives
restart, prunes only fully expired rows, and holds at most 4,096 live nonces
globally and 256 per key. The listener admits at most 128 sockets with a
two-second frame-read deadline. A saturated key never dispatches again; recovery
uses a distinct key id/secret and retains the old revocation beyond replay and
operation deadlines. Latch fsync failure quarantines the agent.

The response uses the same framing and exact top-level/authentication fields.
Its envelope contains
exactly `protocolVersion`, `requestId`, `operationId`, `keyId`, `agentId`,
`completedAtMs`, and `result`. The response signature uses the ASCII domain
separator `lagrange-oci-host-agent-response-v1`, a newline byte, and the RFC
8785 canonical response-envelope bytes. The node verifies the response
signature, version, key, request identity, operation identity, expected agent,
and deadline before accepting `result`; `agentId` must match
`[A-Za-z0-9._:-]{1,128}`. A mismatched, unsigned, malformed, or late response is
an `ambiguous` transport outcome, never success. Request frames are limited to
64 KiB and response frames to 512 KiB; each peer validates the four-byte length
before allocating or reading a body.

Authentication failures, protocol errors, and diagnostics use only stable error
codes and public identity fields. They never include key material, signatures,
raw Docker errors, registry credentials, or environment values.

## Closed operation surface

The host agent is an allowlisted runtime service, not a Docker API proxy.

| Milestone | Operations | Owner-visible result |
| --- | --- | --- |
| C1 | `pull`, `create`, `start`, `inspect`, `stop`, `remove` | Exact image/container identity and typed lifecycle state |
| C2 | `probe`, `logs` | Bounded probe result or bounded log chunk through the same authenticated envelope |

C1 uses five-minute maximum deadlines for `pull` and 30-second maximum
deadlines for the other C1 operations. Both C2 operations have a ten-second
maximum deadline. Each non-following `logs` response carries at most 256 KiB of
decoded log bytes; base64 and envelope overhead must remain within the 512 KiB
response-frame cap. The agent may apply a shorter boot-configured limit. A
caller may not lengthen any bound.

The operation payload grammar is recursively closed. All strings are Unicode
scalar sequences without NUL or control characters, byte limits are measured
after UTF-8 encoding, JSON numbers are safe integers, duplicate object keys and
duplicate set-like array entries are rejected, and an omitted optional value is
not represented as `null`. Unknown fields at any nesting depth are rejected.

| Operation | Payload fields |
| --- | --- |
| `pull` | `artifactRef`, `expectedDigest`, optional `registryCredentialId` |
| `create` | `imageDigest`, `runtimeConfigDigest`, and optional normalized `entrypoint`, `args`, `environment`, `ports`, and `resources` |
| `start` | Empty object |
| `inspect` | Empty object |
| `stop` | Optional `graceMs`, capped by the operation deadline |
| `remove` | Empty object; a running target is rejected until `stop` settles |
| `probe` | C2-owned normalized `probeKind`, `target`, and `timeoutMs` |
| `logs` | C2-owned `stream`, `sinceCursor`, and `maxBytes` |

The nested types and cardinalities are fixed:

- `artifactRef` is a canonical registry repository reference containing an
  `@sha256:<64 lowercase hexadecimal>` digest and is at most 2,048 bytes;
  filesystem, `file:`, daemon, and tag-only references are rejected.
  `expectedDigest`, `imageDigest`, and `runtimeConfigDigest` are exactly
  `sha256:<64 lowercase hexadecimal>`. The digest embedded in `artifactRef`
  must equal `expectedDigest`.
- `registryCredentialId` and every agent-owned secret reference match
  `[A-Za-z0-9._-]{1,128}`. Registry credentials remain agent-owned and never
  appear as values in a request.
- `entrypoint` is an array of 1-32 non-empty strings, each at most 4,096 bytes.
  `args` is an array of 0-128 strings, each at most 4,096 bytes.
- `environment` is an exact object with optional `values` and `secretRefs`
  objects. Each maps a key matching `[A-Za-z_][A-Za-z0-9_]{0,127}` to,
  respectively, a non-secret string of at most 8,192 bytes or a secret
  reference. There are at most 128 entries in total and at most 32 secret
  references; a key may occur in only one object.
- `ports` is an array of at most 32 exact objects containing only `protocol`
  (`tcp` or `udp`) and `containerPort` (1-65,535). Host ports, host IPs, and
  published-port selection are not request fields.
- `resources` is an exact object with one or both of `cpuMillis` (1-1,000,000)
  and `memoryBytes` (1,048,576-1,099,511,627,776). Both are also capped by the
  smaller agent-boot policy. An empty resources object is rejected.
- `graceMs` is an integer from 0 through 30,000 and may not exceed the request's
  remaining deadline.
- `probeKind` is `tcp` or `http`; executable probes are not supported.
  `timeoutMs` is 1-10,000. A TCP `target` contains exactly `containerPort`. An
  HTTP `target` contains exactly `containerPort`, `scheme: "http"`, `path`,
  `expectedStatusMin`, and `expectedStatusMax`; `path` starts with `/`, is at
  most 2,048 bytes, contains no authority or fragment, and the ordered status
  bounds are integers from 100 through 599. Hostnames, IP addresses, URLs,
  headers, request bodies, TLS material, and redirects are not accepted.
- `stream` is `stdout`, `stderr`, or `both`; `sinceCursor` is an optional opaque
  agent-issued base64url token of 1-256 ASCII bytes; and `maxBytes` is an integer
  from 1 through 262,144. The cursor carries no caller-selected Engine flags.

`create` cannot carry raw Docker `HostConfig`, arbitrary labels, network
selection, bind mounts, devices, Docker sockets, privileged mode, host
networking, PID/IPC namespace selection, capability additions, arbitrary Engine
endpoints, or build/exec/plugin/swarm commands. Agent boot configuration owns
the workload network, allowed environment names, port policy, and resource
ceilings. Requests can narrow those limits but cannot widen them.

The agent returns exactly one typed result variant:

- `completed` with the operation identity and operation-specific authoritative
  observation (full labels are required only for `kind: "container"`);
- `already_applied` with the same authoritative observation;
- `already_absent` for a fully identified missing stop/remove target;
- `rejected` with a stable non-retryable error code;
- `retryable_failure` with a stable error code and cleanup observation; or
- `ambiguous` when delivery or Engine completion cannot be proved.

The v1 result is a recursively exact discriminated union; it never uses `null`
to encode applicability. Every variant has `status`, `operation`,
`intentDigest` in the exact SHA-256 digest grammar above, `cleanup`, and an exact
`identity` object containing only the five identity fields. `cleanup` is exact
with `state` (`not_required`, `completed`, `retryable`, or `ambiguous`) and
`residualResources`, an array of at most one exact `{containerId, labels}` where
`labels` has the stable-label shape below. `not_required` and `completed`
require an empty array; `retryable` or `ambiguous` names every observed unwanted
partial resource. Unknown fields are rejected.

- `completed` and `already_applied` add exactly `observation`.
  `already_absent` is restricted to `stop`/`remove` and adds exactly
  `observation: {kind: "absence", state: "absent"}`.
- `rejected` adds exactly `errorCode`, chosen from `invalid_request`,
  `deadline_invalid`, `unsupported_operation`, `policy_denied`,
  `credential_unavailable`, `digest_mismatch`, `identity_conflict`,
  `intent_conflict`, `resource_conflict`, or `receipt_capacity_exhausted`.
- `retryable_failure` adds exactly `errorCode` and `lastObservation`. Its codes
  are `agent_busy`, `operation_in_progress`, `deadline_before_dispatch`,
  `queue_deadline_expired`, `engine_unavailable`, `engine_failure`, or
  `cleanup_incomplete`.
- `ambiguous` adds exactly `errorCode`, `lastObservation`, and `fenceState`.
  Its codes are `deadline_after_dispatch`, `transport_outcome_unknown`,
  `engine_outcome_unknown`, `receipt_unavailable`, or `resource_fenced`;
  `fenceState` is `none` or `mutation_unresolved`.

`observation` and `lastObservation` have exactly one of these shapes:
`{kind: "not_observed"}`; `{kind: "image", imageDigest}`;
`{kind: "container", containerId, state, labels, imageDigest,
runtimeConfigDigest}`; `{kind: "absence", state: "absent"}`;
`{kind: "tcp_probe", outcome}`; `{kind: "http_probe_response", statusCode,
healthy}`; `{kind: "http_probe_failure", outcome}`; or `{kind: "log_chunk",
stream, dataBase64, nextCursor, truncated}`. Container state is `created`,
`running`, or `exited`; TCP outcome is `connected`, `refused`, or `timeout`;
HTTP failure is `connection_error` or `timeout`. Container ids are 64 lowercase
hexadecimal, `statusCode` is integer 100-599, `healthy`/`truncated` are JSON
booleans, and `dataBase64` is canonical padded RFC-4648 base64 bounded after
decode by `maxBytes`; labels/cursors/digests/stream retain the exact rules above.
Unexpected Engine errors collapse to listed codes; raw messages never cross.
The operation mapping is exact: `pull` uses image; `create` container/created;
`start` container/running; `inspect` any container state; `stop`
container/exited or already-absent; `remove` absence; `probe` its requested
probe kind; and `logs` log-chunk observation.

A transport acknowledgement is never an operation result. The driver and
lifecycle owner do not infer success from disconnect, timeout, late response,
or resource-name presence.

The agent rejects a request before dispatch when `deadlineAtMs` is expired or
exceeds the operation maximum. Once dispatched, it uses only the remaining
budget. Deadline expiry after dispatch produces and durably records
`ambiguous`; it does not
convert an Engine acknowledgement into success. An Engine call may finish after
the caller deadline, in which case the agent records the later authoritative
observation but sends no late success. A later owner re-drive with the same
`operationId` and a new request envelope may read that receipt. The client has
no autonomous retry loop.

`endpoints`, named-instance kill orchestration, exactly-one replacement, and
restart recovery are C2 owner-level outcomes, not additional host-agent
operation names. C2 composes them from `inspect`, `stop`, `remove`, `probe`, and
`logs` through the existing lifecycle, endpoint, and placement owners.

## Artifact input

The artifact owner remains the sole digest, media-type, and signature-policy
authority. C1 consumes an immutable remote OCI reference and verified digest
derived from that owner's result. After `pull`, the agent inspects the local
image and returns its immutable digest; the driver rejects any mismatch before
`create`.

The first provider does not accept a CLI-supplied or node-local filesystem path.
A `local_oci_layout` must be published to an OCI registry reachable by the host
agent before real activation. A future content-addressed layout import protocol
requires its own bounded decision and cannot be smuggled into `create`.

Registry credentials, if configured for C1, are agent-owned secrets referenced
by a closed credential identifier. They are not manifest fields or request
payload bytes.

## Resource identity and ownership

The agent writes these immutable labels when it creates a managed container and
requires exact matches on every later observation or mutation:

- `io.lagrange.managed=true`
- `io.lagrange.cluster_incarnation`
- `io.lagrange.node_id`
- `io.lagrange.service_id`
- `io.lagrange.revision_id`
- `io.lagrange.instance_id`
- `io.lagrange.image_digest`
- `io.lagrange.runtime_config_digest`
- `io.lagrange.create_operation_id`
- `io.lagrange.create_intent_digest`

The caller cannot add, replace, or omit them. Destructive and observational
operations resolve the complete cluster/node/service/revision/instance tuple
and reject unmanaged, partially labelled, mismatched, or ambiguous resources.
Container names and Docker object existence are indexes, not authority. The
create-specific provenance labels remain stable across `start`, `inspect`,
`stop`, `probe`, `logs`, and `remove`; those later operations use their own
durable operation receipts and never compare a later intent digest with the
create intent label.

The provider and agent own engine-specific translation only. They do not write
catalog, rollout, operation-journal, `services`, `service_endpoints`, placement,
or artifact-verification state. The existing lifecycle and metadata owners
consume typed provider observations and decide those transitions.

## Production construction and owner route

The only selected production route is:

```text
installed revision selected by catalog/reconciliation owners
  -> existing node-local service lifecycle owner
  -> RuntimeServiceAdapter
  -> ServiceRuntimeLifecycle
  -> RuntimeDriverRegistry
  -> OciContainerDriver
  -> one Docker Compose host-agent provider
  -> authenticated bounded host agent
  -> Docker Engine
```

The construction locus is equally closed:

```text
src/index.js
  -> seed or join startup options
  -> createRuntimeStartupWiring
  -> provider-injected OciContainerDriver
```

Both seed and join paths must retain the same provider object. A demo runner,
test harness, CLI, SQL handler, installation reconciler, buildx exporter, or
directly constructed driver cannot become the production binding. The test-only
distributed-harness Docker provider is not a runtime provider and production
code must not import it.

Missing, malformed, unavailable, unauthenticated, or unsupported provider
configuration fails closed with a typed result. It never re-enters the current
in-memory simulation or another provider.

## Idempotency, cleanup, and restart posture

The lifecycle owner derives `operationId` from the durable operation and full
resource identity. The agent derives `intentDigest` as SHA-256 over the RFC 8785
canonical bytes of `{operation, identity, payload}`.

Every authenticated request first enters a synchronous admission table keyed by
the complete cluster/node/service/revision/instance resource identity. Admission
occurs before operation-related ledger or Engine I/O. A concurrent request with
the same `(clusterIncarnation, operationId, intentDigest)` never becomes a
waiter: it receives the current terminal receipt or an immediate
`operation_in_progress`/`retryable_failure`. Reuse with different intent,
operation, or identity is rejected. A different operation for the resource
enters a FIFO queue without touching the Engine. Queue expiry returns
`queue_deadline_expired`/`retryable_failure`, proving non-dispatch and permitting
a new envelope under the owner's existing operation budget.

Boot policy may lower but not exceed 32 dispatched requests, 64 queued requests
globally, 16 queued requests per authenticated node, or eight queued requests
per resource. An excess request is not queued or receipted and returns
`agent_busy`/`retryable_failure`. Different resources proceed concurrently only
within those bounds. The resource gate is held until the final receipt is
durable or a durable unresolved-mutation fence has taken over exclusion.

The agent process holds an exclusive lock on its private receipt volume, so a
second agent instance cannot dispatch against the same Engine/ledger pair.
Inside the held resource gate, a durable ledger transaction atomically creates
the `(clusterIncarnation, operationId)` receipt if absent or compares the
existing row. The initial row contains the `intentDigest`, operation, complete
identity, and state `accepted`; its checksummed generation and directory entry
are fsynced before the first Engine mutation. Every later typed result and
cleanup observation is appended, checksummed, and fsynced before the signed
response is emitted. This ledger is an idempotency and transport-evidence owner,
not desired state or the cluster operation journal. A receipt never authorizes
lifecycle work by itself.

For `pull`, `create`, `start`, `stop`, or `remove`, the exact sequence under the
held gate is: atomically compare `accepted`, advance it to
`mutation_unresolved`, install and fsync a resource-head fence with the identity,
operation, intent, and new generation; await authoritative Engine inspect/list;
synchronously validate that result, held fence token, and a fresh clock reading
strictly before `deadlineAtMs`; then invoke without an intervening await. Every
non-dispatch branch atomically fsyncs a terminal receipt and fence removal:
inspect failure or expired deadline is the matching `retryable_failure`;
identity, label, object-count, config, or digest conflict is `rejected`; matching
desired state is `already_applied`; and authoritative stop/remove absence is
`already_absent`. Only the exact mutation-required branch invokes the Engine.

After the mutation await, the agent reloads the receipt, requires the same
`mutation_unresolved` generation, re-inspects full identity, and synchronously
classifies both snapshots while the gate and exclusive ledger lock pin the
generation. It then atomically fsyncs the terminal receipt and fence removal.
Mismatch yields `engine_outcome_unknown`/`ambiguous` with the fence retained.
Name lookup, stale pre-fence state, or partial labels cannot pass. `inspect`,
`probe`, and `logs` never install or clear a mutation fence.

Deadline expiry after dispatch returns `deadline_after_dispatch`/`ambiguous`;
the fence remains and the live agent holds the gate until the exact call settles.
Restart rebuilds every unresolved fence before accepting requests. A restarted
agent may return observations for the same operation and intent, but no runtime
request, time, name, presence, or absence can clear or redispatch it. The old
incarnation remains quarantined until owner-authorized host retirement stops the complete
Engine/runtime/helper stack and removes its resources; the fence is archived,
never cleared or reused. A new incarnation requires new enrollment. This is
explicit fail-closed unavailability, not an operation-success claim.

Receipts remain for the lifetime of their cluster incarnation. Agent boot
configuration sets a fixed maximum receipt count; reaching it rejects new
operations with `receipt_capacity_exhausted` and never evicts an unexpired nonce
or an incarnation receipt. Incarnation teardown may archive and remove the
corresponding ledger only after no fully labelled resources remain.

Repeating the same operation and intent returns the fsynced terminal result. An
`accepted` or same-process pre-dispatch receipt is reconciled only under the
gate and exact branch table; it may produce `already_applied`, `already_absent`,
or `ambiguous`, never success from delivery evidence alone. Operations check the
stable identity and create-provenance labels. Pulls have no mutable image labels
and therefore cross-check the receipt with an authoritative inspected digest.

Resource absence is not completion evidence. `already_absent` is available only
for `stop` and `remove`, only while the same live gate proves no Engine mutation
was invoked and an authoritative listing proves no full-identity object exists.
Absence never proves any other operation succeeded. If listing or receipt state
is unavailable, stale, or inconsistent, the result is `ambiguous`.

Partial create/start names every owned resource and its exact cleanup state.
Cleanup is bounded and re-driven through the owner route, never node exit or
scenario teardown.

Fresh creation is a one-shot host transition completed before the agent accepts
runtime work. Authority is a root-only append log outside the receipt volume,
anchored by a TPM 2.0 NV monotonic counter and never mounted into nodes or
workloads. Each exact RFC-8785 record contains version 1, host/incarnation ids,
256-bit lowercase-hex Engine-data-root, ledger-root, and enrollment ids,
`predecessorCounter`, current `tpmCounter`, and state `authorized`,
`initializing`, `consumed`, or `retired`; only `consumed` adds `headerDigest`.

Every append first increments the TPM counter and must equal the log tail plus
one; agent boot requires TPM and tail equality, so file/volume rollback or TPM
reset fails closed. Under a host lock, a socketless initializer appends
`authorized -> initializing`, fsyncs the empty ledger, then appends `consumed`.
It resumes `initializing` only at the same TPM tail and exact empty-header digest.

A first `authorized` record requires `predecessorCounter: 0`, TPM/log genesis,
and a newly provisioned empty Engine data root.
A replacement `authorized` record requires `predecessorCounter` to name a
durable `retired` tail written only after the complete prior Engine, runtime,
shim/helper stack is stopped, its resources are removed, and its data root is
discarded. Replacement binds a distinct newly provisioned empty Engine data
root, incarnation, ledger root, and enrollment id; the old root is never
reattached. This is host replacement, never service cleanup or success. The
agent starts only when TPM/log tail, consumed record, configured Engine-root id,
and local header all match. Absence is never fresh authority.

Agent restart holds the exclusive volume lock and blocks request dispatch until
the nonce journal, receipt-generation manifest, checksummed record chain, and
incarnation index match the configured ledger-root id. A healthy intact ledger
with no row for an operation permits the atomic first-admission transaction. A
missing volume, unreadable record, root mismatch, checksum mismatch, truncated
generation, sequence gap, or missing incarnation index makes receipt evidence
unavailable: the agent quarantines that incarnation, returns
`receipt_unavailable`/`ambiguous`, and does not rebuild evidence from resources.

Only after successful ledger recovery may the agent rediscover fully labelled
resources and cross-check them against receipts. It performs no blind global
garbage collection and does not infer desired state. An orphan label or resource
absence cannot authorize an operation. Authoritative lifecycle reconciliation
decides, through a new durable owner operation, whether a discovered resource is
adopted, stopped, or removed. Image garbage collection and image-presence
accounting are separate downstream concerns.

## Reused, extended, and new

- **REUSED:** installed-service catalog/reconciler, node lifecycle, runtime adapter/lifecycle/registry, artifact verifier, instance owner, and endpoint owner.
- **EXTENDED IN C1/C2:** the OCI driver consumes one provider; seed/join inject it; reconciliation consumes observations without surrendering authority.
- **NEW IN C1:** authenticated client, bounded agent, enrollment/receipt substrate, Compose topology, and Engine translation.

## Rejected alternatives

- Mounting `/var/run/docker.sock` into a Lagrange node or managed workload.
- Calling Docker or importing the distributed-harness provider from runtime source.
- Treating the buildx OCI-layout exporter as an activation provider.
- A raw Docker API proxy, arbitrary command execution, or caller-supplied `HostConfig`.
- Provider auto-detection, fallback, or parallel Docker/Kubernetes paths.
- Direct agent calls from SQL, CLI, the installation reconciler, or a demo.
- Trusting a local layout path supplied by the CLI.
- Inferring success from acknowledgement, disconnect, timeout, name, or object existence.

## Downstream proof obligations

C1 must remove the mutable OCI feature gate and `_prepared`/`_running`
simulation, implement the selected client/agent/Compose path, bind the same
provider through shipped seed and join composition, and prove a normal installed
remote digest reaches `pull/create/start/inspect/stop/remove` through the owner
route. Reverting the production binding, authentication, digest comparison, or
label enforcement must turn the proof red. OCI callback invocation remains
unsupported and is not a fallback.

C1 also owns agent-ledger boot integrity and unresolved-fence survival. C2
extends the envelope with real probes and bounded logs, publishes canonical
endpoints through their owner, and proves kill plus exactly one replacement and
managed-instance/node restart recovery without persistent over-replication. C2
does not weaken C1 receipt recovery or auto-clear an unresolved Engine mutation.

Kubernetes, containerd, CRI, controller authority, Kubernetes networking, and
Kubernetes privilege configuration are unsupported. They require an independent
provider Quest with its own production engagement proof.
