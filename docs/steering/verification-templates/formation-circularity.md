---
categories: [formation-circularity]
---

# Verification Template: Formation-vs-Steady-state Circularity

For changes to control-plane subsystems that other machinery depends on
DURING their own formation/move/recovery (the operation ledger, metadata
partitions, readiness services). See the recorded class:
circular-dependency-class-formation-vs-steady-state. Each item requires an
evidence path.

1. **Self-dependency inventory.** List every read/write the changed
   machinery performs THROUGH the subsystem it manages (op status writes
   into the ledger being moved; CDC of the op row through the moving
   partition; readiness reads through the recovering readiness store).
   For each: what happens during the window where that path is degraded?
2. **Re-drive starvation.** Level-triggered re-drives keyed on CDC/cache
   visibility of rows in the moving subsystem are STARVED exactly when
   needed — show the fallback that does not depend on the moving subsystem
   (retained snapshots, direct wakes, authoritative rediscovery).
3. **Formation-window clients.** What client-facing operations can arrive
   during the window (the demo's first CREATE TABLE), and do they wait
   under their existing budget rather than failing fast?
4. **Window arithmetic.** Measure/estimate the window end-to-end (moves x
   per-move cost + gaps + visibility propagation) against the tightest
   client budget that must survive it; state the margin.
5. **No bypass fixes.** The fix must not bypass the subsystem's own
   consistency machinery to break the circle (e.g. writing op status
   outside the ledger) — slower-but-correct beats a second source of truth.
