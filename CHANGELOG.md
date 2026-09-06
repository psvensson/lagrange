# Changelog

All notable changes to Lagrange are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the major version is `0`, the public surface (SQL dialect, wire
protocols, admin CLI, cluster membership behaviour) may change between minor
releases without a compatibility guarantee.

## [Unreleased]

The 0.2 _Stable Core_ work (`RM-0.2-*` rows in
`docs/development/agpl-feature-map.md`), landed on `main` with Solver-verified
evidence and not yet tagged. The release process changed on 2026-09-05
(`RELEASE.md`): a tag proves what is deterministic about its bytes (full
corpus green on the exact SHA, artifacts built and smoke-tested by the tag
workflow, an honest changelog), and five-node formation is a measured
standing signal rather than a release gate.

Formation health on 103786ef3 (2026-09-05, one node per GCP VM): the
five-node MovieLens formation FAILED with `seed_event_loop_starved` — the
seed's event loop was blocked for 49.8 s unexplained inside a 135 s
formation window, the critical-topology settling blocker read
`node_ready_lease_incomplete` 521 times with all five nodes unready in most
samples, the critical system-partition spread gap stayed at 6 with no
operation in flight, and schema admission ended in `control_plane_pressure`.
A bounded three-run five-node GCP formation-only streak last passed on
2026-08-30 (completion 42.8 s / 38.1 s / 35.9 s); the last full MovieLens
pass on GCP was 2026-08-30.

### Added
- Five-node cold formation: an operation-ledger formation barrier with a
  spread cure (closure CL-044) so joiners held on priority spread no longer
  stall cold formation, and a versioned, incarnation-bound formation-release
  handoff authority that carries the whole-plane priority-spread observation
  through to release.
- Startup active-gate convergence after authoritative-discovery repair
  backoff: the active-gate owner re-evaluates cluster-ACTIVE when the repair
  owner's evidence revision advances, without re-admitting repair or weakening
  the anti-storm backoff (`architecture/contracts/active-gate-convergence.md`).
- Release scenario producers for the sealed 0.2 frontiers: G2 five-node
  convergence (cold formation, user-table readiness, runtime-service
  placement) and G3 compacted-follower snapshot integration, plus the GCP
  memory-soak configuration (one node per VM) and a GCP A/B runner whose
  fixed/reverted sources must differ by fingerprint before a run is admitted.
- Memory-soak enforcement: leak admission consumes only node-owned process
  RSS, container capacity shares one reclaimable-cache-adjusted working-set
  owner, and the sustained-write soak fails closed when required per-node
  analysis is missing.
- Readiness-planning and owner-key reconcile-queue diagnostics with fixed
  retention bounds and exact drop accounting; GCP affinity teardown
  materializes every captured full-node log; harness failure bundles collect
  each node's logs through that node's own provider.
- Five-node formation-time priority recovery no longer straddles the 60-second
  certification window: priority control-plane ADDs dispatch concurrently
  under the existing `maxConcurrentAdds` budget (the create-budget turn now
  ends after persist and claim), the operation-ledger self-move hold engages
  only once the self-move is dispatch-admissible and cannot be overtaken
  indefinitely by later ADDs, the held self-move is released only by its own
  terminal row (no second ledger self-move can be admitted), a failed
  cluster-wide idle census retries on the dispatch cadence, and a locally
  owned self-move parked behind live incumbents carries typed park evidence so
  the priority-recovery drain no longer stale-fails it.
- Learner promotion proofs are event-driven: a learner re-requests its proof
  when its own services row becomes visible or the published membership epoch
  changes, refusals carry a typed cause (`learner_address_unresolvable`,
  `request_shape`, `response_binding_mismatch`, `leader_unreachable`,
  `delivery_failed`) logged at info, and an unresolvable-address refusal
  re-asserts the learner's durable services row; proof deliveries carry the
  router-configured message timeout explicitly.
