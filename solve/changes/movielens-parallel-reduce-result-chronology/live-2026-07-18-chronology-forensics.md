# Live chronology forensics — 2026-07-18

## Immutable report

- Report:
  `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json`
- SHA-256:
  `d51879c0e89efb2ee8b9442d2ea3d86037bad550ff74cbc900d534cfaadcd49d`
- Producer/fidelity: `service-data-affinity-demo` / `live`
- Terminal error:
  `learned-affinity stalled with no observable progress for 300s`
- Formation and preload were both admitted. The formation snapshot was
  quiescent for 63,916 ms with priority/total spread gap 0, no missing
  leaders, and no effective in-flight work.

The active cluster directory is the stopped state from that report. A future
live run must let `run-affinity-demo.js` archive it before the normal wipe.

## Runtime engagement

The runtime-service chain engaged on both replicas:

- `data/examples/service-data-affinity-demo/node-0.log:12066-12074` creates and
  starts `svc-movielens-topn-r1`.
- `data/examples/service-data-affinity-demo/node-3.log:1388-1396` creates and
  starts `svc-movielens-topn-r2`.
- `data/examples/service-data-affinity-demo/node-0.log:12392` is the first
  persisted `service_partition_access` row.
- `data/examples/service-data-affinity-demo/node-0.log:16111` is a later
  persisted attribution row at `2026-07-18T11:19:05.305Z`.
- `data/examples/service-data-affinity-demo/node-0.log:16182-16184` is the last
  persisted exact-result update at `2026-07-18T11:19:09.486Z`.

All three stopped replicas of `service_partition_access-p1` contain the same
two base-service rows. The seed copy contains:

| node_id | service_id | access_json | published_at |
| --- | --- | --- | ---: |
| `aa81e876-7cf3-44a3-9bf9-9e1824397d33` | `svc-movielens-topn` | `{"tbl-67f4035f1e5f9fd2a0245f5d35ff9de9-p1":{"r":4,"w":0}}` | 1784373534614 |
| `6a2efa1d-f0c1-4fb6-94b7-d83999f565a4` | `svc-movielens-topn` | `{"tbl-67f4035f1e5f9fd2a0245f5d35ff9de9-p1":{"r":4,"w":0}}` | 1784373545287 |

This rules out an inert runtime-service rebalancer, missing service identity,
an attribution publisher that never starts, and a leader-only attribution
write that failed to replicate.

## Final snapshot at report time

Replaying the production evidence projector with `Date.now()` fixed to the
report timestamp `1784373570426` yields:

```json
{
  "placementScore": 2,
  "bestScore": 2,
  "localityRatio": 1,
  "assessment": {
    "complete": false,
    "partialReplicaCount": 2,
    "mergeCandidateCount": 20,
    "identitiesCurrent": true,
    "partialsFresh": true,
    "partialsBounded": true,
    "resultFresh": false,
    "placementOptimal": true,
    "resultCorrect": true
  }
}
```

The two coordination rows were:

| slot | replica | computed_at | lease_expires_at |
| ---: | --- | ---: | ---: |
| 1 | `svc-movielens-topn-r1` | 1784373545267 | 1784373574279 |
| 2 | `svc-movielens-topn-r2` | 1784373557905 | 1784373580225 |

The result row had `computed_at=1784373549486`. It was therefore newer than
the slot-1 partial used by the coordinator but older than slot 2's later
periodic refresh (`1784373549486 < 1784373557905`). Every other completion
predicate passed.

The stored result was independently compared with a fresh grouped aggregate
over all 100,000 rows in the stopped ratings parent replica using the
production `rankMovieQuality()` function. The ten movie ids and scores match
within the production `1e-9` tolerance:

`318, 64, 483, 50, 12, 408, 603, 169, 98, 127`.

This is evidence of a result/partial chronology-observation gap, not permission
to remove result chronology. A correction must let the runtime owner identify
the complete partial snapshot used for a result so later periodic partial
updates cannot retroactively invalidate that already-sealed result.

## Stopped-state hashes

The row content currently lives in WAL files. Their SHA-256 values are:

- attribution WAL:
  `7f172cf901b04d1402896d40160b4bf644cdac19410abe98e4bba38564874ec9`
- reduce-slot WAL:
  `1f00845888cf05888cf6ae71098eba1e07604adfbb02838f6c0d34a73c311400`
- exact-result WAL:
  `5f4cd0b53e6036411c05a37a2462ad930ab375f8f77d2d3c79324f14a1b24ec9`

