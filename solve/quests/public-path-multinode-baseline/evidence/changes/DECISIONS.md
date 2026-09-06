# public-path-multinode-baseline — design decisions

Scope: evidence substrate only. Harness (`test/distributed/**`) + scenario +
registry + docs + shard classification. Zero `src/` changes.

## D1 — Deploy channel: generated records over the admin SQL lane

The pgwire listener is deliberately not started on harness nodes
(`src/wasm-service/meta-service-factory.js:33`, ship replicaCount 0), so
`runDeploy`'s default PG-env client cannot connect and starting the listener
would be a `src/` change. `runDeploy` (src/cli/service-pipeline-command.js)
accepts an injected `createSqlClient`; the scenario injects one backed by the
harness `node.query()` admin-WS lane, which routes into
`sqlQueryEngine.executeRequest` (`src/admin/admin-websocket-query-execution-methods.js:308`)
— the same SQL ingress that owns the INSTALL SERVICE / CREATE BINDING /
CONFIGURE SERVICE ACCESS grammar. The pipeline module stays the sole
sequencer of the generated records; no statement is hand-built in the
scenario. Reading of the quest text: "deployed only through generated
lifecycle records" binds the deploy channel to the record grammar owner;
"invoked through authenticated HTTP" binds authentication to the invocation
surface (which is enforced hard — see D2). Residual risk recorded in the
final handoff: if a later quest requires the deploy channel itself to be
credentialed pgwire, that needs the pgwire meta-service shipped (a runtime
change, out of scope here).

## D2 — Authenticated HTTP: harness-wide PGWIRE_AUTH_* env

No env seam existed (`config-parser.js` whitelists sections; only host
`LAGRANGE_*` vars pass through). Without `PGWIRE_AUTH_*`, every request-cell
HTTP call is a hard 503 (`src/service/request-cell-http-authenticator.js:44-50`).
Decision: set the three `PGWIRE_AUTH_*` vars on every harness node container
from named constants in `test/distributed/harness/constants.js`, applied in
`_buildNodeEnv` (`cluster-class-lifecycle-base.js`). Chosen over a new config
section because it is fewer moving parts, uniform across configs, and the
credentials are harness-internal fixtures, not secrets. Env changes force a
one-time reuse-container recreate (by design — the recreate check hashes env).
The scenario fails (no fallback) when an unauthenticated request succeeds or
an authenticated one fails.

## D3 — Artifact visibility: scenario-artifact exchange bind in run.js