- Joiners consume the seed-owned formation-release handoff contract (a typed
  AUTHORITY/CONSUMER validation role) so a captured JOINING cohort is released
  from the whole-plane authority answer across a priority-spread reopen; a
  non-hosting joiner's consumer read of the authority publication rides a
  typed priority-recovery bootstrap read lane exactly as the seed's write
  does, the validated cached authority row is a typed fallback, and the seed
  mints a successor generation when a captured generation completes after the
  reopen was observed so late joiners no longer wait for the raw three-way
  spread cure. The transport boot-incarnation fence binds both connection
  directions (the acceptor answers an adopted primary IDENTIFY once) and an
  unknown existing incarnation never yields in a cross-connect.
- A joiner honestly waiting inside the formation barrier logs a typed
  still-waiting line on the existing liveness-refresh cadence (wait reason and
  elapsed time) and a rate-limited debug line when the gate's evidence
  advances.
- Five-node certification tooling: the GCP formation runner has a bounded
  `--runs N` certification mode (N pinned to the sealed consecutive count,
  refuses dirty sources or fingerprint drift, halts at the first failed run,
  writes a projection-only streak report), the analyzer classifies a
  generation retained uncompleted at teardown as its own failing invariant and
  reports completion across every generation, and
  `npm run analyze:formation-release-phases -- <report-dir>` prints the
  per-node W → handoff → release → READY timeline.
- Readiness planning owner: one node process owns exactly one readiness
  planning owner (the per-partition duplicates are gone), readiness evidence
  is generated per node and keyed on content rather than on observation
  time, membership-publication planning consumption has one owner, a
  completed readiness snapshot is reused across unclassified source changes
  instead of being rebuilt on every table write, and query routing served
  through the single owner stays open across the system-table cache's
  node-table lag window (heartbeat and lease lag are bridged at read time
  for routed reads only; a STOPPED or DISCONNECTED node row still vetoes
  stale-positive reuse immediately).
- Node liveness: every time-dependent node-liveness decision (ready lease,
  heartbeat staleness, connection state) is projected by one semantic owner.
- Membership epoch binding: a `replica_operations` row whose membership
  publication epoch is SQL NULL rehydrates as UNBOUND through one decode
  owner (it used to decode as epoch 0 and fail the dispatch epoch gate), and
  the current published epoch reads as unreadable rather than 0 before the
  first PUBLISHED publication.
- Critical placement: convergence is driven from authoritative owner
  evidence, the critical system-partition distinct-node invariant is defined
  and proved, the desired replication factor has one authority contract,
  every behaviour-changing desired-placement consumer converges, and a
  causal-trace tool names the first broken transition in a live formation.
- Release and CI tooling: the publisher streams its gate stage by stage and
  fails the mutation check early, the two `main` workflows carry distinct
  run names, `TAP_TIMEOUT_FLOOR` is a lane floor that never caps a declared
  test budget, and the MovieLens dataset fetch has a digest-pinned fallback.
- Release process: `npm run release:preflight` evaluates the release-exit
  facts and prints the exact tag commands; `npm run check:formation` is the
  local seed-starvation gate (five local node processes through schema
  admission, seed event-loop budget); `npm run health:formation` appends one
  formation-verdict record per run to a trend and the scheduled
  `formation-health` workflow runs it nightly on GCP; every live demo report
  carries a machine-readable `formationVerdict` with its causal chain. The
  digest-bound release row Quests, the seven local gate receipts and the
  release verification scenario producer were removed (`RELEASE.md`).
- Solver tooling (internal): `preflight`, `reattempt` and `rebase-epoch`
  verbs, a verifier-rejection repair amendment path, one override per
  logical run with a visible budget, observation-severity findings, new-code
  complexity admission scoped to each ratchet's trees, review delta
  manifests, in-process subtest receipts, and a harness scaffold.

