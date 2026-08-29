# Formation barrier spread-cure live A/B: closure falsified

Date: 2026-08-25  
Quest: `formation-barrier-spread-cure-liveness`  
Base HEAD: `a00df079c5a2bea5e2143f46e2662f9f95f5d7b4`

## Verdict

The first fixed-versus-reverted local five-node A/B does **not** prove the
sealed 120-second formation-barrier claim. Both arms eventually reached READY
in both runs, but each arm suffered one real operation-ledger formation-barrier
timeout in two runs. The candidate must not land on this evidence.

| Arm | Run | Source fingerprint | Formation | Barrier timeout | Final result |
| --- | ---: | --- | ---: | ---: | --- |
| fixed candidate | 1 | `e8b5ed0f6e509921` | 58,189 ms | 0 | READY |
| fixed candidate | 2 | `e8b5ed0f6e509921` | 124,813 ms | 1 | READY after resume |
| reverted HEAD | 1 | `ac3f39ef3a1f1a8c` | 130,446 ms | 1 | READY after resume |
| reverted HEAD | 2 | `ac3f39ef3a1f1a8c` | 96,998 ms | 0 | READY |

The mean formation times (fixed 91,501 ms; reverted 113,722 ms) are not closure
evidence: N=2, the distributions overlap, and the fixed arm still crossed the
binding barrier. The candidate engaged but did not separate from the reverted
arm on the sealed outcome.

## Engagement and residual blocker

The fixed runtime did exercise the intended classification and cadence path.
Immediately before the fixed-2 timeout, priority partitions repeatedly logged
`winningGate=none` with `operationCreationRequired=true`, selected formation
cohort joiners, and emitted ADD/REPLACE cure moves. The terminal remaining
joiner timed out at `2026-08-25T07:51:56.482Z` after 122,629 ms, then resumed
and completed readiness about 0.94 seconds later.

Between approximately `07:51:20Z` and `07:51:57Z`, 36 recovery moves reached
execution and all 36 were skipped. Thirty-two were denied as
`local_mutation_unhealthy` with admission reason
`planning_snapshot_refresh_pending` and the reason set:

- `planning_snapshot_refresh_pending`
- `control_plane_write_unhealthy`
- `metadata_publication_degraded`

The other four had already-satisfied target counts. The fixed scheduler was
therefore live; the downstream mutation-admission owner was the binding lane.

## Systemic owner/history finding

This is an incomplete cross-owner protocol, not an isolated scheduler defect.

1. CL-028 (`56ee768716f76e6980bca2c97f2ea5e6af659d63`) established that
   priority-recovery actuation must bypass the two circular serve-grade
   dimensions, but only while the recovery lane is proven open.
2. Priority-recovery follow-up move minting later moved into
   `unified-rebalancer-follow-up-move.js` and marks these moves as background
   work.
3. The versioned readiness-planning owner deliberately replaces a token-stale
   strict snapshot with a fail-closed deferred snapshot. That deferred object
   sets recovery eligibility and `priorityRecovery.active` to false even when
   the earlier planning owner has just proven that a recovery operation must be
   created.
4. Planning consumes the cycle-owned `operationCreationRequired` capability
   and proceeds. Coordinator admission re-derives authority from the deferred
   readiness object, loses the capability, and vetoes the exact cure that would
   converge publication/readiness.

The repair must preserve the owner-issued, membership-epoch-fenced recovery
operation-creation authority through the planner-to-coordinator handoff. It
must not introduce a blanket priority-partition exemption, admit ordinary
background churn, relax substantive readiness failures without that authority,
or weaken topology/removal floors.

## Immutable evidence

Each run was serial on the same machine and port set, in an isolated detached
worktree. The fixed worktree was HEAD plus the canonical candidate diff; the
reverted worktree was exact HEAD. Each archive contains all five node logs.

| Run | Artifact | SHA-256 |
| --- | --- | --- |
| fixed-1 | `fixed-1/node-logs.tar.gz` | `f4e6ccb2fef1ac5ef0d76604c7c8b6d2f20046ab9087bff9fa4e4c59632b2a06` |
| fixed-1 | `fixed-1/formation-probe-runs.ndjson` | `0a0b606a4fb6f6045c031ce7e005a61dab28d441cfc724b47d18cbf16411b228` |
| fixed-2 | `fixed-2/node-logs.tar.gz` | `58c59a47976da875d483676d85fadb28a320dc56dd05e4822003166c059eea9c` |
| fixed-2 | `fixed-2/formation-probe-runs.ndjson` | `df6c6908e4e6adcb6a87195e0ccabc003c89f8019b27f0941675cb2cb1f9f0e8` |
| reverted-1 | `reverted-1/node-logs.tar.gz` | `bc5d568b1be96a71bf1d4b31e6cd8833dc98b1ed4c3a56bfce04819ec9867c8c` |
| reverted-1 | `reverted-1/formation-probe-runs.ndjson` | `3faa120ab01fa64ec762e966b635f2b12864dc336b72aa091647729ed4a68a83` |
| reverted-2 | `reverted-2/node-logs.tar.gz` | `d57f2aa20bed593eb9c41509385b4051e5ab622bd76e625e9781ddd18313dfc1` |
| reverted-2 | `reverted-2/formation-probe-runs.ndjson` | `ac4ff5dee200cafdeda5f98e5f63ac62fbf9267d67728164a7d8b354da80b802` |

The NDJSON files are append-only harness histories; the last record in each is
the run summarized above.
