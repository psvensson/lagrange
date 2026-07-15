# Wave 4 handoff: MovieLens preload topology gap

## Start here

The open parent Quest remains `movielens-three-way-affinity-demo`. Do not
create a competing product Quest until the owner-boundary diagnosis below has
been completed. Ask the Solver for its typed action:

```sh
node scripts/solve.js next --id movielens-three-way-affinity-demo
```

The last product commit before this handoff is `a49dda6d`. It contains both
residual Wave 4 owner fixes:

- `c1f6222d`: priority-recovery planning summaries invalidate their memoized
  projection when the cluster-wide topology source revision changes.
- `a49dda6d`: configured split defaults and explicit sparse table-policy
  overrides have one precedence owner without materializing inherited values.

Their merged-state deterministic guards passed immediately before the live
run:

- configured split-policy precedence: 3 files, 275/275 assertions;
- priority-summary inventory alignment: 1 file, 10/10 assertions.

Earlier Wave 4 commits already on `main` are `7fea9744`, `b54b0f0f`,
`e5562c82`, `c02885ca`, `7e436545`, and `85c1c7ad`. No push was performed.

## Live result

One local-process, five-node milestone run was made from merged `main`. The
cluster formed, but preload admission never reached the load lane. No ratings
were loaded in this run.

- Report:
  `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T19-20-14-034Z.report.json`
- Report SHA-256:
  `ac1e93a1b7a4da734f78fe8c5eb4ad4100e1f24c10631b8885f49bcfa1443adb`
- Immutable full node-state/log archive:
  `data/examples/service-data-affinity-demo-archive/handoff-live-2026-07-15T19-20-14-034Z.tar.gz`
- Archive SHA-256:
  `4bded458ff101d6324a2e0ee85cd427ebae7e7baa2d51b1987391171d4004fd7`

The structured failure is:

```text
snapshot_query_error=control snapshot observation failed (stale_usable):
cache_stale_watermark,partition_topology_gap
```

The report also records `criticalSystemTopology.ready=true`,
`totalSpreadGap=0`, zero cache-visible satisfied priority-recovery operations,
and `loadLaneAdmission.state=not_attempted`. All five node processes stopped
cleanly. Docker was not used; the only pre-existing container was
`lagrange-forgejo-runner`.

The evidence was ingested into the parent Quest. This is a live refutation, not
closure and not permission for an unchanged rerun.

## First violated invariant and concrete witness

`partition_topology_gap` is not abstract in this run. The authoritative
`tables` row for the system `logs` table entered a split workflow while the
control-snapshot cache did not have the same transition projection:

```text
table_name=logs
partition_count=1
active_partition_version=1
pending_partition_version=2
partition_transition_state=split_preparing
targetPartitionIds=logs_p_e1a6d1d9_left,logs_p_dcc350bd_right
```

At shutdown, the authoritative `partitions` table contains both version-2
children, while the seed logged a cache/authority divergence for the `logs`
table at `2026-07-15T19:19:22.421Z`. The snapshot gap is produced by
`AdminControlSnapshotCoverageGapEvaluation.hasControlSnapshotPartitionTopologyGap`:
it compares the table's active/transition metadata with locally cached
partition rows. Repair routing is owned by
`src/admin/admin-authoritative-repair-policy.js` and the snapshot-side caller
is `src/admin/admin-control-snapshot-node-view-projection.js`.

The low split threshold is currently configured globally for every demo node
in `examples/service-data-affinity/run-affinity-demo.js`, although the comment
and teaching goal intend to force the `ratings` table to split. With the newly
correct default-policy precedence, the same 1 MiB default now also selects the
large system `logs` partition during formation. This is a likely cross-owner
coupling, not yet a proved root cause.

## Required next investigation

1. Preserve the immutable archive identity above; do not cite the mutable
   `data/examples/service-data-affinity-demo/` directory in findings.
2. Read `solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-022.md`
   before proposing a freshness fix. It records prior refutations around
   `cache_stale_watermark`, snapshot coverage, and the active-gate handoff.
3. Trace the complete producer-owner-consumer chain before editing:
   table split transition -> authoritative tables/partitions rows -> CDC cache
   application -> snapshot topology-gap evaluation -> authoritative repair ->
   preload admission.
4. Discriminate between two architectural hypotheses with deterministic
   production-owner tests:
   - scenario-policy scope: keep the global default at the production value and
     persist an explicit 1 MiB sparse override only for `ratings`;
   - topology-repair convergence: a legitimate system-table split must make the
     table and partition cache projection atomic/current enough for the snapshot
     gap to clear.
   These are not interchangeable. The first prevents unrelated system-table
   churn in this teaching scenario; the second asserts that such churn is safe
   platform behavior. Prove which contract is intended before changing code.
5. Build a red deterministic reproduction through the real owner seam. Do not
   tune the 180-second preload timeout, suppress `partition_topology_gap`, trust
   stale evidence, or add a parallel freshness path.
6. If the diagnosis requires a source-changing owner-boundary contract, author
   a successor Quest linked to
   `solve/epics/service-data-affinity-placement.md`, then obtain exact and
   aggregate independent verification.
7. Do not rerun the live demo unchanged. A subsequent live run is only the
   one-time milestone check after the deterministic contract is green.

## Analyzer and workspace notes

The generic distributed-failure analyzer does not understand the compact demo
report shape and returned no phase evidence. The topology analyzer identified
the active-gate snapshot-coverage boundary but also reported missing evidence.
Use the immutable node archive and focused owner traces for this run; do not
interpret those analyzer omissions as absence of the failure.

The main worktree contains unrelated user/other-agent intent-to-add and
untracked Quest artifacts. Preserve them. In particular, do not reset or clean
the worktree, do not push, and verify status before any cherry-pick. Keep tests
serial and monitor CPU; no Spotify/Steam or stray demo processes were present
at handoff.