### Changed
- Topology-operation safety: removing a FAILED or SYNCING replica succeeds
  through every removal writer; a replica operation that retires a source
  replica rests terminal only when the retired replica's ACTIVE service is
  gone from routing; a replica CREATE failure is published only after any
  created local PartitionService is non-promotable and unroutable.
- Operation ledger: the quorum-spread hold can no longer defer its own cure
  once a surplus placement occupies every distinct node; a disruptive
  self-move publishes one durable PENDING intent before waiting so dependent
  admissions cannot starve it.
- Release automation: npm publishing uses Trusted Publishing (OIDC) instead
  of a stored token; the GCP release runner wakes and stops itself around a
  tag push; `gh` is installed with the gate tools; the local push-gate test
  corpus retries a failed file once.
- Solver tooling (internal): landing review has one owner per subsystem with
  an immutable review envelope, and landing tolerates candidate diffs larger
  than the default child-process buffer.
- Solver tooling (internal): landing never commits source bytes outside the
  recorded attempt union, the pending step's pin is the single attempt base,
  another Quest's regenerated evidence is excluded from a capture, registered
  generated outputs are covered at landing when byte-identical to a fresh
  regeneration, and the evidence harness runtime accepts `--output`.
- Readiness planning under formation load: the planning snapshot owner no
  longer defers unboundedly on token status alone, the canonical readiness
  identity owner recognises its own normalised output, memo freshness is
  keyed on the publication version, and a snapshot lane still in flight at
  its deadline is classified as blindness rather than as an inactive cluster.
- Managed split of a user table under write load resumes its persisted plan
  instead of re-planning, a distributed write that fails on a participant
  surfaces the first failed participant in the admin envelope, and a joiner
  whose services cache missed a late row converges through the routing
  table.

### Fixed
- The formation-release GCP analyzer classifies a generation revoked by a
  valid disconnect after the authority began draining as teardown-truncated
  rather than stranded, and the reverted-control verdict reads the analyzer's
  real invariants.
- The three-node seed rebalance integration lane no longer sleeps its
  discovery window through convergence, and a closed-log commit race no
  longer raises a false "no durable progress" at teardown.
- `npm pack` output stays parseable: the hooks installer's prepare-lifecycle
  diagnostic moved to stderr.

## [0.1.1] — 2026-08-22

Maintenance release. First release published by the GitHub Actions release
workflow (the sole release owner going forward): the `v*` tag drives the full
release gate, checksummed SEA and Helm artifacts, the GitHub Release page,
Docker Hub images, and the first `lagrange-server` npm publication.

### Added
- Per-release notes on every release surface, generated from this changelog
  (`scripts/release-notes.js`): the GitHub release page carries the
  tagged version's section instead of boilerplate, the Docker Hub repository
  description gains an auto-updated per-release "Release notes" history, and
  the Docker image carries OCI provenance labels
  (`org.opencontainers.image.version/revision/created`). Tagging a version
  without a non-empty changelog section now fails the release in seconds.

### Fixed
- The admin dashboard's playback viewer read memory fields the recorder no
  longer emits, rendering a dead `0.0 MB` memory row and hiding capture
  errors for new recordings. The admin static viewer is now the single
  checked-in copy, shows process RSS and the reclaimable-cache-adjusted
  container working set, and the test harness ships that same file into every
  scenario bundle.

### Removed
- The broken `test:coverage` npm script (`tap test/` exceeds the OS argument
  limit; use the sharded `test:*` scripts instead).
- Helm chart publication of the unauthenticated admin listener. Chart-managed
  pods now bind admin to loopback and reject the original insecure values;
  REST `/health` and `/readyz` remain available through the Services.
- Seventeen dead symlinks under `scripts/` that pointed at an external
  tooling pack via an absolute path that never resolved.

## [0.1.0] — 2026-07-02

First tagged release. **Experimental / alpha** — Lagrange is a research-grade
distributed SQL database and compute-near-data runtime. It is substantial and
extensively tested, but not production-hardened; see _Known limitations_ below.

