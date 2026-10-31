---
audience: development
documentClass: planning
---

# Requirements: Hono and the standard HTTP service API

## 1. Decision, release allocation and authority

This specification is the detailed contract of the
[standard HTTP service epic](../../epics/standard-http-service-api.md). It applies
Peter's 31 October 2026 Hono decision to the released
[v0.4.0 source](https://github.com/psvensson/lagrange/tree/07206ba1c8bb396f4eb097a753915bb34580d824).
The release was published at 2026-10-31 14:16:56 UTC. Source observations below
are not new runtime measurements or evidence of milestone acceptance.

| Version | Initial completion | Authority retained |
| --- | --- | --- |
| 0.4.1 | Bounded correctness and truthful-claim repairs: complete reduction or explicit refusal, early byte budgets, and source/proof/publication reconciliation | Existing call, capability, comparison and release owners |
| 0.5 | Hono/Fetch service entry, request-scoped client, coherent distributed service envelope and the complete public journey; unfinished 0.4 acceptance is explicitly carried forward | This spec owns HTTP and client integration; existing pilot and developer-journey specs own their respective contracts |
| 0.6 | Real OCI provider using the same application, capability, operation and deployment identities | Existing service-portability and native OCI owners |
| 2.0 | Advanced execution such as multistage exchange and deeper planning | Existing advanced-execution allocation |

The [feature map](../../../docs/development/agpl-feature-map.md) owns version
scope. This amendment does not claim earlier SQL, pilot or release obligations
closed and does not change edition ownership. A bounded patch need not wait for
Hono or the full comparison programme. Scenario A comparison can advance
independently of Hono through its existing owner; it is not another HTTP test.

## 2. Verified 0.4.0 delta and recommendation changes

Comparison baseline: `5ec4374f8c161259802f231f3fd522552b94a4cc` to release
`07206ba1c8bb396f4eb097a753915bb34580d824`. Inspect the actual tag, generated
guest adapters, host owners and public journey composition before claiming a
recommendation is already satisfied.

| Point | Released-source observation | Revised recommendation |
| --- | --- | --- |
| Artifact ingestion/deployment | Canonical publication, required replicated payload storage and identity-only deployment are implemented | Reuse them; close their real remote/recovery journey through the existing owner, not a second uploader or Hono deployment command |
| Stable endpoint updates | Binding generation/revision and in-flight pinning work landed | Reuse that revision authority for service mounts and retry admission |
| Generated JSON-body mismatch | Ingress/scaffold now normalize object and empty JSON bodies | Credit the repair. The successor Fetch envelope intentionally replaces this narrow contract; do not report the original bug as still present |
| Async handlers | Worker invocation already awaits exports, but both generated guest handlers immediately serialize `handler.handle(...)` | Fix the guest adapter and prove the whole component path; adding an outer host await alone is insufficient |
| HTTP fidelity | Ingress forwards only accept/content-type, parses an object body and copies a query object; response body is a string | Preserve admitted URL/headers and body bytes through one qualified Fetch adapter |
| Multi-operation | Internal service-cell-v2 support exists; the public CLI does not select it as the default target | Promote one canonical multi-operation target; remove the old/new authoring choice |
| Typed selector parameters | Ordinary locking SQL binds parameters, but the Call Cell local receiver still executes with an empty parameter array | Finish Q2 through source IR, immutable planning and the same local execution values; ordinary SQL support is not this proof |
| Reduction and partials | Generic collection sorts and slices before invoking the reducer; finite-number partial checks remain | First refuse aggregate count/byte overflow; then implement Q4's one structured contribution contract |
| Sequential calls, direct keys and paging | Fixed child ordinal/single nested call, no explicit public CALL invocation-key field and a one-batch limit remain | Sequential HTTP calls belong here; the pilot owner adds direct-call keys through the same invoker, and Q3 owns page/accumulator/read-view semantics |
| Developer journey proof | J1 tests build then import source into Node with a supplied dispatcher; J2 simulates restart/activation with an in-process store | Keep useful composition evidence, but require the actual compiled component, production owners and real remote faults for public claims |
| Comparison claims | Renderers now represent missing measurements, while publication prose/guard assertions still need reconciliation | Finish the existing original-measurement programme; keep absent evidence nonnumeric and trace claims to actual lab/GCP receipts |
| Management support claims | Default bootstrap management composition still admits simulated backup storage/snapshots and optional upgrade callbacks | Route a bounded 0.4.1 unsupported-dependency/claim repair to the existing management/stabilization owner; Hono adoption does not authorize a backup/PITR product |

Relevant sources at the pinned commit are the paths in section 8, plus
[CLI selection](../../../src/cli/service-pipeline-command.js),
[local SQL receiver](../../../src/node/runtime-service-call-cell-handler.js),
[reduction](../../../src/runtime/call-cell-reduce-coordinator.js),
[invocation defaults](../../../src/bootstrap/shared/call-cell-invocation-setup.js),
and [journey composition tests](../../../test/integration/developer-journey-j1-j2-j3.integration.test.js).
The management finding follows
[bootstrap composition](../../../src/bootstrap/bootstrap-api-server-methods.js),
[management defaults](../../../src/bootstrap/owners/management-v1-owner.js),
[backup defaults](../../../src/bootstrap/owners/backup-restore-owner.js) and
[upgrade callbacks](../../../src/bootstrap/owners/rolling-upgrade-owner.js).
Refresh the relevant exact source and evidence before sealing implementation.

### 2.1 Correctness prerequisite: 0.4.1

The existing call owner must retain the complete admitted contribution set or
return a typed resource failure. Generic reduction must never silently rank and
truncate contributions. Top-K is an explicit application operation with its own
valid semantics, not a generic coordinator optimization.

Enforce aggregate count and encoded-byte limits before invoking the reducer,
and pass the query owner's byte limit while reading local input, before full
materialization. Retain existing row, time and concurrency bounds. A regression
with 17 shards emitting 64 contributions each produces 1,088 contributions:
under a 1,024 limit it must refuse explicitly, never return a successful result
from the first 1,024. This is a proposed discriminating case, not a claim that a
production incident or a new run has been observed.

Q4 retains the future structured-value work; Q3 retains large-input execution.
Neither expansion is required to fix silent loss in the existing envelope.

## 3. Canonical developer surface

The application boundary is:

`fetch(Request, requestContext) -> Response | Promise<Response>`.

Hono is the first qualified framework for that boundary. Lagrange does not wrap
every route, duplicate Hono middleware/validation/response helpers or infer the
application's call graph. An ordinary route can make zero Lagrange calls.

Proposed 0.5 source shape, not an API available in 0.4.0:

```js
import { Hono } from 'hono';
import { defineService } from 'lagrange-server/authoring';
import { summarize } from './operations.js';

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true }));
app.post('/accounts/summary', async (c) => {
  const { accountId } = await c.req.json();
  if (typeof accountId !== 'string' || accountId.length === 0) {
    return c.json({ error: 'accountId is required' }, 400);
  }
  // Application middleware must authorize this account for the caller.
  const result = await c.env.lagrange.call(summarize, { accountId });
  return c.json(result);
});

export default defineService({
  name: 'account-summary',
  version: '1.0.0',
  operations: { summarize },
  fetch(request, context) {
    return app.fetch(request, context);
  },
});
```

The exported operation registry supplies stable operation identifiers and
declared data/effect requirements. It is not a per-route `calls` list. Runtime
identity comes from admitted deployment and invocation state, never from an
accountId, arbitrary target string or caller-supplied authority header.
An HTTP-only service may declare `operations: {}`. The source/compiler/runtime
contract must support zero operations as well as one or many; a health route in
a service containing an unrelated operation does not prove that capability.

H2 must expose the proposed guest-safe `lagrange-server/authoring` package
subpath from the existing pure authoring modules, with matching installed
types. It is not an export available in 0.4.0. The current broad server package
root reexports Node/runtime modules and must not become the guest's import
graph. Bundle ordinary ESM dependencies including pinned Hono through the
canonical build; keep one authoring implementation, not a copied SDK variant.

`lagrange.call(operation, args)` always returns a Promise in the application
API. It denotes a distributed operation, with typed failure and inherited
limits. It does not denote a persistent database session, ambient transaction,
automatic SQL optimization session or unrestricted query/write interface.

### 3.1 One cutover

Replace `handlers`, `http.get/post`, handler `calls` and the Lagrange `json`
helper in the accepted 0.5 authoring contract. Regenerate affected examples,
scaffolds, types, deployment records and artifacts together. Old artifact/ABI
versions receive an explicit incompatibility/refusal and a regeneration path;
no permanent legacy mode, fallback dispatcher or runtime feature flag remains.

The internal ABI version named service-cell-v2 is not product release 2.0.
Reuse its dispatch work where applicable rather than inventing another export
family. Update current architecture/reference documents only as the accepted
implementation changes; this plan must not advertise Hono as shipped.

## 4. HTTP, deployment and capability contract

### 4.1 Qualify the actual component boundary

H1 must bundle an unchanged, pinned Hono version using the actual Lagrange
toolchain and execute it as a real component. At the baseline ComponentizeJS is
0.21.0 and jco-transpile is 0.4.2. Lock the tested package/toolchain identities
and retain build inputs and artifact digest in the resulting receipt.

The current custom component world may remain the internal transport if the
adapter faithfully supplies the qualified Request/Response profile. A full
`wasi:http` host migration is not a prerequisite without a demonstrated need.
Source compatibility with Hono does not imply that an arbitrary upstream
WASI-HTTP binary can be installed unchanged.

Await the application's actual returned Promise before response encoding.
Promise syntax does not establish nonblocking host calls, parallel child calls
or reentrant component instances. Test module initialization, asynchronous
body reads, route exceptions, response collection and the existing host import.

### 4.2 Mount once, route in Hono

The existing deployment Binding owner admits one service ingress mount defined
by an allowed host and a path prefix. It pins the immutable artifact/service
revision; Hono selects routes within the admitted application. Do not generate
a competing binding/policy table for every Hono route.

Match prefixes on path-segment boundaries. Reject overlapping mounts for the
same admitted host, except revision replacement of the same mount identity.
Default mounting at `/` is sufficient for the first journey. Preserve the
admitted external URL rather than silently stripping a prefix; applications
use Hono's own basePath/routing facilities where needed. Derive scheme/authority
only from the trusted ingress/proxy configuration. Specify and test URL
canonicalization and reject ambiguous unsafe encodings before route admission.

Consume the existing monotonic Binding revision and ready-generation rules:
new requests select an admitted ready revision, and in-flight work stays pinned.
The artifact and operation versions cannot change midway through an invocation.

### 4.3 Honest Fetch profile

Carry body bytes through ingress without automatic object parsing or JSON
reserialization. Hono/application code chooses `json()`, `text()` or binary
consumption and handles malformed input. Construct the request from the admitted
URL, preserving query order, repeated values and encoding under the declared
standard URL normalization. Do not reconstruct it from a lossy query object.

Forward admitted application headers using HTTP/Fetch semantics. Reject forged
Lagrange authority headers; strip hop-by-hop headers at the transport owner.
Retain response status, byte content and header multiplicity, including multiple
Set-Cookie fields. Honor HEAD and body-forbidden status rules; the transport owns
framing/content-length. Do not claim preservation of meaningless raw header case
or HTTP framing bytes as a Fetch guarantee.

The first profile is bounded buffered request/response processing, with early
input limits and bounded incremental response collection before publication.
Every byte/count/time limit has one owner and a typed failure. Streaming network
responses, WebSockets, background `waitUntil`, broad Node compatibility and all
Hono middleware are outside the 0.5 support claim. A stream-shaped Response may
only be accepted by fully bounded collection; it cannot evade output limits.

### 4.4 Service authority and application authorization

The deployed service is the HTTP application/capability unit. Registered local
operations are available to its request entry only under the admitted deployed
policy. Removing handler `calls` deliberately replaces per-handler capability
granularity; it must not accidentally retain two disagreeing policy systems.

Cross-service dependencies require explicit immutable target declarations and
deployer-granted capabilities. A manifest requests authority and cannot grant
itself authority. The host revalidates operation identity/version, tenant,
caller and target at invocation; guest object identity is never the sole check.
Registered operations do not automatically become public HTTP endpoints.

Application middleware still authorizes access to accounts and other business
objects. A service's permission to invoke summarize is not permission for every
caller to summarize every account. Authentication happens before invocation-key
lookup and before admission of distributed work.
The request context exposes a readonly admitted principal and tenant identity
alongside the scoped client, deadline and abort signal. Application middleware
consumes that identity from Hono env instead of trusting identity headers.
Define which platform credentials are consumed at ingress and never forwarded;
ordinary admitted application headers remain available under section 4.3.
Do not expose secrets or mutable host-authority objects as context properties.

### 4.5 Separate request facilities from pure operations

At the baseline the build disables random, stdio, clocks, HTTP and fetch-event
engine features. That fact alone does not prove Request/Response constructors
are absent. Qualify the minimal middleware profile on the pinned runtime.

Do not enable ambient capabilities globally to satisfy a middleware import and
thereby expose them to pure distributed `run`/`reduce`. Use enforced invocation
capabilities or separate internal component instances/artifacts within the one
service package where necessary; prove that pure code cannot access forbidden
facilities. An ordinary mode flag checked only by cooperative guest code is
insufficient. The implementation package must seal this boundary before adding
clock, crypto, random or network-dependent support claims.

A global Hono routing object may be reusable. Request credentials, clients,
signals and mutable application request state may not be stored there. Context
storage requiring AsyncLocalStorage is not assumed available. Unsupported host
facilities fail clearly rather than receiving silent shims or fake results.

## 5. Request-scoped client and invocation lifetime

### 5.1 Sequential calls and identity

Create the client at invocation admission from trusted tenant/principal,
artifact/service revision, allowed operation dependencies, absolute deadline,
cancellation state and resource budget. Pass it explicitly through Hono's env.
Close it on request termination; retained references reject further calls.

The initial scheduling contract permits multiple bounded sequential awaited
calls and one outstanding child per request. Concurrent calls receive a typed
unsupported-concurrency refusal; `Promise.all` does not silently serialize into
an undocumented contract or promise parallelism. A call-count ceiling remains a
declared budget rather than a hardcoded single-use API restriction.

Allocate child identities from the existing parent invocation owner using a
stable ordinal plus operation identity and normalized argument intent. Fence
completions by request, child and worker incarnation, so a late response cannot
satisfy another child or another request. Share the parent's deadline and
aggregate budget; child retries do not receive fresh unlimited budgets.

Keep one active invocation per component instance. A handler waiting on a child
must not wait for work scheduled onto that same occupied instance. Use the
existing lifecycle/scheduler to allocate separate bounded execution capacity;
do not add a second pool or scheduler without a measured ownership need.

If the handler returns with admitted child work outstanding, the owner reports
a typed unfinished-work failure, cancels/drains that work within its bound and
prevents instance reuse until fenced. Unawaited calls are not background jobs.
Close new call admission when the fetch handler returns. Lazy Response-body
callbacks cannot start post-handler Lagrange work while the host collects bytes.

### 5.2 Invocation keys and replay

For keyed HTTP requests, the existing durable invocation owner scopes the key
to authenticated tenant/principal and stable service/mount identity. At first
admission it pins the artifact/operation revision and records request intent:
method, admitted URL including query, original body bytes and application-visible
headers under one documented normalization. Hash all semantic visible input;
do not hash only parsed JSON. Infrastructure-only fields excluded from intent
must not silently become semantic application inputs.

An accepted retry consumes the stored revision, even if the mount has since
updated. New keys use the current ready revision. Explicitly selecting a
different target/version or changing semantic input under the same key conflicts.
Different principals cannot retrieve each other's retained response by choosing
the same key. Authorization is rechecked before returning any retained data.
Seal where that authoritative authorization runs. A host response cache cannot
skip Hono middleware if that middleware supplies required per-request business
authorization. Place replay after the required authorization decision, or make
the limited replay contract explicit before accepting it. Revoked grants and
expired credentials must not be bypassed by a retained successful response.

Seal completed-response replay, conflicting reuse, in-progress work, terminal
failure and uncertain outcome separately. State the retention window and storage
budget. Expiry is not an eternal exactly-once promise: while an expired record is
retained return its typed expired outcome; after metadata retention ends the
contract cannot promise to detect every historical reuse. Clients must not retry
an old intent beyond the advertised window as though deduplication persists.

Ordinary HTTP code may depend on time, randomness, external reads or effects.
Stable child ordinals alone do not make restarting it safe. The initial contract
replays a completed retained response and does not automatically rerun an
arbitrary handler after uncertain execution. Only a separately proved safe
admission/recovery transition can resume; otherwise return the defined uncertain
outcome and operator-visible state. Do not claim exactly-once guest execution.

### 5.3 Cancellation and terminal ownership

One invocation owner resolves response completion, timeout, explicit cancel and
worker failure to one terminal outcome. Propagate the absolute deadline and
authorized cancellation to admitted children. Late completions are fenced.
Clean up buffers, handles, child slots and pending replies on every terminal path.

For multiple authorized waiters on one invocation key, a disconnected waiter
detaches; it does not silently cancel work still owned by other waiters. Seal the
policy for an invocation with no waiters and for explicit operation cancellation.
Keep operation lifetime distinct from an individual socket lifetime, bounded by
the original deadline and durable state. No detached unowned execution remains.
The guest Request.signal and context signal reflect that invocation-owned
cancellation decision, not an automatic abort on any one waiter's disconnect.

## 6. Consume the distributed execution contract

Q2-Q5 remain in the
[pilot requirements](../pilot-readiness-and-public-proof/requirements.md).
Hono is an HTTP client of these operations and cannot implement their semantics
inside middleware. Their revised detailed owners are
[paging](../pilot-readiness-and-public-proof/paged-execution.md) and
[structured contributions](../pilot-readiness-and-public-proof/structured-partials.md).

Required integration properties are the same validated selector arguments at
planner and local SQL executor; a single structured codec; separate semantic
group keys and transport delivery identities; complete admitted reduction; one
canonical multi-operation target; and explicit page/accumulator/read-view
semantics. Page completion must atomically preserve accumulator progress and
cursor state, or discard the whole affected attempt before safe restart.

The same existing pilot/call owner adds an explicit invocation key to the public
direct-call path through the lifecycle SQL/CLI contract and CallCellInvoker in
0.5. It consumes the canonical operation intent, trusted scope, immutable target,
replay/conflict/retention and uncertain-outcome semantics. HTTP method, URL and
body fingerprinting remain HTTP-specific. Do not add a second transport, call
engine or idempotency store, and do not require direct SQL callers to manufacture
an HTTP request to obtain retry safety.

Read-only distributed execution remains the initial contract. A leadership fence
is not a common global read snapshot. Arbitrary writes, distributed joins,
automatic reduction reassociation and general multistage planning are not
introduced by making HTTP handlers asynchronous. Future capabilities retain
their existing owner and version allocation.

## 7. Ordered implementation packages and acceptance

Seal each bounded implementation Quest against its actual red witness. These
packages coordinate dependencies and are not fabricated sealed Quest records.

| Package | Version and change | Required result |
| --- | --- | --- |
| C0 | 0.4.1, existing call owner | No successful truncated aggregate; early input/output byte enforcement and focused regressions. Existing claim owners reconcile current evidence and publication |
| H1 | 0.5, pinned Hono component proof | Real component with normal Hono routing, async body reads/response, bytes and one host call on the supported toolchain, plus an HTTP-only zero-operation artifact. Record missing facilities instead of assuming a new host is necessary |
| H2 | 0.5, source/IR/deployment policy cutover | One Fetch entry, zero/one/many-operation registry, canonical target, service mount and host-enforced service/dependency authority; explicit old-artifact refusal |
| H3 | 0.5, ingress/guest/client composition | Complete bounded HTTP envelope; awaited guest response; scoped sequential calls, deadline/identity fencing and instance isolation |
| H4 | 0.5, invocation recovery contract | Same-intent replay, conflict, retention, uncertain execution and cancellation/waiter ownership proved through existing durable owners |
| H5 | 0.5, complete public service journey | Consume Q2-Q5 plus the existing generated/deploy/update journey on real compiled WASM, with the independent oracle and failure cases below |
| H6 | 0.5, current product contract and evidence | Update scaffold, types, reference, architecture, capability producer/checker and published examples together; reuse actual lab/GCP measurement owners |

H1 may run alongside C0 because it is a bounded compatibility question. H2
seals the shared contracts before H3/H4 integrate. Q2-Q5 may proceed through
their existing owners when consumed interfaces are defined. H5 proves the
composition; no package creates an independent release track or weakens the
existing pilot/security release requirements.

### 7.1 The useful public journey

Use a fresh installed consumer and the real generated Hono scaffold. Build,
publish and deploy through the canonical artifact path, then:

1. Deploy an HTTP-only service with an empty operation registry and call its
   health route; also keep a zero-call route in the distributed example.
2. POST an authorized account ID, validate it with ordinary Hono/application
   code, await a real distributed operation, and return the exact oracle result.
3. Invoke two registered operations sequentially. Distinct account arguments
   must reach distinct authorized selected data, including zero matching rows.
4. Process data beyond one old shard batch and repeated logical aggregation
   keys on multiple partition hosts; compare complete results to an independent
   oracle. Consume Q3/Q4 recovery/read-view evidence, never synthetic paging.
5. Exercise invalid JSON, validation/auth refusal, unknown/forbidden targets,
   body/result budget exhaustion, deadline/cancel, late completion and warm
   request isolation. Exercise overlapping client calls, including Promise.all,
   in the compiled guest; a blocking host bridge must not conceal a violation
   of the declared one-outstanding-call contract. Return typed failures without
   leaked authority/state.
6. Exercise text/binary bodies, repeated query values, cookies, HEAD and
   body-forbidden statuses. Two byte-distinct JSON bodies with the same parsed
   meaning must remain distinguishable for signatures and keyed intent.
7. Exercise completed response replay, changed-input conflict, cross-principal
   isolation, mount update during retry, and uncertain handler execution without
   unsafe automatic rerun. Include cancellation with two waiters.
8. Change service behavior behind the same endpoint while an old request is in
   flight. Old and new invocations retain their correct immutable revisions.
9. Publish from a separate client, remove source/build files, deploy from a clean
   client by registered identity, and perform real node restart/other-node
   activation through the existing developer-journey J2 owner.

Use the real component/runtime and production dispatcher/catalog/storage
composition. Source imports executed under Node, `app.request()` unit tests,
mock SDKs, injected payload stores and manual binding fixtures cannot substitute
for the promised public journey. Unit evidence remains useful for bounded cases.

### 7.2 Acceptance scenario and evidence contract

The planned `standard-http-service-api-acceptance` scenario consumes original
evidence with exact source,
artifact/toolchain identities, configuration/topology, observations, oracle and
failure records. The existing certification probe requires three consecutive
qualifying runs, metric priority, with certification enabled. Reuse applicable
original Q/J evidence through the existing owner; do not create a second
comparison campaign. Required evidence families in the scenario's report are:

| Receipt ID | Evidence consumed |
| --- | --- |
| pinned-toolchain-hono-component | H1 actual compile and component execution, including async and host import |
| fetch-http-semantics | H3 byte/URL/header/status/budget cases through public ingress and real guest |
| service-capability-boundary | H2 allow/deny, forged identity/version and request-versus-pure-operation facility isolation |
| request-call-lifecycle | H3/H4 sequential identities, replay/conflict/uncertainty, cancellation, no cross-request leakage or orphan work |
| compiled-public-hono-journey | H5 real multi-host service journey and applicable Q2-Q5/J1-J3 original receipts |
| successor-contract-cutover | H6 scaffold/types/reference/producer consistency, removed DSL/modes and explicit artifact-version refusal |

The existing certification owner must validate original evidence before
generating or admitting a summary. Handwritten passed booleans, source
grep, a build alone or this planning review cannot close the epic. Replacing the
guest with Node, dropping contributions or bypassing artifact storage must make
the relevant acceptance fail. Keep unmeasured outcomes explicit.

Performance and cost claims require actual product and comparator runs on GCP
or registered lab hosts through the
[existing comparison owner](../developer-journey-and-measured-comparisons/requirements.md).
Hono size, memory, cold start and latency are initially unmeasured. Do not invent
targets, comparisons or a new benchmark service to make this plan look complete.

## 8. Source-owner crosswalk

| Interaction | Existing owner paths to review/change together |
| --- | --- |
| Authoring to normalized IR | `src/authoring/define-service.js`, `src/authoring/request-handler.js`, `src/service/service-source-contract.js` |
| IR to guest, types and immutable records | `src/service/service-entry-generator.js`, `src/service/service-typings-generator.js`, `src/service/service-deployment-record-generator.js` |
| Build and scaffold | `src/service/service-component-build.js`, `src/cli/service-wasm-scaffold.js`, `src/cli/service-pipeline-command.js` |
| HTTP to admitted guest request | `src/service/request-cell-http-adapter.js`, `src/service/request-cell-routing-contract.js`, `src/node/runtime-service-request-cell-handler.js` |
| Mount/revision selection | `src/control-plane/owners/deployment-binding-owner.js`, `src/service/request-binding-route-resolver.js`; consume the developer-journey revision contract |
| Client to authorized distributed invocation | `src/service/request-cell-call-bridge.js`, `src/runtime/cell-host-call-protocol.js`, `src/control-plane/owners/runtime-access-policy-owner.js` |
| Guest execution and instance lifetime | `src/runtime/wasi-component-cell-worker.js`, `src/runtime/wasi-component-cell-runtime.js`, existing invocation/lifecycle owners |
| Fixed component boundary | `wit/world.wit`, `src/runtime/component-export-resolution.js` |
| Distributed data and contribution work | Existing pilot Q2-Q5 owners; `src/service/call-cell-batch-executor.js`, `src/service/call-cell-invoker.js`, `src/runtime/call-cell-reduce-coordinator.js` |

The authorizes list is a scope ceiling, not permission to rewrite every listed
subsystem. One writer owns each changing interaction and seals the smallest
necessary paths. Inspect applicable architecture contracts before implementation.

## 9. Supersession and verification record

The successor HTTP requirements explicitly supersede active planning clauses
requiring the custom handler DSL/per-handler calls policy and permanent v1/v2
compatibility. The existing pilot specifications explicitly replace their
disjoint-group-key and whole-batch-per-page assumptions. Historical compiler
decisions and sealed Quest records retain their original meaning; a changed
sealed execution predicate requires its own successor, never an edited receipt.

The developer-journey JSON-object ingress contract remains evidence of the
0.4.0 repair. This successor intentionally replaces its future HTTP envelope
with original bytes and application-owned parsing. Artifact ingestion, stable
revision and actual-measurement requirements remain owned there.

Independent review of the recommendations checked these counterexamples:

- Promise-returning Hono handler serialized before completion despite an awaiting
  host worker; pinned toolchain lacking a claimed Fetch facility.
- Raw bytes/query/header loss concealed by a parsed-object unit test.
- Permission broadening when removing calls, or pure-operation I/O enabled by
  middleware needs.
- Nondeterministic handler rerun under a reused key, stale revision admission,
  two waiters sharing cancellation, or a late child satisfying another request.
- Generic top-K loss; duplicate logical keys confused with duplicate delivery;
  page cursor persisted without its accumulator or read-view continuity.
- A real build followed by Node execution presented as real WASM evidence;
  modeled data or simulated restart presented as physical product observation.

Documentation adoption requires epic schema, roadmap, audience, link/current
documentation and applicable generated-consistency checks plus independent
contradiction/coverage review. No full runtime/distributed/system suite is
required for this documentation-only change. Runtime acceptance stays unverified
until the original proofs above exist.

## 10. Upstream evidence and its limit

Reviewed 2026-10-31:

- [Hono WASI guide](https://hono.dev/docs/getting-started/webassembly-wasi)
  demonstrates the StarlingMonkey/ComponentizeJS ecosystem and a WASI HTTP
  adapter. It does not certify Lagrange's custom world or pinned versions.
- [Hono app API](https://hono.dev/docs/api/hono) documents `app.fetch(request,
  env, event)` and ordinary routing. The proposed integration uses that boundary.
- [jco-std adapters](https://bytecodealliance.github.io/jco/interop/jco-std.html)
  include a Hono WASI HTTP adapter; its WIT version and capabilities must match
  the host. Selected Node compatibility is explicitly experimental.
- [ComponentizeJS](https://github.com/bytecodealliance/ComponentizeJS) describes
  Promise resolution for JavaScript exports. This supports testing the current
  internal world before assuming an async-WIT migration is required.
- [Hono context storage](https://hono.dev/docs/middleware/builtin/context-storage)
  requires AsyncLocalStorage. It is not part of the initial compatibility claim.

These are upstream feasibility evidence. H1 supplies the missing Lagrange
compatibility observation; H5 supplies composed product evidence.
