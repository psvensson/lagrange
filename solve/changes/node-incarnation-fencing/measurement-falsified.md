# Measurement falsified: node-incarnation-fencing

Identical defect to its parent quest (durable-cluster-identity, EXHAUSTED
2026-08-05): the sealed `doneWhen` and both frontier metrics reference
`probe: scenario-harness, scenario: node-incarnation-fencing`, and no such
distributed-harness scenario exists anywhere in test/ (grep: zero hits outside
solve/ bookkeeping), so the probe returns invalidSample=true forever.

The mechanism under seal (locally persisted monotonic boot incarnation,
propagation through the control-plane publication path, receiver-side fencing
at the watermark check / missing-row upsert / WebSocket identification slot)
is deterministic in-process work. Per
docs/steering/operational-ground-truth.md "Deterministic-first", a live
distributed scenario is the wrong iteration loop for mechanism, refusal
classification, and red-on-revert proof.

Successor quest: node-incarnation-fencing-v2 (same statement and constraints,
oracle-file doneWhen driven by a deterministic evidence harness with recorded
proof commands).