`INSTALL SERVICE` supports only `local_oci_layout` / `remote_oci`
(`src/service/installable-service-artifact-resolver.js`), and the layout is
built on the host while resolution happens inside node containers. Precedent:
fast-local mode injects a runtime-resolved absolute bind into
`config.docker.binds` (`test/distributed/run.js applyFastLocalConfig`).
Decision: for local docker configs, run.js always injects a read-write bind
`<cwd>/test-output/scenario-artifacts -> /scenario-artifacts` (host dir
mkdir'ed first). Inert for scenarios that don't use it; remote/GCP configs are
excluded exactly like fast-local. The scenario builds the service project
under the host side and passes the container-side layout path to deploy.

## D4 — Service project staging via a relative src symlink

`examples/call-binding-account-summary/lagrange.service.js` imports
`../../src/authoring/*` relative to itself. The scenario copies it verbatim to
`test-output/scenario-artifacts/public-path-baseline/project/` and creates a
`test-output/scenario-artifacts/src -> ../../src` symlink, so the relative
imports resolve to the repo source during host-side
`runGenerate`/`runBuild`. Two live-verified constraints shaped this (an
independent verifier subagent caught the first draft's off-by-one): the
project must sit exactly two levels below the symlink's parent, and the
symlink target must be RELATIVE — ComponentizeJS loads imports inside a WASI
preopen that rejects absolute symlink targets as sandbox escapes. Both
`runGenerate` and the full `runBuild` (componentize + OCI layout, real
sha256 digest) were executed successfully on the host against this exact
layout. No import rewriting, no writes into `examples/`.

## D5 — Partition split: policy + write activity (no runtime mechanism added)

There is no SQL/admin statement to force a split; tables always start at one
partition; `executeManagedSplit` is in-process only. The least-invasive live
mechanism is the benchmark precedent: `UPDATE tables SET table_policies =
'<DEFAULT_TABLE_SPLIT_POLICIES>' WHERE table_id = ...` with stable read-back
(policies include merge thresholds of 1 so auto-merge cannot undo the split),
then write activity drives reactive split evaluation (~1s debounce, one split
per pass). Dataset is sized to ~1.5x the 16384-byte storage threshold so
exactly one split is expected and children stay under threshold; a bounded
trickle of sentinel-account rows keeps evaluation passes firing until growth
is observed. Leader spread across >=2 hosts is polled with a bounded timeout;
if the platform never spreads leaders the scenario goes red — that is the
quest's red condition, not a harness defect. Because a SPLITTING/MERGING
parent row survives in the partitions table until dissolution (verifier
finding), the wait excludes known-transitional states and requires an
identical partition/leader fingerprint across two consecutive polls before
freezing the measured topology; the post-measurement stability check applies
the same filter.

## D6 — Parity oracle and dataset digests

The scenario seeds a deterministic dataset (mulberry32-seeded PRNG, named
constants) interleaving account ids so every partition holds rows of every
queried account. Expected summaries are recomputed in plain scenario JS from
the seeded rows (field-by-field against HTTP responses); sha256 digests of the
generator params and the canonically serialized rows are reported. Sentinel
trickle rows use a reserved account id that is never queried and are excluded
from the canonical dataset digest (their count is reported).

## D7 — Local-read and coordination evidence

Local reads: `metrics.partition.sqlite` info rows from
`cluster.getLogCollector().getBuffer()` (attributed by `node_id`), filtered to
SELECT with rowCount>0 on the table's partitions; gate requires >=2 distinct
nodes and a sample count consistent with the invocation count. Durable
coordination: per measured invocation (deterministic child invocation id via
`createInvocationIdentity(tenant, idempotencyKey) + '#call-1'`),
`call_cell_reduce_results` must hold exactly one row and
`call_cell_reduce_slots` one row per shard; `partial_json` byte lengths give
measured partial bytes (no synthetic values).

## D8 — Telemetry availability is explicit

Invoker debug telemetry (`call-cell invocation telemetry`) is parsed only if
present in the log buffer; otherwise the corresponding report fields are
`null` with an entry in `detail.unavailableReasons`. Container CPU/memory/net
come from `getContainerResourceSnapshot` before/after the measured window;
`memoryPeakBytes` is unavailable (docker stats snapshot has no peak) and is
recorded as such. These nulls are measurement-availability markers, never
domain state.

Note for the Q11 consumer: beyond the frozen schema keys, the detail carries
two additive top-level keys — `sentinelRowCount` (trickle rows excluded from
the canonical dataset digest) and `unavailableReasons` (why any null field is
null). Additive only; the frozen keys are unchanged. Known limitation: HTTP
invocation targets `node.ip:PORTS.REST`, correct for the registered
bridge-mode `local-three-node.json`; host-network configs with per-node port
strides would need the node's own rest-port accessor.

## D9 — Percentiles

`computePercentile` is exported from
`test/distributed/harness/performance-diagnostics.js` (already implemented
there) instead of reimplementing; the load-generator `percentile` is
closure-local and not importable.

## D10 — Unit-test seams

`run(cluster)` resolves an override bundle from
`cluster._scenarioOverrides.publicPathBaseline` (pipeline fns, fetch, clock,
resource snapshots, log buffer) defaulting to the real implementations, so the
harness unit test can drive the four red conditions and the green composition
without docker or ComponentizeJS.
