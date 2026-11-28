# Stage 1 findings: scenario-a-research-records (successor of scenario-a-research-substrate)

Base `ab347e962`. V = read in code or measured; I = inferred. Paths are repository-relative.
Witnesses: `test/distributed/harness/__tests__/oltp-research-records-witnesses.js`; guard (evaluator, controls): `scripts/checks/oltp-research-records-guard.js`.
Measured red: `node scripts/checks/oltp-research-records-guard.js --metric` prints 11 (properties 1-11 unmet,
every negative control answers correctly).

## 1. How a one-machine development cluster forms with declared host count 1 and replication factor three

- (V) The development harness never sets `FORMATION_DECLARED_HOST_COUNT`
  (`rg` over `test/distributed/harness/cluster-class-lifecycle-base.js`: no use). The seed then defaults to one
  declared host: `createSeedOriginalAllocation({declaredHostCount = 1})`
  (`src/bootstrap/seed-original-allocation-declaration.js:129-152`; the startup passes the value only when set,
  `src/bootstrap/seed-original-allocation-startup.js:128-130`). The config schema accepts exactly `1` or `>= 3`
  (`src/config/configuration-manager.js:176-197`, `seed-original-allocation-declaration.js:90-120`); `2` is refused.
- (V) Every node declares the machine's real host name: `resolveProviderHostName` returns `os.hostname()` for a
  non-remote config (`test/distributed/harness/scenario-host-topology.js:163-175`), written as `NODE_HOST_ID`
  (`cluster-class-lifecycle-base.js:515-516`). The benchmark deployer already does the same by observation
  (`real-product-deployer-lagrange.js:526-536`, `observeHostName`): the hostname blocker of the design does not
  exist for a truthful declaration.
- (V) Formation latches when the ready distinct host ids reach the declared count
  (`src/control-plane/membership-publication-formation-record.js:577`, `collectReadyPublishedNodes` `:367-403`) and
  every priority partition has caught-up voters on `resolveVoterTarget(RF, declaredHostCount)` hosts
  (`:446-450`, `:481-486`); `resolveVoterTarget = largest odd <= min(RF, hosts)`
  (`src/bootstrap/replication-target-authority.js:146-158`) is 1 for one host. The product therefore does not refuse
  RF 3 on one declared host: the rebalancer's spread requirement is `min(RF, eligibleHostCount)`
  (`src/rebalancer/replica-placement-owner-deficits.js:514`), so three voters on three nodes of one host satisfy it
  (`:485`: `distinctHostCount >= requiredHosts && live.length === replicationFactor`). No STOP condition of the brief
  applies. I did not start a cluster; the live proof is stage 3's physical run.
- (V) The development harness runs a one-machine cluster in bridge mode (host network only with more than one Docker
  provider, `cluster-class-lifecycle-base.js:341-346`); the per-node port block (`HOST_NETWORK_PORT_BLOCK = 10`, node
  `i` at REST `8080+10i`, admin `+1`, transport `+2`, `:49`, `:349-380`; peers derive admin and transport from the REST
  port of `NODE_ADDRESS`, `:354-358`) is the multi-provider host-network convention. Host network on one machine with
  port blocks is therefore a new combination, not an existing dev path (see 4).
- (V) One PG-wire listener only (`PG_WIRE_DESIRED_STATE.replicaCount = 1`,
  `real-product-lagrange-observations.js:54-57`), dynamic range 5432-5532 with a typed bind conflict
  (`src/runtime/pgwire-port-constants.js:22-42`): no port collision from the listener. Other node-local listener
  ranges (`src/wasm-service/port-allocator.js`) were not read (not verified).

## 2. Where each of the five single-host blockers lives

