---
audience: development
documentClass: planning
---

# Requirements: One deployment path, a complete developer journey, and measured comparisons

## 1. Purpose and acceptance boundary

This is the single detailed contract linked by the
[developer-journey-and-measured-comparisons epic](../../epics/developer-journey-and-measured-comparisons.md).
It incorporates Peter's 31 October 2026 instructions and the independently
verified developer-facing audit at
[dc07efb142f33b04e457d1abbfcc4baabdf9ede0](https://github.com/psvensson/lagrange/commit/dc07efb142f33b04e457d1abbfcc4baabdf9ede0).

A developer must be able to understand Lagrange, identify a suitable workload,
create and change a service through the supported interface, and evaluate
published comparisons without reconciling conflicting sources or hidden setup.
The work includes product and evidence-path corrections, not just prose edits.

The post-release amendment carries remaining full journey/comparison acceptance
from 0.4 to 0.5. Current bounded claim/guard repairs target 0.4.1. The existing
public-service and Scenario A owners retain their semantic contracts; Scenario A
can progress independently of Hono. Existing pilot qualification is not weakened.
At the original audit baseline GitHub listed 0.3.3; v0.4.0 was subsequently
published on 2026-10-31 at 14:16:56 UTC. Publication is not milestone acceptance.

Planning delivery and product completion are separate. This document creates no
runtime, benchmark, release or whole-corpus proof. No result may be fabricated
to make the epic's planned receipt present or its probe green.

## 2. Binding user decisions

### D1. Actual comparisons only

Every current product comparison must come from actual Lagrange and comparator
execution on GCP or registered lab machines. This covers throughput, latency,
phase timing, bytes, resource use, freshness, recovery, movement, scale-out,
operational counts and cost claims wherever presented comparatively.

There is no modeled-comparison mode, analytical-comparison publication tier,
synthetic replacement, numeric fallback or hosted-oracle substitute.
A timer around an oracle on a real machine still measures the oracle.
Unit/formal models and independent correctness oracles remain legitimate
engineering tools; they cannot supply product comparison measurements.

Statistics calculated from observations are permitted: completed operations
divided by measured time, empirical quantiles, uncertainty estimates, measured
counter deltas and ratios of compatible observations. Assumed RTT multipliers,
invented byte counts, fixed recovery times and projections are not observations.
Missing evidence is explicit and nonnumeric, never zero.

### D2. Deployment consumes registered immutable identities

Use one semantic chain:

1. Build the service.
2. Publish its bytes through authenticated, bounded artifact ingestion.
3. Verify and durably seal them in Lagrange's existing replicated artifact store.
4. Deploy a registered immutable identity with explicit configuration through
   the existing lifecycle owner.
5. Reconcile and activate through the existing Binding and runtime owners.
6. Obtain executable bytes from the canonical artifact store.

The deploy stage requires credentials, registered identities and explicit
configuration only. It does not read a project, manifest file, .lagrange
directory, local OCI layout, shared volume or container-mounted artifact path.
No server local-file acquisition, client project-directory inference, remote
registry acquisition alternative, disk-artifact-cache source, or external repair
fallback remains in deployment or activation.

Building source may read its own inputs; ordinary SQLite/storage I/O remains
ordinary storage I/O. These are not alternative deployment artifact sources.
A convenience command may orchestrate build/publish/deploy, but each stage uses
these same owners. A co-located node, demo, embedded call and remote client
receive no alternate semantic path.

### D3. One owner and one mechanism

Thin public adapters may share the canonical owner. They must preserve identity,
authorization, limits, retry and failure semantics. No second uploader catalog,
lifecycle state store, mutable route registry, request decoder, runtime scheduler,
benchmark engine, compatibility feature flag or development-only bypass is added.

Remove replaced active paths in the same accepted cutover. Unavailable required
owners return typed failures. Historical logs and receipts stay append-only;
history does not grant permission to keep an executable fallback.

### D4. Complete, credible public journeys

An implementation, mock, source inspection or hand-authored example cannot stand
in for the promised generated-service journey. The developer's own scaffold
must handle real authenticated requests, change behavior behind the same stable
endpoint, and reset cleanly.

### D5. Appropriate verification

Planning and prose changes need the applicable document, schema, link, roadmap
and generated-consistency checks plus review. They do not trigger full runtime
or system tests merely because they describe the system.
Runtime/contract changes retain focused regression and public-path proofs.
Product comparisons require original GCP/lab execution regardless of where
orchestration, documentation rendering or unit tests run.

## 3. Verified baseline and required corrections

### Post-release reconciliation

At `07206ba1c8bb396f4eb097a753915bb34580d824`, source implementation for canonical
artifact ingestion, mandatory payload storage, identity-only deployment,
monotonic binding revisions and the JSON-object body repair has landed. Reuse
those owners and preserve their applicable focused evidence. Comparison
renderers also removed substantial modeled values and expose missing evidence.
The V01-V20 table below retains the original dated audit; it is not a claim
that every original defect remains in the release.

The [J1/J2/J3 composition test](../../../test/integration/developer-journey-j1-j2-j3.integration.test.js)
builds a WASM artifact and then imports source into Node with a supplied
dispatcher; its restart/second-node simulation shares an in-process database.
This is useful composition evidence but cannot establish actual compiled guest
execution or independent host failure/recovery. Required real J1/J2 evidence
remains open unless original matching runtime receipts establish it.

Current publication and guard consistency also needs repair: the benchmark
introduction still permits a modeled-oracle tier, and released comparison prose
must be reconciled with the original physical evidence. The exact-head CI
failures inspected in this audit concern a removed README link and timeout
expectation drift; they do not alone demonstrate a query-engine regression.
Keep the comparison campaign's original-measurement requirement intact.

The [standard HTTP successor](../standard-http-service-api/requirements.md)
owns the user-selected Hono/Fetch application boundary and request-scoped SDK.
It supersedes the future JSON-object-only HTTP envelope here, while crediting
the V10 repair and retaining all artifact/revision/measurement requirements.

### Original audit at dc07efb142f33b04e457d1abbfcc4baabdf9ede0

| ID | Baseline observation | Consequence |
| --- | --- | --- |
| V01 | README and current-capabilities declare indexes unsupported; the audit hardcodes that answer while DDL source, journey tests and release notes describe index paths. | Reconcile source, public ingress, original proof and support level together. Do not blindly flip every feature to supported. |
| V02 | Roadmap still calls 0.3.1 current and 0.3.2 next; main package is 0.4.0 and GitHub latest release is 0.3.3. | Distinguish publication, development source, tutorial version and accepted evidence. Update the three roadmap projections together. |
| V03 | Comparative matrix and scale-out generators contain numeric results and forced completion counts; provenance can be derived from a label. | Replace constants and label-based admission with one original-receipt-driven projection. Even an observed label needs original evidence. |
| V04 | Scenario B times a JavaScript oracle, checks oracle results against the same oracle and adds network/byte formulas. | Invoke independent real products through public interfaces and use the oracle only to validate their returned results. |
| V05 | Two benchmark epics are recorded done under deterministic guards checking generated material and modeled provenance. | Record supersession of comparison acceptance; preserve historical records; replace active completion predicates with original measurement admission. |
| V06 | Scenario C renderers contain literal throughput/recovery success prose. | Both prose and numbers must be derived from admitted observations. |
| V07 | High-level deploy, dev-install and install select local or remote artifact acquisition; runtime loading has cache/store/external-repair branches. | Replace all supported entry points and activation with D2. |
| V08 | Installation internalization and Binding admission can skip the store when absent; bootstrap composition preserves pre-store behavior. | Store availability, sealing and verified identity are required before bindable installation or activation. |
| V09 | Binding names are stable while declarations are immutable/create-only; changed-code replay conflicts. | Seal an owner-controlled revision transition for a stable HTTP endpoint. Renaming/reset is not update acceptance. |
| V10 | Generated handler accepts a string body but drops accountId from a parsed object; its unit test covers only the string. | Establish one public request-body contract and verify the actual generated service over HTTP. |
| V11 | First-hour demo stops its node before the own-service deploy step; credential, fixture, invocation, update and reset steps are incomplete. | Provide one copyable, complete user journey. |
| V12 | Generated README/CLI referrals omit promised connection setup; generated-file locations are described inconsistently. | One configuration reference and accurate output/edit/commit responsibilities. |
| V13 | Hot-path tutorial teaches an older low-level authoring route; MovieLens topology descriptions disagree. | Teach current code-first authoring; derive run facts from actual configuration. |
| V14 | README reaches Try it after about 1,500 words; provider policy and internals precede first action. | Reorder and shorten while preserving necessary immediate limits. |
| V15 | MovieLens's arithmetic scoring can be considered for a complete SQL top-N baseline. | Measure the strongest applicable SQL baseline; do not require unnecessary transfers to create an advantage. |
| V16 | Deeper architecture mixes call locality, ordinary read routing and learned placement. | Share the precise three-mechanism distinction and label internal APIs. |
| V17 | JavaScript behavior, imports, host I/O, logging, values and generated files lack one practical reference. | Make types, implementation, examples and one reference agree. |
| V18 | Audience, troubleshooting, repository metadata and release-health interpretation need clearer entry points. | State fit, evaluation commitment, usable diagnostics and the meaning of reported status. |
| V19 | Demo locality counts are derived explanatory accounting. | Label them accurately; comparative byte claims require real counters. |
| V20 | Epic prose and executable epic schema disagree. | Use the executable schema and route the documentation defect without broadening into a Solver rewrite. |

Baseline evidence is in the following existing sources; implementation must
refresh the relevant source identities before sealing work:

- [Capability declaration](../../../docs/current-capabilities.json),
  [capability checker](../../../scripts/check-current-capabilities.js),
  [DDL owner](../../../src/query/sql-query-engine-ddl-methods.js),
  [changelog](../../../CHANGELOG.md).
- [Matrix generator](../../../test/distributed/harness/comparative-matrix-runner.js),
  [Scenario B comparators](../../../test/distributed/harness/scenario-b-comparators.js),
  [scale-out generator](../../../test/distributed/harness/scaleout-series-experiments.js),
  [Scenario C renderer](../../../test/distributed/harness/scenario-c-comparison-static-web.js).
- [CLI pipeline](../../../src/cli/service-pipeline-command.js),
  [lifecycle CLI](../../../src/cli/service-lifecycle-command.js),
  [artifact resolver](../../../src/service/installable-service-artifact-resolver.js),
  [internalization](../../../src/service/artifact-payload-internalization.js),
  [payload loader](../../../src/service/artifact-payload-loader.js).
- [Binding owner](../../../src/control-plane/owners/deployment-binding-owner.js),
  [deployment generator](../../../src/service/service-deployment-record-generator.js),
  [scaffold](../../../src/cli/service-wasm-scaffold.js),
  [HTTP adapter](../../../src/service/request-cell-http-adapter.js).
- [First hour](../../../docs/tutorials/first-hour.md),
  [hot-path tutorial](../../../docs/tutorials/rewrite-a-hot-path.md),
  [MovieLens example](../../../examples/service-data-affinity/README.md),
  [architecture index](../../../architecture/INDEX.md),
  [system model](../../../architecture/system-model.md).

## 4. Ownership, version allocation and supersession

| Concern | Existing semantic owner / contract | This epic's responsibility |
| --- | --- | --- |
| Release sequence | AGPL feature map; root roadmap and product roadmap are its projections | Bounded current repairs in 0.4.1; remaining full acceptance in 0.5. Preserve stable row identities and honest earlier acceptance gaps. |
| Public WASI call model | pilot-readiness-and-public-proof Q1-Q5; code-first compiler and existing call/runtime owners | Consume the one current service path. Route required service-envelope work to its existing owner. |
| HTTP application and scoped SDK | standard-http-service-api requirements | J1/J3 consume the Hono/Fetch successor; do not create a separate handler, router, policy or response contract here. |
| Scenario A | RM-0.4-scenario-a-comparison; paired semantic/retry/load owners | Preserve its agreed semantics and acquire admissible real comparisons. |
| Artifact bytes | ArtifactPayloadStore and ordinary replicated artifact tables | Make this the sole durable payload authority and ingestion/read path. |
| Lifecycle | ServiceLifecycleCommandOwner and ServiceInstallCatalogOwner | Own immutable installation intent, idempotency and resumable completion. |
| Bindings and revisions | DeploymentBindingOwner; existing desired-state, routing and lifecycle owners | Seal one revision transition, preserving immutable lineage and stable route behavior. |
| Runtime activation | ServiceDefinitionsOwner, runtime rebalancer, ServiceRuntimeLifecycle and runtime driver | Consume sealed registered artifacts; remove independent acquisition and storeless success. |
| Benchmark execution | Existing distributed matrix/scenario registry and lab/GCP adapters | Add real product adapters and observations to one execution path. |
| Evidence and claims | Comparative efficiency evidence contract, scale evidence contract and claim projection | Admit original receipts once and render all current publications from the decision. |
| Current support | current-capabilities source, generator and checker | Reconcile actual public behavior and original witnesses without another ledger. |
| Accepted scaffold repairs | developer-adoption-and-ergonomics historical work | Preserve existing fixes; add newly demonstrated HTTP/update follow-up proofs. |

Read the [feature map](../../../docs/development/agpl-feature-map.md),
[roadmap policy](../../../docs/development/roadmap-policy.md),
[public proof epic](../../epics/pilot-readiness-and-public-proof.md),
[comparative requirements](../comparative-workload-efficiency-evidence/requirements.md),
[minimal deployment architecture](../../../architecture/minimal-deployment-surface.md)
and [documentation lifecycle](../../../docs/development/documentation-lifecycle.md).

The following former permissions are superseded for new/current work:

- The modeled-comparison tier and deterministic terminal predicates in
  [multi-system comparative matrix](../../epics/multi-system-comparative-benchmark-matrix.md)
  and [distributed scale-out/provenance](../../epics/distributed-scaleout-and-provenance-benchmark-series.md).
- Local OCI installation inputs, optional external repair and temporary
  compatibility loading in the
  [cluster-owned artifact brief](../../../docs/development/cluster-owned-artifacts-parallel-dispatch-brief.md).
- Local-directory dev-install and duplicate artifact acquisition proposals in
  current/future developer-workflow guidance.

Append an explicit correcting decision and successor links through the existing
history owner. Update current explanations and guards; do not rewrite old logs,
relabel an old measurement with a new version, or pretend a previous seal
measured the stronger acceptance. No new documentation archive is needed.

Full pilot transport security, backup/PITR, migration certification, supported
rolling upgrades and enterprise identity remain outside this epic's scope.
Existing mandatory security/admission controls must still hold. Future OCI
execution must consume the same artifact/lifecycle model; it is not implemented
here merely to remove a WASM shortcut.

## 5. Canonical artifact and revision contract

### 5.1 Ingestion and identity

Extend the existing authenticated lifecycle ingress and ArtifactPayloadStore.
Seal the exact bounded upload/chunk grammar before changing behavior; do not
introduce a parallel HTTP blob service, external registry dependency or upload
catalog. Reuse existing chunk/seal state and durable operation ownership.

Keep package_id, normalized manifest_digest, OCI artifact/descriptor digest and
executable payload digest distinct. Deploy and Binding identity must not depend
on filesystem locations, mutable tags or the machine that published the bytes.

Admission validates authorization, declared size, media type, descriptor,
chunk count/order identity, individual digests and final digest. Preserve the
existing configured authenticity policy; do not claim signature enforcement
when no such policy is active. Bound buffering and total retained upload work.
Internal storage chunk limits are not proof of safe public request limits.

Incomplete/unsealed bytes are never bindable. Acknowledged publish success
means verified bytes are durably sealed through ordinary replicated storage.
Sealed bytes, installed declarations, Binding commitment, runtime readiness and
route publication remain separate owner-defined states.

### 5.2 Deployment and activation

The normal deploy action accepts registered immutable identities and explicit
configuration. It performs no filesystem lookup or registry pull. All CLI,
direct SQL, demo, embedded and lower-level callers converge on the same owner.

Required-store absence/unavailability is a typed deployment or activation
failure. Do not skip internalization, permit storeless Binding admission, use
pre-store bootstrap composition, or fall through to original external sources.

Activation on any eligible node reads canonical sealed bytes through the same
owner. Remove the filesystem artifact-cache branch from artifact resolution.
A disposable in-memory compiled-code cache may remain an implementation
optimization under verified immutable identity; it cannot supply admission
authority or make missing canonical artifact state acceptable.

Retire local_oci_layout, deployment-time remote_oci acquisition, acquireLocal,
dev-install's local bypass and external runtime repair. Unsupported old inputs
are refused by the canonical owner rather than adapted through a compatibility
decoder. Documentation, templates, tests and CLI help must not retain those
paths as supported alternatives.

### 5.3 Retry, recovery and lifetime

Seal trigger, authoritative facts, action, durable commit point, lost-response
behavior and remaining-obligation owner for each ingestion/deployment transition.

Required focused cases:

- identical retry versus conflicting intent under the same operation identity;
- disconnect before/after seal acknowledgement and restart during upload;
- missing, duplicated, reordered or corrupted chunks and digest/size mismatch;
- unavailable store, unsealed artifact, unauthorized access and identity misuse;
- interruption after artifact seal but before catalog or Binding completion;
- partial deployment resumed through the same lifecycle operation;
- activation on another node after publisher disappearance;
- acknowledged seal surviving loss/restart of its accepting node and the
  artifact-storage leader within the declared replica/quorum envelope;
- reference-safe reclamation of abandoned uploads, retired revisions and caches.

Garbage collection cannot remove bytes referenced by installed/current or
in-flight revisions or pending canonical obligations. There must also be a
bounded reclaim route for genuinely abandoned uploads.

### 5.4 Stable endpoint update

Consume the revision-transition contract implemented in 0.4.0 through the
existing lifecycle/Binding owners. The original create-only replay limitation
motivated this work; do not rebuild that mechanism for the Hono successor.

The contract must provide:

- a stable service/HTTP endpoint identity across a changed-code deployment;
- immutable old and new revision identities;
- one explicit ordering/conflict result for concurrent updates;
- readiness before new requests select the new revision;
- in-flight work pinned to its original revision through completion;
- handler, operation and generated outbound-call wiring belonging to the
  selected immutable revision within one invocation;
- runtime authorization checked by the canonical policy owner at its defined
  access boundary; deployment does not freeze, duplicate or supersede the
  independently managed table-authorization policy;
- a failed build, upload, validation or activation leaving the prior ready
  revision usable, with an explicit failure result;
- deterministic retry/restart behavior and safe old-revision retirement.

Do not satisfy this by renaming the service, resetting the database, creating
ambiguous duplicate routes, editing system tables or adding a mutable routing
registry. Keeping the previous committed revision active until a new revision
commits is part of this one transition, not an alternate deployment mechanism.
This is a service revision update, not a claim of supported cluster rolling
upgrades or zero-downtime behavior beyond the exact tested contract.

## 6. Complete developer journeys and documentation

### J1. Generate, publish, deploy, invoke, change, reset

From a clean documented environment, using the declared published/tested version:

1. Check platform/Node/toolchain prerequisites and install the supported tools.
2. Start the normal runtime with a complete disposable credential configuration.
3. Show the exact connection and authentication setup once.
4. Create and seed the small fixture table through supported public SQL.
5. Generate a new Hono service with the real CLI under the successor HTTP
   contract; explain editable/generated files.
6. Build and publish it through section 5, then deploy its registered identity.
7. Wait for actual service readiness through a public inspect/status surface.
8. Invoke it through authenticated JSON HTTP and compare exact expected output.
9. Invoke with a second account ID and prove distinct correctly filtered output.
10. Change a visible rule; build, publish and update the same stable endpoint.
11. Verify the changed response and inspect a useful error/log when requested.
12. Stop and remove the disposable instance through a clear, repeatable reset.
13. Repeat from clean state without hidden harness preconditions.

Use the single Fetch HTTP contract in the
[standard HTTP requirements](../standard-http-service-api/requirements.md).
Ingress preserves admitted original bytes; ordinary Hono/application code parses
and validates JSON. Invalid input cannot become an unfiltered distributed query.
This deliberately supersedes the earlier JSON-object-only ingress requirement;
there is no second decoder for old scaffolds. The public journey executes the
generated compiled component through production owners, never a source import
under Node standing in for guest execution.

A developer may run a functional tutorial on their own machine. It uses the
same ingestion, lifecycle and invocation mechanisms. Such a local run does not
enter the accepted comparison corpus.

### J2. Remote deployment without source files

On GCP or registered lab infrastructure, build/publish from a client whose
filesystem is separate from cluster servers. Delete its project/build outputs.
From a clean second client with credentials, registered identities and explicit
configuration only, deploy/inspect/invoke the service. Activate it on a node
other than ingress, restart that node and repeat invocation after the original
publisher has stopped.

The artifact tables must use the ordinary production partition/Raft path.
Record actual replica placement and the declared quorum/failure envelope.
After an acknowledged seal, stop or restart the ingress/sealing node and
activate the service on another eligible node from surviving canonical bytes.
If ingress and the artifact-storage leader are different nodes, include the
leader-loss/restart case as a separate bounded fault within that same envelope.
Loss of the required quorum returns the defined unavailable outcome; it never
enables filesystem, cache or external acquisition. This witnesses artifact
durability within the tested envelope, not a general recovery SLO.

Retain credential-redacted network/protocol evidence, identities,
source/artifact digests, placement and results. Do not retain passwords or
authorization headers. No shared volume, payload-table fixture insertion or
injected store may supply the product success path.

### J3. A motivating bounded workload

Retain account-summary as a transparent first exercise. Rewrite the hot-path
tutorial around the current code-first authored service and section 5 lifecycle.
For 0.5, consume the Hono/Fetch and explicit `lagrange.call` contract from its
owner; Hono changes HTTP authoring, not the workload's mathematical semantics.

For MovieLens or its bounded replacement, compare where applicable:

- full scoring/selection/top-N inside SQL;
- SQL aggregation plus ordinary application policy;
- Lagrange partition functions and reduction.

Use the same required result, data and durability/freshness contract. Do not
force a comparator to ship rows or aggregates that its normal SQL can avoid.
Explain the actual benefit: custom-policy expression/reuse, coordination code,
measured traffic, latency or resource use. Do not require Lagrange to win.
A new domain calculation must fit supported current interfaces or wait for its
existing service-envelope owner; the harness must not emulate missing APIs.

### Documentation completion

- README leads with product, intended backend/data-platform audience, fit and
  non-fit, bounded evaluation commitment, immediate limits, runnable action and
  expected success. About 900-1,200 words is an editorial target, not a rigid
  gate or justification to omit necessary facts.
- Preserve the integrated-storage boundary, PostgreSQL subset, JavaScript/WASI
  boundary, independent-read/partial-failure limits and honest SQL alternative.
- Move future-provider policy and premature internals behind the appropriate
  architecture/reference links.
- Generated README, CLI help and first-hour guide resolve to one complete
  connection/authentication/setup contract; no circular referral.
- Actual generated output locations, edit/commit responsibilities and version
  compatibility are accurate.
- A single JavaScript reference covers request/response shape, sync/async
  behavior, supported methods/routes, imports/dependencies, host capabilities,
  SQL/external-I/O reachability, logging, conversions, partial types and bounds.
  Unsupported behavior is named and demonstrated; typings match it.
- Current tutorials use the same authoring and deployment path. Low-level ABI
  reference is labeled for maintainers/advanced use and exposes no alternative
  supported lifecycle.
- Architecture consistently distinguishes leader-local distributed calls,
  eligible-replica ordinary SQL routing and longer-term service affinity.
  Internal replicaContext collaborators are not presented as application APIs.
- Topology/process/replica facts in all examples come from actual configuration.
  Derived locality accounting is labeled; measured comparative bytes use counters.
- Troubleshooting maps installation, ports, credentials, schema, ingestion,
  readiness and bounds to an actionable diagnosis and corrective step.
- Repository description/homepage, package/Docker overview where published,
  README and release notes express the same current proposition. Explain
  formation-health counts and their measured scope; do not infer success or
  release failure from an unexplained ratio.
- Distinguish live-query subscriptions, internal CDC, external CDC consumption
  and external ingestion. A correction to one does not establish the others.
- Preserve the useful task-oriented documentation index, related-systems guide,
  detailed execution contract, migration and operations references.

## 7. Original measurement admission

### 7.1 One record-to-publication path

Reuse the existing distributed scenario runner, comparative/scale evidence
contracts and claim projection. Every current table, Markdown/HTML page, SVG,
timeline, release comparison and prose conclusion consumes the same admitted
record. Renderers contain no performance values, fallback measurements,
independent winner decisions or forced completion counts.

A candidate record requires:

- actual execution target: GCP or registered lab;
- actual product processes and supported public interfaces on both arms;
- exact Lagrange/comparator versions, source commits and package/image digests;
- workload, adapter, dataset, schema, configuration and preregistered-plan digests;
- process-to-host/VM mapping, storage and replica/leader placement;
- retained raw observations, setup/teardown and fault/movement records;
- recoverable original receipt/log identities with content digests;
- met correctness/fairness predicates and sufficient samples for each claim;
- accounting for every planned attempt, including failures and refusals.

A label such as observed-docker-cluster is not evidence by itself. Existing
Scenario A samples must be joined to their original evidence before reuse.
Do not retag old results with the current package version.

Absent, malformed, altered, source-mismatched or topology-mismatched evidence
cannot yield a comparison value or a pass. Preserve an explicit reason such as
not measured, blocked, unsupported or failed, using the existing outcome owner.
A real observed zero remains distinguishable from missing data.

### 7.2 Physical placement and execution

A three-node/five-node distributed claim must identify where every process and
replica actually ran. Multiple containers on one machine are one host failure
domain, not three or five independent hosts.

Lab records identify machines/boot incarnations, storage placement, competing
load and relevant thermal conditions. Use the existing shared scheduler,
machine locks and thermal/resource controls; do not create a direct-SSH bypass.

GCP records identify project/run allocation, VM IDs, zones, machine types,
disks and placement policy. Distinct VMs do not automatically prove distinct
underlying physical hosts. A VM-stop experiment claims that tested VM failure,
not universal physical-host or power-loss behavior.

Real network shaping is permitted: apply it to actual traffic, retain the
configuration and verify the achieved conditions. Public output retains the
shaped-network qualifier rather than presenting it as native WAN or zone
network performance. Never add arithmetic RTT delay to an already-computed
result. A hosted orchestration job may dispatch
runs; GitHub-hosted/local-oracle execution is not an accepted comparison target.

All run processes, containers and temporary infrastructure have an existing
owner, bounded lifetime, recorded cleanup and an honest interrupted state.

### 7.3 Fairness and correctness

Before observing results, freeze dataset/schema, workload semantics, result
contract, durability/freshness, retry policy, warm-up/reset, offered-load curve,
attempt ordering, repetitions and statistic sufficiency.

Use existing paired-plan, retry and open-loop owners. Include queueing,
scheduler lag, retries, unknown outcomes, timeouts and drain time. Count correct
completed operations in the declared window; stale/incorrect results do not
become successful throughput. Retain successful and all-attempt latency views.

Use independent correctness checks over actual product responses. Lagrange and
a comparator cannot both be replaced by the same request oracle. SQL-only
Scenario A evidence cannot replace the WASI-over-HTTP service evidence.

Disclose equivalent and intentionally different durability classes. Include
application workers, coordinators, proxies, sidecars, consensus services,
caches and storage in resource accounting. Match resources or explicitly state
the experiment's normalization. Publish losses and neutral outcomes as readily
as wins; no selective rerun until a favorable result appears.

### 7.4 Metrics and interpretation

- Throughput and quantiles derive from retained observations. Predeclare sample
  sufficiency; sparse runs do not establish stable p99 or scaling claims.
- Network bytes come from actual counters at a named boundary. Reducer traffic
  is not total replication/coordination/client traffic.
- Phase timings come from actual spans. Do not sum separate p95/p99 values or
  invent a decomposition to make totals fit.
- Freshness uses recorded event/version causality or an explicit clock method
  and uncertainty. A 0 ms requirement means the declared read-your-writes or
  acknowledgement ordering contract, not infinitely precise simultaneous clocks.
- Movement/recovery records include injection times, actual authority changes,
  acknowledged operation identities and final-state checks. A finite successful
  experiment is reported as that observation; Raft or a modeled topology alone
  does not establish RPO=0 or a recovery SLO.
- Operational counts describe the deployment that actually ran. Cost comparisons
  use recorded usage and an explicit billing basis, not hypothetical savings.
- Instrumentation is equivalent or its overhead is measured and disclosed.
  Raw data permit independent recomputation of every displayed conclusion.

## 8. Finite comparison coverage

P0 inventories every currently advertised comparison and P4 freezes one coverage
manifest before measurement. Preserve actual published points and their intended
claims; do not silently expand to an arbitrary Cartesian product or shrink to
the easiest successful cases. Resolve conflicting partition-count ranges from
the old plans explicitly before sealing.

| Family | Required coverage basis |
| --- | --- |
| Scenario A | Existing contended OLTP semantics, retry/failure profile and declared fixed-workload, proportional-growth and contention studies. |
| Scenario B | Existing locality shapes, sequential/fan-out decisions, RTT and working-set experiments through real service/database interfaces. |
| Scenario C | Existing freshness SLAs, actual event ingestion, rule-change/backfill, restart and joint-scale experiments. |
| Scale-out | Advertised three-to-five-node RF=3 experiments, with actual data/replica coverage and process placement. |
| Partition granularity | Advertised partition/shard counts, resource and coordination effects, resolved into one explicit range. |
| Movement | Actual movement under sustained load with continuity/correctness and authority transitions. |
| Motivating example | Full SQL top-N, SQL plus application policy and Lagrange code-first service where applicable. |

Named configurations already advertised are included where applicable:
Lagrange; TiDB/TiKV; PostgreSQL application and server-function variants;
single-primary and Patroni synchronous-HA variants; Citus SQL and colocated
distributed-function variants; YugabyteDB application/stored-procedure variants;
Ignite colocated compute; PostgreSQL/Valkey synchronous and asynchronous variants.

A configuration unable to express a scenario has a justified unsupported/blocked
entry and no invented numeric result. Do not relax semantics or emulate it in
the harness. A required measurable case remains outstanding until measured;
scope reduction needs an explicit revised decision before accepting completion.
Removing false claims is an early deliverable, not a substitute for completing
the agreed measurement program.

Each run's plan binds resource budgets, duration and repetition/stopping rules.
Use current authorized GCP/lab infrastructure and spending authority. Record
missing capacity/authority honestly; do not manufacture results to avoid it.

## 9. One ordered implementation sequence

These packages are proposed bounded work, not existing or sealed Quests.
Create actual Quest records under the existing Solver when their contracts,
owners and binary acceptance are ready. Independent investigation/review may
overlap, but integration and release acceptance follow this single sequence.

| Package | Scope and dependencies | Required observable |
| --- | --- | --- |
| P0: Current truth and claim withdrawal | Refresh baseline; inventory every audit item, artifact source and advertised comparison; reconcile current capability/version facts; record supersession; remove modeled values from current comparisons; align feature map/root/product roadmap. | Current public claims contain no manufactured comparison results; source/proof gaps and the full unmeasured inventory are explicit. Historical receipts retain their source and meaning. |
| P1: One artifact ingestion/deployment path | Seal section 5 with existing owners; implement bounded authenticated publish and identity-only deployment; remove all local/registry/cache/storeless alternative sources in the same cutover. | Remote client with no shared filesystem publishes; clean second client deploys registered identity; another node activates from replicated bytes after publisher disappears. |
| P2: Stable service revision and request contract | Reuse P1 and the delivered 0.4.0 revision/JSON-body repairs; consume the 0.5 Hono Fetch successor and align scaffold, runtime, examples and types. | Same endpoint returns correctly filtered account-specific responses, then changed-code responses after an update; old in-flight work remains pinned and failed update preserves prior committed revision. |
| P3: Complete developer journey | Build on P1/P2; implement fixture/configuration/readiness/diagnostic/reset support through canonical APIs; update generated README, first-hour and current hot-path tutorial. | A clean user follows J1 and J2 without internal harness setup, local artifact sources or manual system-table edits. |
| P4: Measurement path and fair baselines | Connect existing scenario/evidence owners; remove constant/model generators and active acceptance loopholes; implement real adapters; freeze finite coverage/protocol. | Negative evidence admission cases fail; real responses reach independent oracle; every required case names actual deployment and measurement commands. |
| P5: Measured comparison campaign | Use P1-P4 and existing service-envelope owners as prerequisites; execute actual paired GCP/lab runs in the manifest order, beginning with ordinary SQL baseline and then supported B/C/scale/movement cases. | Every required comparison resolves to admissible original measurements, complete attempt accounting and closed execution scopes. Missing cases remain open. |
| P6: Coherent presentation and developer reference | Use measured/public-journey facts; finish README, audience, SQL explanation, API/reference/locality, topology, troubleshooting, metadata and release interpretation; regenerate all comparison formats. | All current surfaces agree with canonical capability and admitted measurement records; no hardcoded outcome prose or obsolete lifecycle instructions. |
| P7: Independent integrated acceptance | Review the exact composed candidate; rerun affected user journeys, validate/recompute retained comparison evidence and perform appropriate documentation checks. | The eight required receipt families in section 10 are satisfied by applicable original evidence; unresolved required acceptance keeps the epic open. |

P0 can withdraw misleading claims before later measurements are available.
P5 cannot be declared complete because P0 or the rendering checks pass.
A blocked runtime feature goes to its existing semantic owner; it is not
implemented inside a benchmark adapter to keep the sequence apparently green.

## 10. Verification and completion

### 10.1 Required receipt families

| Receipt ID | Completion evidence |
| --- | --- |
| current-claims-and-version | Canonical declaration/checker/generator and release/tutorial/roadmap surfaces agree; each positive claim names its scope and applicable original witness; uncertainty remains explicit. |
| canonical-artifact-ingestion | J2 plus focused integrity/auth/bounds/retry/recovery cases; no filesystem/external/storeless artifact path; acknowledged seal survives accepting-node/artifact-leader loss within the declared quorum envelope and permits activation on another node. |
| stable-service-update | Same stable endpoint, changed revision, pinned in-flight work, concurrent-update conflict, interrupted/failed update and restart through canonical owners. |
| generated-service-http-journey | Actual CLI-generated service over authenticated JSON HTTP with two account IDs, invalid input and a subsequent real update; no flagship-only substitute. |
| fresh-developer-walkthrough | Independent execution of J1 from clean prerequisites, including readiness, expected results, change, diagnostics and reset; separate remote proof J2. |
| measured-comparison-coverage | Every required coverage-manifest case has admissible GCP/lab product observations and accounted attempts; unsupported/blocked entries cannot silently waive required cases. |
| reproducible-public-results | Reviewer recomputes tables/plots/prose from original retained data through the canonical admission/projection; validates source/version, topology, semantics and negative admission cases. |
| documentation-coherence | README/guide/API/typings/examples/architecture/metadata/release surfaces agree; applicable schema, link, audience, roadmap and generated checks pass. |

The epic uses the existing test-receipt/1 projection at its declared future
acceptance-Quest path, with these explicit requiredReceipts. That file does not
exist at planning time and must not be created merely to satisfy the schema.

The existing test-receipt probe checks named pass entries; it does not itself
authenticate the original measurements. Therefore the acceptance owner may emit
those entries only after validating evidence through the existing proof,
certification and comparison owners. A hand-written passed boolean, a fixed
slice count, a matching renderer snapshot or a directory of files is insufficient.
The receipt references original digests, source/configuration identities and
the independent review; it is a projection, not another evidence authority.

### 10.2 Focused negative verification

Evidence admission must reject a fabricated observed label, oracle-only run on
a lab/GCP machine, missing/corrupted raw data, mismatched commit/artifact/version,
invalid topology, wrong semantic profile, unrecorded attempts and a renderer
trying to fill a missing value. Local developer performance measurements cannot
enter the accepted comparison corpus.

Deployment tests must reach the canonical owners for rejected local/remote
source variants and missing store; they must prove no artifact file access or
external acquisition occurs as a side effect of a rejected request. Runtime
restart/activation must not repair a missing payload from the publisher,
filesystem or registry.

Use real public composition for the successful path. A test around a boundary
primitive remains useful but cannot certify the composed journey.

### 10.3 Documentation and release proof scope

Follow the existing
[documentation-only rule](../../../test/guidelines/release-gate.md#documentation-only-changes)
and [major-feature user-journey rule](../../../test/guidelines/release-gate.md#major-feature-user-journeys).
No new full-system run is required for this planning document.
Later behavior changes receive their focused regressions and affected integration
proof. Actual comparison claims always require section 7, and full release
acceptance remains with the existing release owner.

Preserve applicable original evidence instead of rerunning unaffected work
without a concrete reason. Never transfer a performance result to a changed
binary by assuming a code change was harmless. A historical result remains
valid for its recorded source; a current-candidate claim needs applicable
evidence under the existing proof owner.

## 11. Audit-to-package coverage

| Approved audit result or new verification | Requirement / package |
| --- | --- |
| Index/locking/live-query and capability drift, stale guard | V01; P0; current-claims-and-version |
| Published/main/roadmap/tutorial version confusion | V02; P0/P6 |
| Modeled values, source relabeling, oracle timing, hardcoded narrative | D1; V03-V06; sections 7-8; P0/P4-P6 |
| False completion predicates in prior benchmark epics | V05; section 4; P0/P4/P7 |
| Local artifact reads and hidden remote/shared-path assumptions | D2; V07; section 5; P1/J2 |
| Optional store, storeless Binding, external repair, disk cache source | V08; sections 5.2-5.3; P1 |
| Changed-code same-endpoint update absent | V09; section 5.4; P2 |
| Generated JSON-body bug and misleading unit-only success | V10; J1; P2/P3 |
| Missing running node, auth, fixture, readiness, invocation and reset | V11; J1/J2; P3 |
| Generated README/config referrals/output paths | V12; documentation completion; P3/P6 |
| Older tutorial API and MovieLens topology drift | V13; J3; P3/P6 |
| README length/order and premature internal vocabulary | V14; documentation completion; P6 |
| Weak complete-SQL control and unclear motivating benefit | V15; J3; sections 7.3/8; P4-P6 |
| Audience, adoption scope and clear poor-fit boundary | V18; documentation completion; P6 |
| Three locality mechanisms and internal API audience | V16; documentation completion; P6 |
| Missing practical JS API, types, host capabilities, logs | V17; documentation completion; P2/P3/P6 |
| Troubleshooting, metadata, package/Docker overview, release health | V18; documentation completion; P3/P6 |
| Derived locality counts presented as measurement | V19; sections 6/7.4; P4/P6 |
| Suitable docs-only verification | D5; section 10.3; every planning/prose change |
| Epic schema/documentation mismatch | V20; use executable schema; record routed finding only |

## 12. Independent verification decisions

- 2026-10-31: Verification of comparisons found constant-derived results and
  label-derived provenance. Existing observed labels do not establish GCP/lab
  measurement until original artifacts are resolved. Timing a shared oracle is
  not a product benchmark.
- 2026-10-31: Verification of deployment found additional optional-store,
  storeless-Binding and external-repair routes, plus create-only stable Binding
  names blocking a genuine changed-code redeploy.
- 2026-10-31: Coverage verification confirmed the original audit's scope and
  corrected two recommendations: no retained modeled comparison tier, and no
  documented shared-filesystem workaround.
- 2026-10-31: The exact older proposed lagrange.call signature may indeed remain
  absent; the hot-path defect is current-document/API drift, not proof that the
  identical API is simultaneously supported and unsupported.
- 2026-10-31: One semantic mechanism allows thin adapters and ordinary source
  compilation/storage I/O. It does not authorize an unbounded rewrite of all
  unrelated repository APIs, nor a filesystem dependency in deployment.
- 2026-10-31: Final independent review preserved separate runtime table-policy
  authority and added an explicit acknowledged-artifact-seal durability witness
  across accepting-node/artifact-leader loss within the declared quorum envelope.

