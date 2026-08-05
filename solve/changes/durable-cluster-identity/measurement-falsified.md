# Measurement falsified: durable-cluster-identity (sealed 2026-08-05T06:06:22Z)

## The falsification

The sealed `doneWhen` (and both frontier metrics) reference
`probe: scenario-harness, scenario: durable-cluster-identity,
reportDir: test-output/reports, metric: priority`.

Probe contract (scripts/solve/probes/scenario-harness.js):
- Reads report JSON files under test-output/reports/ that contain a scenario
  entry named "durable-cluster-identity" (scenarioEntry / reportCoversScenario).
- `done` = the scenario passed in `consecutive` (3) recent measuring runs.
- The metric is a harness-produced report artifact, not derivable from
  deterministic in-process tests.

Facts:
1. No scenario "durable-cluster-identity" exists anywhere in test/distributed/
   or test/ (grep: zero hits outside solve/ bookkeeping).
2. test-output/reports/ contains no report covering the scenario; the probe
   returns invalidSample=true forever.
3. The quest's actual mechanism (mint a cluster_id at first seed bootstrap,
   persist it in rejoin hints + CONFIG-row + snapshot-catchup seam, reject
   mismatched joiners) is a deterministic in-process question per
   docs/steering/operational-ground-truth.md "Deterministic-first; a live
   statistical run is a LAST RESORT ONLY": mechanism, classification, and
   red-on-revert are deterministic questions answered in-process, never with a
   statistical run.
4. Hand-writing a report file to flip the probe is fake evidence (Core
   Must-Not #4: probes decide, not self-report).

## Conclusion

No honest measured move exists inside this seal: the only way to move the
sealed metric is to author and run an irreducibly-live distributed Docker
scenario as the iteration loop for a deterministic mechanism — exactly what the
operational ground truth forbids. The goal itself is correct; the measurement
apparatus is not. Successor quest (same statement, oracle-file doneWhen driven
by a deterministic evidence harness with recorded proof commands) carries the
work: durable-cluster-identity-v2.