| # | Blocker | Sites (V) |
| --- | --- | --- |
| 1 | `--network host` with constant ports | `real-product-remote-shell.js:548` (node container) and `:576` (one-shot container); ports `PORT = {8080, 8081, 8082}` at `real-product-deployer-lagrange.js:111` and `real-product-lagrange-observations.js:49`; used in `nodeEnv` `deployer:148-163` (`NODE_ADDRESS`, three port envs, `SEED_NODE_ADDRESS` `:158`) and in every probe URL: `observations:150, 453, 517, 636, 653, 732` |
| 2 | Host identity and counts keyed by host, not node | The name itself is truthful (`observeHostName` `deployer:526-536`). What breaks: seed versus joiner is decided by host equality `deployer:157` (three nodes on one host would all be seeds); `declaredHostCount: hosts.length` `deployer:638` and `membershipReady(ctx, seedHost, hosts.length)` `:667` -> `isFormationFactReady` `observations:463-466, 481-490` require declared count = node count (3), but a one-host declaration is 1; `nodeReady(ctx, host)` `observations:451-459` and `formLagrangeCluster` `deployer:633-660` address a node by its host; roles are matched to the listener by host `deployer:693` |
| 3 | One host per node | `deployComparativeTarget` slices `input.hosts` to `TARGET_DATA_HOSTS[target]` (`real-product-cluster-deployers.js:24-27, 38`); runner CLI `dataHostCountOf` `docs/benchmarks/cloud/run-comparative-benchmarks.mjs:298-300`, `deployArm` `:450`, host selection `:591, :628` |
| 4 | One boot id per campaign host | `collectHostFacts` refuses equal boot ids `comparative-benchmark-host-preparation.js:70-73`; lab selection keeps one host per boot id `comparative-benchmark-lab-hosts.js:142-151` (`exclusionOf`), `:273-291` (`partitionEligibleHosts`), data hosts `:294`, load generator `:311` |
| 5 | Load generator on a product host | `createWorkloadRunExecutor` refuses `LOAD_GENERATOR_COLOCATED` `comparative-benchmark-workload-call-site.js:486-491` (`productHostsOf` `:375-377`); the lab selector takes the load generator from hosts that are not data hosts (`lab-hosts.js:311-325`); admission's `minDistinctHosts` (`benchmark-claim-admission.js:1081`, claim value 3 for `lagrange`, `comparative-coverage-manifest.js:65`) would also reject a one-host record, which is consistent for a research record |

Container names (`bench-<campaign>-<role>-<ordinal>`, `remote-shell.js:545`) and storage paths
(`<root>/<campaign>/lagrange-<index+1>`, `deployer:165-171`) are already distinct per node.

## 3. Every site that pins the reset-method strings (complete grep, code, tests, docs, quests, scripts)

Values `fresh-formation`, `truncate-and-reload`, field `resetMethod`/`datasetResetMethod`.

- Producer: `test/distributed/harness/benchmark-scenario-a-run.js:97-100` (constant), `:168-171` (`resetMethodOf`), `:184`,
  `:202`, `:497` (unopened run), `:546` (recorded).
- Required-string consumer only: `raw-observation-record.js:512` (non-empty text). No other reader: not
  `benchmark-claim-admission.js`, not the metrics owner, not a renderer under `docs/benchmarks`.
- Event text, not the field: `comparative-benchmark-semantic-gate.js:1211-1212` (`'adapter truncate-and-reload'` for
  Lagrange, `'adapter drop-and-reload'` otherwise), `:1247`, `:1439`.
- A different field with a different producer: `oltp-paired-sweep-runner.js:159-167` (`datasetResetMethod` of a step
  summary); its guard fixes `RESET_METHOD = 'truncate-and-reload'` at `scripts/checks/oltp-paired-sweep-runner-guard.js:47`
  (used `:84`).
- Fixtures and assertions (15 sites, as the design lists): `comparative-benchmark-fixtures.js:379`;
  `__tests__/real-product-workload-driver-outcomes.test.js:214` (asserts the value for an unopened run);
  `__tests__/real-product-remote-shell-and-attribution.test.js:679`;
  `__tests__/comparative-benchmark-runner-workload-call-site.test.js:49, 105, 130, 178`;
  `__tests__/comparative-benchmark-runner-campaign.test.js:101, 185, 362, 381, 548, 560, 656, 668` (and `:135`
  asserts the pass-through).
- Sealed quests, epics, specs, architecture, guidelines, `docs/benchmarks`, `docs/development`: no requirement on the
  field or its values (grep). The strings occur only in retained raw observation files of
  `solve/quests/physical-scenario-a-review-repair/evidence/*/raw-observations.ndjson` (history, unchanged) and in the
  published store (22 `fresh-formation`, 15 `truncate-and-reload`, append-only, digest-covered).