### Added
- Distributed SQL over Raft-replicated partitions with a shared execution path.
- Compute-near-data runtime: distributed functions and services co-located with
  the partitions that own the relevant data.
- Unified rebalancer with load-aware placement; runtime services are first-class
  rebalancer entities (a partition is a service).
- SWIM/Lifeguard failure detection, shipped default-on and unconditional.
- Postgres wire (`pgwire`) SQL endpoint, registered as a managed service (a bare
  node exposes 8080/8081/8082; the SQL endpoint is started on demand, not at boot).
- Deterministic/directed testing substrate: virtual clock, seeded RNG, and PCT
  scheduling for reproducible convergence and safety investigations.
- Distroless Docker image and single-executable (SEA) builds.

### Changed
- Package version set to `0.1.0` (was an internal `1.0.0`); user-facing
  `--version` output (admin CLI and node entrypoint) now reports the release
  version, guarded against drift by a test.

### Fixed
- Raft safety: same-index stale-commit (CL-040), vote double-vote TOCTOU
  (CL-041), and empty-log-term masquerade (CL-042).
- Node restart with a new IP: stale-seed-vs-canonical reconciliation and
  keepalive/pong severing on transport re-resolution.
- Durable node identity: a node started without an explicit `NODE_ID` now
  restores its persisted identity from the data directory on restart instead
  of minting a fresh UUID and refusing to start over its own durable state
  (identity mismatch). Enables orchestrators (Kubernetes, plain restarts) to
  restart nodes onto their volumes without pinning `NODE_ID`.
- SEA single-executable boot: dynamic imports with const-variable specifiers
  were silently left out of the esbuild bundle, so the binary could never
  boot the full system (`ERR_MODULE_NOT_FOUND`); the entrypoint and SQL
  runtime composition imports are now literal and bundled.
- Dockerfile `EXPOSE` corrected to the real listener set 8080/8081/8082
  (nothing listens on the previously exposed 9080).
- Test gating: in-process tests asserting bounded-time convergence
  (node-join SLO, multi-join formation) moved out of the blocking `test:ci`
  lanes into an on-demand statistical lane (`npm run test:convergence-probes`)
  — per-run bounded-time convergence is exactly the property this release
  documents as statistical and hardware-relative, so it cannot be a
  deterministic gate; the shard generator now supports (and existence-checks)
  such curated exclusions.
- Control-plane readiness: stored readiness snapshots could be reused while
  the live local query-transport verdict had flipped (transport evidence is
  live router state and advances no heartbeat watermark or cache marker), so
  owner-read participation could answer `ready` with the transport down — or
  keep deferring after it recovered. Snapshot reuse now rebuilds on local
  query-transport drift.

### Known limitations
- **Rolling-restart convergence is a statistical property, not a bounded-time
  guarantee.** Under a rolling restart the cluster settles into either a
  convergent basin or a slow/limit-cycle basin. *Eventual* stabilization is
  proven for the sole residual head (a monotone Φ-fixpoint over the real
  rebalancer kernel), but *bounded-time* convergence within any fixed window is
  a latency tail near its statistical floor. The measured per-run scenario-PASS
  rate is ≈25–33%; the release does not promise convergence by a specific
  deadline. See `docs/convergence-donewhen-metric.md`.
- **Safety is the hard floor and is never relaxed.** Every certified run holds
  the safety invariants (no data corruption, no unexpected node exit, no
  blind/stale oracle reads); convergence *latency* is the residual, not
  correctness.
- No autoscaler for load; scaling is operator-driven.
- Alpha surface: SQL coverage, wire protocols, and admin/CLI behaviour may
  change between `0.x` releases without migration guarantees.

[Unreleased]: https://github.com/psvensson/lagrange/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/psvensson/lagrange/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/psvensson/lagrange/releases/tag/v0.1.0
