# Seed participant-release failure projection: V3 registry correction

## Binding

This additive correction is design input only. It supplements, without
rewriting, `seed-diagnostic-design-v3.md` at SHA-256
`f3fcf5c22571bc4388239637f77014da3d067f504e7d12a0a4f82580a64c5eb4`.
It authorizes no source, test, registry, metadata, timeout, or policy change.

## Exact correction

The new diagnostic observation owner proposed at
`src/node/participant-release-diagnostic-observation.js` participates in the
same existing `raft-rs-runtime-application-transaction` interaction as the
cutover owner, seed workflow, and participant-release client. Therefore the
eventual `test/shards/impact-contracts.json` change must register all three of
these added owner paths in both existing representations:

- In the top-level `raft-rs-runtime-application-transaction.owners` list at
  current lines 604-633, add:
  - `src/node/participant-release-diagnostic-observation.js`
  - `src/bootstrap/bootstrap-service-seed-workflow.js`
  - `src/node/participant-release-client.js`
- In `coupledPairs.raft-rs-runtime-application-transaction`, add the same
  three paths only to the existing
  `application-and-progress-transaction.owners` endpoint at current lines
  1539-1557.

The named witness
`test/bootstrap/seed-participant-release-failure-projection.test.js` remains
added to the top-level `tests` list and coupled-pair `witnessTests` list as V3
specified. Retain every current owner and witness, retain exactly the two
existing coupled-pair endpoints, and retain the separate `core-system-logic`
contract. Create no third endpoint, parallel contract, or diagnostic authority.

This correction also adds
`src/node/participant-release-diagnostic-observation.js` to the intended Quest
source scope. It does not change the V3 binary receipts, typed decision table,
test sequence, claim ceiling, or production behavior constraints.
