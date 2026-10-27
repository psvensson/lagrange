# Service-instance schema: accepted for bounded continuation

Author review under the operator's 16 October 2026 instruction to use this
ChatGPT session as reviewer between stages. Verdict: ACCEPT the schema,
registration and cache-projection increment for continued WIP development.
This is not independent verification, terminal Solver landing, global-static
acceptance, a main merge, or release certification.

## Exact candidate and change boundary

Measured source: 00bdffab45bb834ecf1b252c0e429bd9b74f44e5.
Parent: ed4707a2e48a13f78a9f752f69be12f245ee7c23.
Tree: aba7d140c0f57fe3e635692c21cc12925e7a2553.
Branch: work/rs-raft-creation-selection-20261016.
Source subtree: 5eaead78b8851c83b38b29b544d691c5896bb2ac.
Test subtree: 3b6e4128d63aa36f739d697cfdad50d5273334d4.

Six production paths register service_instances through the existing table-name,
bootstrap schema, initial partition/replica and CDC policy owners. There is one
retained service_id TEXT primary key, explicit NOT NULL on all three columns,
and no authority-producing default. The primary-key descriptor derives its
answer from the schema; the existing cache consumes that answer. Internal
hydration/propagation is enabled; external CDC and readiness authority are not.
Neither selection nor resource reservation/serving permission is implemented.

The initial four-case registration witness preceded production changes and
failed against missing registration. Review added two further cases observing
real per-replica table DDL and SystemTableCache projection. Those two cases are
not retrospectively described as part of the first baseline. The complete
six-case test was frozen before the candidate and source-only mutation runs.

## First local-lab measurements

| Treatment | Actual host | Result | Whole-file time |
| --- | --- | --- | --- |
| Candidate schema and cache neighbors | tv-dator | 6 files pass, 398 reported assertions | schema 632 ms |
| Existing install-command positive control | adam-laptop | 6 reported assertions pass | 601 ms |
| Creation-selection capability baseline | adam-laptop | 0 pass / 9 failed cases: selection method absent | 755 ms |
| Null-key source-only negative | tv-dator | 3 pass / 3 intended failed cases | 617 ms |

The six passing files include cache selection (217), artifact schemas (26),
WASM metadata (95), debug metadata (33), latency topology (21), and the new
service-instance schema test (6). These are runner-reported counts including
parent entries where applicable, not 398 distributed scenarios.

The planner chose TV for all six files; Lenovo was offered but unnecessary.
No controller fallback executed tests. Retry remained zero. TV's automatic
calibration was 1.6 for the candidate and 1.4 for the mutation, so this is a
same-host semantic comparison, not identical scheduling or a speed claim.
Thermal checks passed. Adam's guard waited at CPU 77 C and proceeded after
41 C. No deadline, thermal policy, retry, threshold or admission rule changed.

## Negative review and next capability boundary

Mutation 47af4e6810d4af1715571a5b4c198b063f9e8b25 changes exactly one source
line: remove notNull from the service_id schema entry. It is retained only on
proof/rs-raft-instance-schema-null-key-20261016. Candidate/test bytes otherwise
remain unchanged; the product branch was never replaced with the mutation.
The same test detects the altered schema, actual null-key acceptance by the
generated SQLite DDL (Missing expected exception at the null insertion), and
the missing NOT NULL bit in real per-replica DDL. Name/replica registration,
CDC policy and cache-projection controls still pass. This is an engaged
semantic negative, not a missing symbol, setup failure, cancellation or timeout.

Creation tests now get past production schema setup and the existing INSTALL
owner, reaching f.primary.selectConsensusInstance is not a function. These are
nine failures at one absent capability, not nine newly found protocol defects.
No successful selection/resource CAS, replay, serving grant or retirement has
been observed. The original nine oracle assertions were not weakened.

## Evidence bindings

Private bridge issue 24, request d65d42fcc48f47e3807cdd56ce7313c6,
COMPLETE 2026-10-16T12:51:43Z, exit 0. Request SHA256:
e0f84b0c8de19d24352e1569d867a999c7bdd776a6ae3ef870539c0e1a2d3da9.
Executor log 1996 bytes, SHA256:
9c7a289ee5da6cb6e3ef9e827787946b08d86b1c41b91925e433a18e484cdd4d.
The complete returned candidate log was copied and independently rehashed.

Private issue 25, request 6f1de298e50447abb79618f44fe19581,
COMPLETE 2026-10-16T12:53:12Z, exit 1. Request SHA256:
35779aa1206fd0cb107251af6caf9450324ffe3aab514b9200a0f73e7ca661ae.
Executor log 12506 bytes, SHA256:
a5a1fbb0372f157d661c929a1f3c67ad8cc2351a16431401ac77ed6ebbb06259.

Private issue 26, request da89760e52074be0a2e5dba8fbe8a455,
COMPLETE 2026-10-16T12:54:47Z, exit 1. Request SHA256:
c3b8e232948a00480a7ba5c22d79c1869c3a8dfffce9b2d85296ccd7ad1aa65e.
Executor log 8894 bytes, SHA256:
3ea8674e664b0697a577ebb6d5e0f3f52b4f5bccb09dbc06e2cc1a3a4eca99f7.

Evidence requests in private issues 28/29 and 30/31 read the negative and
creation logs in two bounded chunks each. All four completed; their full
returned text was inspected, but those complete raw logs were not independently
rehashed/copied here. Redacted text need not share raw byte hashes. Native
per-case archives remain with the local executor. All three source jobs are
terminal; none was rerun merely to obtain green.

## Publication, static checks and limits

Publication-only Actions run 38903246326 preserved the exact patch on real
remote ancestry and verified a non-force branch update. Artifact 12046862295:
ZIP SHA256 92222257655140f01179cb1e93a2a3fa72f9d46a5779839515db38754c782d57.
All six manifest members, the raw commit, parent/tree, exact local patch and
all twelve postimages were independently verified in the cloud. Patch SHA256:
18c7849bb3f1806169c508d4b81fce617de1b31ec745abd4a2d9a112f725ce94.
This proves publication identity, not behavior. Local diagnostic ancestry is
explicitly distinguished in SCHEMA-STAGE-REVIEW-20261016.md.

Scoped lint, canonical test metadata/import-graph refresh, impact-contract
validation (63 contracts, 34 coupled pairs), shard validation and source
whitespace passed. Full global owner-debt regeneration, static/corpus gates
and larger creation/genesis receipts remain open. The prior analyzer heap
failure is not waived. No limit was raised or green gate fabricated.

The next change belongs to ServiceDefinitionsOwner and its existing gateway/CDC
interaction: exact retained row CAS, durable original-request outcomes, bounded
decision history/resource slots, immutable definition binding and successor
serving exclusion. Canonical service identity and revision content must come
from their existing owners, not new copied hashing or ad-hoc catalog reads.
The production selection/resource methods remain unimplemented at this checkpoint.

This component stage does not certify healthy full-cluster startup, added-table
startup timing/resource cost, actual RF3 replication, process-loss recovery,
genesis, snapshot installation, seed-loss or physical multi-host consensus.
Main, shared staged work, other implementation lanes and controller policy were
not modified by this lane. Existing release holds remain in force.
