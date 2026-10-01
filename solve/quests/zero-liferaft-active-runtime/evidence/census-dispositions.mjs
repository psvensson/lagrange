// Disposition of every non-historical census hit (quest
// zero-liferaft-active-runtime, constraint census-before-deletion).
// [matcher, disposition, owner, reason, replacement?]; first match wins.
// A string ending in '/' is a prefix; any other string is an exact path.

const D = 'delete';
const M = 'migrate';
const P = 'preserve-as-backend-neutral';

const MG = 'src/message-group (R3)';
const RAFT = 'src/raft (rs-raft operation port owner)';
const PART = 'src/partition';
const HARNESS = 'test/distributed harness';
const SIM = 'test/simulation formation simulator';
const DOCS = 'architecture/current docs';

export const DISPOSITION_RULES = Object.freeze([
  // ---- owner decision 5: the worker consensus path is deleted --------------
  ['src/worker/', D, 'owner decision 5 (R4a)',
    'dead worker consensus path: no production constructor reaches it'],
  ['src/cache/system-cache-proxy.js', D, 'owner decision 5 (R4a)',
    'worker-only system cache proxy, unreachable (F10)'],
  ['test/worker/', D, 'owner decision 5 (R4a)', 'tests of the deleted worker path'],
  ['test/integration/multi-worker-raft.integration.test.js', D,
    'owner decision 5 (R4a)', 'worker consensus integration test'],
  ['test/integration/cross-worker-cdc.integration.test.js', D,
    'owner decision 5 (R4a)', 'worker CDC integration test'],
  [/^test\/cache\/system-cache-proxy-.*\.property\.test\.js$/, D,
    'owner decision 5 (R4a)', 'tests of the deleted worker cache proxy'],
  ['test/cache/system-cache-key-descriptor.test.js', D, 'owner decision 5 (R4a)',
    'tests the worker-only sqlite-system-cache'],
  ['test/raft/leader-election-completion.property.test.js', D,
    'owner decision 5 (R4a)', 'worker-process property over native packets'],
  [/^test\/(transport\/(handler-registration|loopback-connection|uniform-message-routing)|bootstrap\/message-groups-first-bootstrap-order)\.property\.test\.js$/,
    M, 'src/constants ENTITY_TYPE',
    'backend-neutral transport/bootstrap invariant; re-pointed off worker-constants'],
  ['scripts/build-sea.js', M, 'SEA packaging',
    'the Replica Worker bundle is removed with the worker path'],

  // ---- legacy implementation, provider, spike and rollback machinery -------
  [/^src\/raft\/liferaft[-a-z]*\.js$/, D, RAFT, 'legacy consensus implementation'],
  [/^src\/raft\/raft-group(-constants)?\.js$/, D, RAFT,
    'legacy RaftGroup object model; message groups move to the port'],
  [/^src\/raft\/raft-replica-base(-constants|-runtime-helpers)?\.js$/, D, RAFT,
    'owner decision 6: RaftReplicaBase is deleted, not inherited'],
  ['src/raft/in-memory-log-adapter.js', D, RAFT, 'legacy in-memory log adapter'],
  ['src/raft/raft-timing-utils.js', D, RAFT,
    'legacy timer mutation; the port owns tick configuration'],
  ['src/raft/raft-peer-backpressure-mute.js', D, RAFT,
    'legacy per-peer packet mute; the runtime records peer delivery'],
  ['src/raft/remote-peer-representation.js', D, RAFT, 'imported only by the legacy runtime'],
  ['src/raft/virtual-tick.js', D, RAFT, 'imported only by the legacy runtime'],
  ['src/raft/committed-prefix-divergence.js', D, RAFT,
    'imported only by the legacy follower data path'],
  ['src/raft/raft-provider-contract.js', D, RAFT, 'provider contract of the retired selection'],
  ['src/raft/raft-provider-contract-constants.js', D, RAFT,
    'provider vocabulary; the port request keys are rehomed',
    'src/raft/raft-operation-port-request.js'],
  [/^src\/raft\/raft-provider-control(-constants)?\.js$/, D, RAFT,
    'process-level provider selection'],
  ['src/raft/spike/', D, RAFT, 'raft-logic spike and its provider control'],
  ['src/partition/partition-coordinator.js', D, PART,
    'dead RaftGroup orchestrator: no production importer'],
  ['src/partition/partition-coordinator-constants.js', D, PART,
    'constants of the dead coordinator'],
  ['test/partition/partition-coordinator.test.js', D, PART, 'tests the dead coordinator'],
  [/^scripts\/run-raft-(logic-investigation-spike|migration-benchmarks|migration-rollback-drill|migration-stage-gate)\.js$/,
    D, 'scripts', 'spike/migration/rollback tooling of the retired provider choice'],
  ['scripts/quest-evidence/raft-rs-experimental-partition-backend.js', D,
    'scripts/quest-evidence', 'unwired evidence harness of the retired seam'],

  // ---- production surfaces migrated in place -------------------------------
  ['src/message-group/', M, MG,
    'MessageGroupService runs on the raft-rs operation port'],
  ['src/lagrange-runtime-startup.js', M, 'runtime startup',
    'one implementation initialised without selection'],
  ['src/raft/raft-rs-operation-port.js', M, RAFT, 'request keys from the neutral owner'],
  [/^src\/partition\/partition-service-(constants|core-base|entry-apply-base|raft-init-base|shared)\.js$/,
    M, PART, 'retired vocabulary, selection option and native-packet branch removed'],
  ['src/wasm-service/wasm-service-replica.js', M, 'src/wasm-service (owner decision 6)',
    'WasmServiceReplica built on the operation port'],
  [/^src\/(bootstrap\/bootstrap-service|bootstrap\/shared\/(hosted-replica-authorities|snapshot-catchup-wiring)|diagnostics\/raft-formation-attribution|rebalancer\/rebalance-coordinator-operation-creation|time\/time-source)\.js$/,
    M, 'owning module', 'comment-only reference to the retired runtime reworded'],
  [/^src\/raft\/(learner-promotion-progress|raft-packet-utils|raft-rs-durable-store-constants|raft-rs-membership-projection|snapshot-catchup|snapshot-catchup-constants)\.js$/,
    M, RAFT, 'comment-only reference to the retired runtime reworded'],
  [/^src\/raft\/sqlite-log-(adapter|adapter-batch-api|adapter-callback-api|entry-shape)\.js$/,
    M, 'snapshot/catch-up owner',
    'snapshot-install staging format; comments reworded, ownership recorded'],

  // ---- configuration, scripts and manifests ---------------------------------
  [/^package(-lock)?\.json$/, M, 'package manifest',
    'legacy dependency, spike dependency and migration scripts removed'],
  [/^scripts\/check-guideline-(decision-boundaries|silent-catch)-baseline\.json$/,
    M, 'guideline ratchets', 'entries of deleted files tightened through owned commands'],
  [/^scripts\/(analyze-latent-blockers\.js|census\/unwired-event-census\.mjs|check-guideline-hot-path-diagnostics\.js|checks\/(apparatus-release-consolidation-budget|attribution-authority-probe|formation-sim-peer-raft-authority)\.js|run-test-harness-improvement-batch-scenario\.js)$/,
    M, 'scripts', 'reference to the retired runtime removed or reworded'],
  [/^scripts\/(check-documentation-current-state|check-no-kiro-refs)\.js$/, P, 'scripts',
    'names the historical solve/specs report path only'],
  ['vendor/raft-rs-wasm/', P, 'vendor/raft-rs-wasm',
    'binding provenance names its upstream crate; not an active runtime'],

  // ---- documentation --------------------------------------------------------
  [/^architecture\/(overview|process-replication|runtime-components|runtime-lifecycle)\.md$/,
    M, DOCS, 'current architecture states one consensus implementation'],
  [/^docs\/(deterministic-directed-testing-plan|deterministic-repro-tier|development\/home-lab)\.md$/,
    M, DOCS, 'current doc reworded'],
  ['docs/steering/generated/tools-index.md', M, 'npm run steering:generate',
    'regenerated after the scripts are removed'],
  ['models/local-leader-tenure-claim/abstract-protocol.md', P, 'models',
    'abstract protocol prose; names no runtime to construct'],

  // ---- distributed harness --------------------------------------------------
  [/^test\/distributed\/(run|run-report-metadata|run-runtime-helpers)\.js$/, M, HARNESS,
    'no provider setting; one implementation'],
  [/^test\/distributed\/harness\/(cluster-base-layer|cluster-class-lifecycle-base|config-parser|constants|virtual-network)\.js$/,
    M, HARNESS, 'no provider setting; one implementation'],
  ['test/distributed/harness/__tests__/', M, HARNESS, 'harness tests without provider setting'],
  ['test/distributed/config/', M, HARNESS, 'distributed configs without provider setting'],
  ['test/distributed/README.local.md', M, HARNESS, 'harness readme without rollback drill'],
  ['test/distributed/harness/raft-network-host.js', D, HARNESS,
    'virtual-network host of the legacy runtime',
    'test/distributed/harness/raft-rs-network-host.js'],
  ['test/distributed/harness/rolling-restart-acknowledged-write-durability-visibility.test.js',
    M, HARNESS, 'receipt/classification cases kept; legacy-quorum replay cases removed'],
  ['test/scripts/distributed-matrix-cli.test.js', M, 'scripts', 'no provider selector flag'],

  // ---- legacy-only tests ----------------------------------------------------
  [/^test\/raft\/liferaft-[-a-z]*\.test\.js$/, D, RAFT, 'legacy runtime behaviour'],
  ['test/raft/spike/', D, RAFT, 'spike and provider control tests'],
  [/^test\/raft\/(in-memory-log-adapter-(committed-clamp|contract)|in-memory-storage-round-trip\.property|committed-entry-immutability(-contract|\.property)|log-truncation-correctness\.property)(\.test)?\.js$/,
    D, RAFT,
    'contract of the deleted in-memory adapter; rs-raft durable log covered by ' +
    'test/raft/raft-rs-backend/durable-store-committed-entries.test.js'],
  [/^test\/raft\/(raft-group(\.property)?|raft-replica-base|raft-provider-contract|raft-provider-control|raft-timing-utils|raft-transport-backpressure-mute|remote-peer-representation|virtual-tick|raft-packet-round-trip\.property|raft-packet-routing\.property|election-jitter-seed|raft-protocol-task-tracker)\.test\.js$/,
    D, RAFT, 'tests of deleted legacy modules'],
  ['test/raft/leadership-transfer-single-path.test.js', M, RAFT,
    'single-path leadership-transfer invariant kept on the rs-raft port; ' +
    'legacy-port construction and refusal cases removed'],
  [/^test\/closure\/CL-04[012]\.repro\.test\.js$/, D, RAFT,
    'repro of a legacy-runtime protocol defect; rs-raft election/log safety in ' +
    'test/raft/raft-rs-backend/election-safety.test.js'],
  [/^test\/convergence\/dt6-(bulk-transfer-budget|candidacy-reluctance-drain-stepdown|directed-election-heartbeat-clobber|fine-drive-midchurn-safety|leadership-migration-network|raft-election-network|real-raft-network)\.test\.js$/,
    D, 'deterministic testing tier',
    'exercises legacy-runtime election/timer behaviour; rs-raft elections are ' +
    'covered by test/raft/raft-rs-backend and cannot be seeded (O2)'],
  [/^test\/convergence\/dt4-(freeze-leadership|full-chain)-scenario\.test\.js$/, D,
    'deterministic testing tier', 'legacy runtime election timer on a virtual tick'],
  [/^test\/convergence\/(dt6-(control-plane-migration-network|publication-ack-recovery-gate-network|publication-failback-network|publication-failback-pct-search|publication-quorum-failback-network)|dt-priority-partition-spread-cold-boot-network)\.test\.js$/,
    M, 'deterministic testing tier',
    'control-plane invariant retargeted onto the rs-raft network host'],
  ['test/convergence/dt-movielens-raft-peer-cohort-pruning-election.test.js', M, PART,
    'partition port test double renamed; comments reworded'],
  [/^test\/raft\/snapshot-gated-compaction-(catchup|malformed-index)\.test\.js$/, D,
    RAFT, 'drives the legacy node append-entries handler end to end'],
  [/^test\/raft\/(snapshot-catchup-dispatch|snapshot-compaction-catchup-integration|snapshot-recorded-gaps|snapshot-gated-compaction-contract)\.test\.js$/,
    M, 'snapshot/catch-up owner',
    'snapshot invariants kept; legacy-runtime driving removed'],
  [/^test\/(raft\/(snapshot-checkpoint-sqlite-payload|snapshot-dispatcher-wiring|sqlite-log-adapter-committed-truncation-guard|append-ack-packet-detection|append-fail-packet-detection)|raft\/helpers\/raft-follower-append-starvation-relief-scenarios)\.(test\.)?js$/,
    M, 'owning module', 'comment or retired-guard reference reworded'],

  // ---- native-packet write/ingress simulations of the legacy node -----------
  [/^test\/(message-group\/(packet-round-trip-preservation|raft-node-write-preservation)|partition\/(partition-packet-round-trip|partition-raft-node-write-preservation)|raft\/transport-adapter-message-delivery)\.property\.test\.js$/,
    D, 'consensus transport ingress',
    'simulates the legacy node write()/native-packet ingress that is removed; the ' +
    'semantic envelope path is covered by test/partition/raft-rs-transport-demux.test.js'],
  ['test/partition/raft-message-delivery.property.test.js', M, 'transport',
    'router delivery invariant retargeted to the rs-raft envelope'],

  // ---- message group tests --------------------------------------------------
  ['test/message-group/', M, MG, 'message-group tests run on the operation port'],
  [/^test\/integration\/(cdc-bootstrap-control-plane-pressure|node-join-replica-activation)\.integration\.test\.js$/,
    M, MG, 'message group engaged through the operation port'],
  [/^test\/bootstrap\/(bootstrap-sequence|production-scheduling-defaults)\.test\.js$/, M,
    'bootstrap', 'comment reworded; message group built with a durable store'],

  // ---- partition and rs-raft tests -----------------------------------------
  ['test/partition/', M, PART,
    'port test double renamed; native-packet cases removed; comments reworded'],
  ['test/raft/raft-rs-backend/', M, RAFT,
    'request keys from the neutral owner; legacy comparison cases removed'],
  ['test/rebalancer/replace-real-group-harness.js', M, 'rebalancer tests',
    'request keys from the neutral owner'],
  ['test/config/code-path-uniqueness.property.test.js', M, 'config tests', 'comment reworded'],
  ['test/diagnostics/formation-attribution-semantics.test.js', M, 'diagnostics',
    'legacy-node attribution case removed'],

  // ---- wasm service ---------------------------------------------------------
  ['test/wasm-service/wasm-service-replica.test.js', M, 'src/wasm-service',
    'rewritten on the operation port (owner decision 6)'],

  // ---- static tooling tests -------------------------------------------------
  [/^test\/scripts\/(apparatus-release-consolidation-budget|static-audit-input-triggers)\.test\.js$/,
    M, 'scripts', 'legacy dependency fixture/trigger reworded'],

  // ---- formation simulator --------------------------------------------------
  [/^test\/simulation\/(formation-sim-peer-raft-authority|formation-sim-raft-cohort)\.js$/,
    D, SIM, 'legacy-runtime cohort and peer authority'],
  [/^test\/simulation\/(formation-sim-production-seed-host|formation-sim-runner)\.js$/,
    M, SIM, 'legacy runtime counting and cohort removed'],
  [/^test\/simulation\/(formation-attribution-provenance|formation-sim-runner)\.test\.js$/,
    M, SIM, 'legacy-runtime expectations removed'],
  ['test/simulation/calibration/', M, SIM, 'calibration prose reworded'],

  // ---- generated test metadata ---------------------------------------------
  ['test/shards/', M, 'npm run test:metadata:refresh',
    'regenerated after deletions'],
]);
