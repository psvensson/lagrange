# Live-run ground truth: the over-target/MODE-B root is FIXED, but the demo is still flaky via a DIFFERENT root

Session 2026-07-08, HEAD `33e0026d`. Three fresh live runs of
`examples/service-data-affinity/run-affinity-demo.js` (5-node local-process
cluster, MovieLens-100k), to re-establish the demo's binding blocker — the last
MODE-B attribution (memory s12) predated the accumulated fixes and the only
on-disk demo artifact was stale (Jul 2). Disk forensics over
`data/examples/service-data-affinity-demo/node-*.log`.

## Why this run was needed
The over-target quest's ROOT fix (`c78833f0`, row-op-linked
`drainPhaseReplacementCredit`) is already shipped, wired into the move-planner
ADD-suppression guards (`move-planner-move-calculation-methods.js:563,628`), and
DT-green (`in-flight-aware-drain-phase-replace-credit.test.js` 10/10;
`dt6-…-interlock-deadlock` 5/5). Memory s12 nonetheless named MODE-B (self-move
thrash → partition-blind interlock → `[2/4]` provisioning rejection) as the
demo's binding blocker with THIS quest as the lever. Since `c78833f0` predates
s12 and more fixes landed after (`fba0b477`, `c7a3bf19`, `a79b3728`), the live
state was unknown. "green-DT ≠ live" — so we ran it.

## Result matrix (3 runs — trap-6 "N runs = N modes" confirmed)
| signal | run1 | run2 | run3 |
|---|---|---|---|
| phase reached | [4/4] | [4/4] | **[2/4]** |
| outcome | **converged** | **STALLED** | **FAILED** |
| elapsed | 3.2 min | 5.2 min | ~4 min |
| `attributionRows` | 0 | 0 | 0 |
| service `top10` / replicas placed | 10 / 2 | `[]` / 0 | — / — |
| MODE-A `cluster_member_unhealthy` | 0 | 0 | 0 |
| `DEFER_ADD_OVER_TARGET` (over-target mint) | 0 | 0 | 0 |
| actual 4-voter overshoot | 0 | 0 | 0 |
| self-move interlock rejections | 238 | 76 | 233 |
| spread-driven ADD deferrals | 189 | 69 | (churn) |
| voter-ready-60s promotion timeouts | (low) | 4 | 13 |
| control_plane_publications replica failures | — | 1 | 6 |

## Conclusions

### 1. The over-target / MODE-B accounting root is FIXED and clean LIVE (3/3)
`DEFER_ADD_OVER_TARGET` = 0 and actual 4-voter overshoot = 0 in ALL THREE runs.
`c78833f0`'s row-op-linked credit is effective in the live demo, not merely
DT-green. **Do NOT build a new over-target/self-move accounting fix — that root
is closed.** MODE-A is likewise gone (`cluster_member_unhealthy` = 0, 3/3;
`a79b3728` holding).

### 2. BUT the demo is NOT reliably green — 1/3 converged, and the binding failures have a DIFFERENT root
- **run2 ([4/4] stall):** a control-plane replica (`control_plane_publications-p1-r6`)
  **failed to become voter-ready within 60000ms** → *"service_definitions
  partition service not found; runtime-service owner … inert"* (×4) → the
  `svc-movielens-topn` service attempted placement 26× but got 0 voter-ready
  replicas → `replicas=0` for the whole 300s watch → STALL.
- **run3 ([2/4] fail):** **6 control_plane_publications replica failures + 13
  voter-ready-60s timeouts** → *"Insufficient admissible provisioning targets for
  initial table partition"* → *"Initial table partition provisioning failed"* →
  the ratings CREATE TABLE never completes → the demo's admin-WS request times
  out → abort.

Both failures share a **control-plane replica voter-ready-60s promotion-timeout**
signal that starves the healthy/admissible node set — cascading into either
provisioning failure (`[2/4]`) or inert runtime-service placement (`[4/4]`). This
is a formation-stability / replica-promotion root, NOT the over-target accounting
and NOT MODE-A.

### 3. Residual self-move interlock churn persists (76–238) but is SECONDARY
The partition-blind self-move interlock still fires heavily, and spread-driven
count-increasing ADDs still defer (*"no count-neutral REPLACE pairing"*, 69–189).
This churn is real but is not the decisive binding failure in the two failed runs
— the voter-ready-60s promotion timeouts are. Consistent with the quest's own
note that the over-target 4th voter is a churn/cleanliness transient, "NOT the
demo's binding blocker."

### 4. `attributionRows=0` in ALL THREE runs — a demo-FIDELITY gap
Even in the converged run1 (service ran, `top10` fully populated),
`attributionRows=0`. The affinity thesis is meant to be attribution-driven
(`service_partition_access`); with 0 rows the demo falls back to "all ratings
partitions" (4/5 nodes) as the data-node set, so run1's "convergence" does NOT
demonstrate attribution-driven affinity. Memory s12 point #3, now a top demo
fidelity gap.

## Recommendation — the MODE-B pivot
"Continue with MODE-B" resolves to: the MODE-B/over-target accounting root is
**already fixed and live-clean** — there is no accounting fix to build. The
demo's actual, current binding blocker (2/3 failed) is **control-plane replica
voter-ready-60s promotion timeouts** (`control_plane_publications` learners not
promoting within 60 s) starving the admissible node set. That is a new,
separately-owned root (formation / raft learner-promotion latency under load),
NOT this quest. Secondary: `attributionRows=0` (affinity runs on fallback) and
the residual self-move interlock churn (cleanliness).

**This quest (over-target accounting) is effectively DONE** — fix shipped +
DT-green + live-clean (0 overshoot 3/3) — and should be closed SOLVED on its
churn-reduction scope. New work should target the voter-ready-60s promotion
timeout (a fresh diagnosis) and the attribution feed, not the over-target
accounting.