- Measured today (guard property 5): Lagrange on a fresh product records `fresh-formation` (tables `created`); Lagrange
  on tables that exist records `fresh-formation` although every table outcome is `reset-and-routable`; PostgreSQL records
  `truncate-and-reload` although its adapter drops and creates; an unopened run records `fresh-formation`.

## 4. Where the design contradicts the code

1. Section 8(b) blocker 2 and question Q3 (synthetic host identity): the product accepts declared host count 1 with RF 3
   (section 1), and the development path declares the real host name. Ruling 14 already supersedes the design; the code
   confirms it. The remaining host-keyed logic is the seed choice, the declared-count/node-count conflation and the
   per-host probes (blocker 2 above), not the name.
2. Section 8(b) "consuming the convention the development harness already has": the port block is a host-network,
   multi-provider convention (node index across the whole formation); a one-machine dev cluster uses bridge mode
   (`cluster-class-lifecycle-base.js:341-346`). Host network plus port blocks plus declared count 1 is not exercised
   anywhere today; stage 3's physical run is its first proof (I: other fixed per-node ports are not enumerated).
3. Section 8 says the descriptor/round trip on substrate (b) measures "only the load-generator path"; the brief says
   "every ordered data-host pair and load generator to endpoint host". The guard follows the brief (7 entries for three
   hosts) and requires at least one entry on one host; the single-host inter-node path is `loopback` and unmeasured.
4. Section 5 lists the reset-method sites under "complete grep"; it omits the semantic gate's event text
   (`semantic-gate.js:1211-1212`, `:1247`, `:1439`: `adapter truncate-and-reload` for Lagrange, `adapter drop-and-reload`
   for the others). That text already names the method per system and must take the adapter-reported value in stage 2.
5. Section 9 and F1: reproduced on the fake product, 8 of 100 requests exceed 16384 bytes and become
   `retained-file` with `statements: null` (guard property 6 measures `8 of 8` without a custody copy).
6. Section 6 point 4 (admission reason): a research-class record is today rejected earlier, by the enum validator
   (`record-rejected:invalid-enum`, guard property 2), so only after the class exists does the explicit reason matter.
7. Section 6 barrier 5 (`comparative-benchmark-recompute.js` fails on a research record in the published store) is
   not witnessed by running it: the guard's control uses its own reader over a scratch copy of the store, because on the
   unchanged tree the recompute check would fail for the wrong reason (unknown enum). Stage 2 should make
   `recomputeComparativeBenchmarks` answer a message that begins `published store carries a research-class record` and
   the guard should then call it in the control.
