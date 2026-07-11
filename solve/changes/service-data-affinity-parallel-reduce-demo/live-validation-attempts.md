# Live validation attempts — 2026-07-11

Command for both attempts:

```sh
node examples/service-data-affinity/run-affinity-demo.js
```

Neither attempt reached the service deployment or any new parallel-reduce
code. They are non-measurements of the Quest's live observable.

## Attempt 1 (started 16:37:07Z)

- all five nodes became active;
- formation settling made two completions, then reported one operation
  unchanged for 120 seconds;
- the runner emitted `Control plane settling STALLED ... proceeding anyway`;
- the first MovieLens load request timed out in `AdminWsClient`;
- the runner stopped the cluster and exited 1.

The runner printed an archive path before attempt 2, but its lexicographic
`ARCHIVE_RETENTION` cleanup immediately removed the timestamped archive in
the presence of older named `run-gap*`/`run-leg*` archives. This attempt is
therefore captured here from the runner's terminal output rather than cited
to a mutable path.

## Attempt 2 (started 16:42:28Z)

- all five nodes became active;
- formation settling reached its three quiet polls;
- the first MovieLens load request again timed out in `AdminWsClient`;
- the runner stopped the cluster and exited 1.

The post-run cluster directory was preserved as:

`data/examples/service-data-affinity-demo-archive/run-2026-07-11T16-46-00-000Z.tar.gz`

SHA-256:

`5df13454b7a3014195f230b1b5b82e4812a8875b43d9c83886e2261b58278456`

The preserved seed log ends with repeated `message-router` reconnection
failures to the stopped peers. Those shutdown lines do not explain the
admin write timeout; the binding fact for this Quest is narrower: twice,
the live cluster failed before ratings creation/loading and before the
runtime service definition was inserted.

## Verdict

Per the live-refutation/two-strikes rule, a third unchanged demo run is not
an honest next move. Deterministic guards can validate the new shard-slot,
snapshot, lifecycle, attribution, and evidence mechanisms, but the Quest
must not claim live closure until the pre-existing cluster write-path
precondition is restored and the demo reaches its affinity A/B observable.
