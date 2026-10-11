# Activation cycle round-twelve design evidence

## Scope

This packet supports design review only. Product source remains the unapproved
captured activation WIP. The feasibility script is a deterministic model with
supplied commit coordinates; it is not a Raft proposal, append, apply or
production startup witness.

## Subjects

- Round-eleven predecessor:
  `design-participant-release-activation-authority-cycle-round12-predecessor-819e4590.md`,
  SHA-256 `819e4590be60f90a2f1918f6db7899b516c68b7110f91775d1b6495565d5d612`.
- Independent REJECT:
  `review-activation-cycle-design-round1-independent.md`, SHA-256
  `5e602b16fac568165bacf2269eb2216108769ee443b57ef1f1bc5815f77148a2`.
- Exact captured product source: preservation snapshot
  `14fac7d6ef64881daa7a0d266a272b724dfe640a`; 67-path manifest SHA-256
  `7357539a7730f4a672d4a5f81b3b9812172225903839259962960bff3d4a9162`.
- Exact unchanged oracle log SHA-256:
  `aca296ecce3e3c3116749b902f3dea1746f02a44907ef721955e992268562ab7`.

## Actual seam inventory

These hashes identify the current unapproved source read to bind the design:

| Path | SHA-256 | Existing owner fact |
| --- | --- | --- |
| `src/bootstrap/seed-startup-session-store.js` | `7cff32913fbe8d8a77980492fce2f06bd8dfab17d6cec7c92483aa34d928ff88` | File-backed immutable storage-birth authority and startup invocation |
| `src/bootstrap/startup-workflow-store.js` | `1f92ee4bcb21c1c952836536f39c48f2007a18174e4955b0e4a843f4865cf3da` | Atomic startup record persistence; existing participant-release command projection |
| `src/node/participant-release-authorization-owner.js` | `d2845c0d78f30db22488569574d03db038f5a940bee55f3ae0732225e2d34af0` | Live capability admission; process tokens are not restart authority |
| `src/node/replica-handler-participant-cutover.js` | `1015f7292d92d7159c8e46dfb4ec25855c8928a633262f98c1b4b4b77f9ed2ef` | Current release sequencing and control-slot caller |
| `src/node/participant-release-lifecycle-retirement.js` | `8d72ec7e335d996b271487f8787ad6d4f35388e9abda01dbf1c0a5bad3ae248a` | Actual delayed retirement/replacement consumer |
| `src/partition/partition-participant-release-apply.js` | `b436f98dd01809fad4b83f49bd00ddd839a1331ee40382a298152f388dc3cf5d` | Replicated control transition owner |
| `src/partition/partition-participant-release-request.js` | `e0341be36060502f815e3f063df069cf182e168a0500998362fdc848ebaa018f` | Exact command proposal/readback owner |
| `src/partition/partition-participant-transaction-store.js` | `d5f34b7780615d7ebc9c8c119789fc63db37bb9d5a1d24de46a9f568173adda9` | Existing singleton pause/control/authorization row and CAS |

The proposed control claim and closure high-water extend the existing control
record. The conditional PAUSE/supersession fence extends the existing dependent
singleton row. No second store, coordinator, scheduler, cache authority or
volatile apply predicate is proposed.

## Evidence attribution

- Exact oracle: first post-ENABLE catch-up refusal, then control reservation /
  retirement progression failure, under one original deadline.
- Instrumented scratch: older authorization `b24ae48e...` repeats one exact
  RETIRE entry 219 times while a different current authorization `f1aa6015...`
  is RETIRED. This supports the delayed-old-target problem. It is not a RESERVE
  repetition and is not byte-identical product execution.
- Source inspection: current PAUSE happens before a durable control winner and
  distinct old PAUSE replay can advance the dependent generation.
- Round-twelve model: proposed transition feasibility only.

## Model command and result

```sh
node solve/quests/replicated-transaction-decision-and-apply/evidence/activation-cycle-round12-feasibility.mjs \
  > solve/quests/replicated-transaction-decision-and-apply/evidence/activation-cycle-round12-feasibility-result.json
```

The result contains 10/10 expected observations:

1. descriptor and exact command survive pre-PAUSE restart;
2. losing contender performs no dependent effect;
3. lost PAUSE and RESERVE results replay exact identities;
4. an immediate exact old PAUSE replay is inert;
5. delayed A retirement resolves after distinct A/B/C cycles without changing C;
6. delayed A PAUSE cannot alter a same-dependent successor;
7. supersession ordered before delayed PAUSE makes PAUSE inert;
8. lost supersession result replays the exact entry;
9. same fixed cohort catches up without a new cycle; and
10. changed incarnation refuses rather than masquerading as catch-up.

The script deliberately does not import product apply functions. Product proof
must later show the same schedules through authority issuance, operation-port
dispatch, Raft commitment, actual SQLite rows, restart/compaction, current
consumer and controlled successor publication.