8. The record writer is not importable: `appendRecords` is private to the runner CLI
   (`run-comparative-benchmarks.mjs:337-340`) and the CLI runs `main()` on import (`:748`). The store barrier needs a
   harness-owned writer (`createCampaignRecordWriter` in the runner module in the guard's contract), which the CLI consumes.

## 5. Witness seams the guard pins (names are proposals; behaviour is the contract)

1 `COMPARATIVE_RESEARCH_PROFILE` + `buildComparativeCampaignManifest` (class, id `scenario-a-research-v1`, subkind
`research`, not comparable). 2 `ADMISSION_REASON.RESEARCH_PROFILE_NOT_ADMISSIBLE = 'research-profile-not-admissible'`.
3 `createCampaignRecordWriter({rootDir, file, profileClass}).appendRecords` refusing code
`refused_research_store_is_published_store`. 4 `attemptEvidence.timeline = [[catalogIndex, startedMs, endedMs, status]]`
and `registry.statementCatalog` (distinct SQL texts). 5 the three adapters' reported values
(`created-and-loaded`, `truncated-and-reloaded`, `dropped-created-and-loaded`, unopened `not-performed`) in
`deployment.dataset.resetMethod`. 6 `createRemoteWorkloadRunner({..., campaignEvidenceDir})` writing
`<dir>/<runId>/<sha256>.json`, `responseEvidence.custody = {path, sha256, bytes}`, typed codes
`statement_evidence_missing` and `statement_evidence_digest_mismatch`. 7 an unverified seed leaves `accounting.issued = 0`
and `warmup = null`. 8 `planLagrangeNodePlacement({hosts, substrate})` -> `{declaredHostCount, nodes: [{ports: {rest, admin,
transport}, isSeed}]}` and `collectHostFacts({..., substrate})`. 9 exported `measureRtt` (fields `transmitted, received,
lossPercent, minMs, avgMs, maxMs, mdevMs`, 20 packets), `measureRoundTripMatrix`, `buildSubstrateDescriptor`
and `COMPARATIVE_SUBSTRATE_KIND`. Retained record shape (properties 10-11 and the controls): header `substrate`
`{kind, interNodePath, declaredHostCount, nodeHostMap}`; run `observations.statementCatalog`, per-attempt `timeline`,
`observations.network.roundTrip.{before,after} = {startedAt, endedAt, entries}`.

## 6. Not done or unsure

- Only the red side was measured. The green branches of every witness (the code that runs once the feature exists) were
  not exercised; they are written but untested until stage 2 and 3. Properties 10 and 11 were measured absent; the
  evaluator behind them is exercised only by the ideal records and the five mutants of the controls.
- No existing test file was run; stage 1 touches none.
- Whether `validateRunRecord` accepts the extra fields (`timeline`, `custody`, `substrate`) is open; stage 2 decides.

## 7. Rulings applied after review (stage 1b)

- Ruling A: the single-host substrate is a campaign-scoped Docker bridge network (campaign label, created and removed by
  the campaign's own deployment and cleanup owners; a leftover network is a closure failure), nodes on standard ports
  at their own bridge address, declared host count 1, real host name. Inter-node path `docker-bridge`; the guard rejects
  `lan` and `loopback` for one host. Sections 1 (port block) and 2 blocker 1 are read accordingly: the port-block
  convention is not used. Witness 8: `planLagrangeNodePlacement({hosts, substrate, campaignId})` ->
  `{declaredHostCount: 1, network: {kind: 'bridge', name containing the campaign id}, nodes: [{ports: 8080/8081/8082,
  isSeed}]}`, exactly one seed, refused without a substrate. The multi-host substrates keep host networking.
- Ruling B: property 11 and the second artifact are removed; expected red is 10. The multi-host descriptor and
  seven-entry matrix stay witnessed in process (property 9).
- Round trip: every single-host record needs the load-generator-to-endpoint path and every ordered node pair on the
  bridge (7 entries for three nodes) before and after the window; the evaluator requires 7 entries for both kinds.
- Admission: the witness asserts `research-profile-not-admissible` is present among the reasons, not that it is alone.

## 8. Stage-2 plan note: the recompute barrier

Stage 2 gives `recomputeComparativeBenchmarks` a message beginning `published store carries a research-class record`
when the published store holds a research-class record; the guard's store control then calls the real check on the
scratch copy instead of its own reader.

## 9. Successor quest (stage 1c): the ladder

Owner, 2026-11-28 (quoted in the quest's `substrate-ladder` constraint): three rungs, `lab-single-host` (first look),
`lab-multi-host` (three separate lab hosts, the working evidence) and `gcp-same-zone` (final verification). The
single-host analysis above stays current; section 7's ruling B (three-host run not a seal condition) is withdrawn: both
retained runs are seal conditions. Properties (12): 1-7 as before, 8 single-host placement on a campaign bridge,
9 descriptor and round-trip matrix (single-host and three-host descriptors, seven entries), 10 the ladder (every
descriptor carries `evidenceUse` `first-look` / `working-evidence` / `final-verification`; two nodes of a multi-host
descriptor on one host and an unknown kind are refused), 11 retained single-host run, 12 retained three-host run.
Controls added: a single-host record without the first-look marking, a multi-host record with two nodes on one host,
with six round-trip entries, and marked as a first look.
Stage-1b/stage-2 implementation edits (dispatch, admission reason, manifest profile, record writer, adapter-reported
reset method, run owner) were set aside in `git stash` (snapshot 7a1aaff7af8f7fff7372dbfaee0c39709e8d868e) pending release.
