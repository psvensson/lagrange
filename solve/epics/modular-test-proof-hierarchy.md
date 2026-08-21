---
epicContractVersion: 2
id: modular-test-proof-hierarchy
roadmapRow: null
graduatesTo: null
---

# Modular test proof hierarchy

## Intent

Test proof cost should scale with a change's semantic blast radius, not with the
entire repository. The current post-push gate eventually runs nearly all 2,064
tests. On 2026-08-18, unrelated runner variance made marginal tests veto an
unrelated change. The governing rule is:

> Development proves the changed subsystem and its consumers. Releases prove
> the whole system.

The objective is not to make every subsystem small. A large subsystem is fine
when a local change selects only its owner, boundary witnesses, consumer cone,
and the safety spine.

## Proof levels

| Level | When | Target | Proof |
| --- | --- | --- | --- |
| L0 focused | coding | 5-30 s | exact owner and changed tests |
| L1 change | commit / PR | < 2-3 min | impact cone and safety spine |
| L2 subsystem | affected PR / merge | < 5-10 min | affected subsystem |
| L3 boundary | contract changes | < 10-15 min | producers and consumers |
| L4 release | release candidate | unbounded | complete product |

An integration defect may reach `main` and be caught by L4. Every escape must
improve impact mapping so that defect class enters the modular proof next time.

## Existing foundations

| Need | Existing owner |
| --- | --- |
| execution classes | `generate-test-{primary,resource}-classes.js` |
| change selection | `select-proof-cone.js`, `impact-coverage.json` |
| boundary consumers | `impact-contracts.json`, impact registry checker |
| proof manifests | `run-project-hardening-acceptance.js --manifest` |
| release scheduling | `full-gate.yml`, `release.yml` |

The missing axis is subsystem ownership. Primary and resource classes describe
how a test executes, not what product area it proves.

## Subsystem authority

Stage 1 sealed 22 exhaustive, non-overlapping subsystems for all 2,064 tests:

`admin-diagnostics`, `architecture-governance`, `bootstrap-membership`,
`cdc-metadata`, `cli-tooling`, `control-plane`, `convergence-topology`,
`distributed-harness`, `examples-e2e`, `pgwire-compat`,
`placement-rebalance`, `query-sql`, `release-packaging`,
`runtime-primitives`, `services-runtime`, `solver-tooling`,
`storage-partition`, `storage-raft`, `test-infrastructure`, `transactions`,
`transport-messaging`, `wasm-toolchain`.

Use exactly one primary subsystem per test. Model cross-subsystem proof through
explicit consumer relations rather than multiple tags. Three authorities stay
separate:

```
test -> subsystem       exhaustive test taxonomy
change -> subsystem     source owner/path taxonomy
boundary -> consumers  impact contracts and proof-cone evidence
```

The owner-debt classifier remains an audit oracle, not the subsystem owner: it
was built for modularization inventory and synthesizes unsuitable path owners.

## Fail-closed selection

An unclassified changed boundary reports `UNKNOWN IMPACT` and expands to a
conservative subsystem set. It never selects nothing. These invariants govern
the hierarchy:

1. Every test belongs to the release suite.
2. Every code change maps to at least one subsystem.
3. Every changed boundary maps to its consumer closure.
4. Development runs that closure plus the safety spine.
5. Only release candidates require the complete universe.

The union of release manifests is checked against the census so reclassification
cannot lose tests.

## Rollout

1. Seal subsystem classification without changing CI.
2. Add `test:safety-spine`, `test:changed`, `test:subsystem`, `test:release`, and
   an `--explain` dry-run. Compare proposed selection with the existing full
   gate and record any missed failure before cutover.
3. Switch ordinary CI to safety spine, impact cone, and affected subsystem /
   consumer closure. Local changes may stop at the proof cone; shared-owner or
   contract changes trigger broader levels.
4. Move the complete gate to releases; rotate subsystem and soak work nightly.

Stage 2 also builds timing observations. `timings.json` initially covered 201
of 2,064 tests and no unit tests. Ordinary runs should record sample count,
recent median, conservative duration, last duration, and canonical class IDs.
Timing evidence is observational; it never becomes a second classification
authority.

## Command contract

```
npm test                         impact-scoped developer proof
npm run test:changed             proof-cone selection
npm run test:subsystem -- <id>   subsystem proof
npm run test:release             complete suite
npm run test:all                 release-suite alias
```

Quest declarations name one owner, subsystem, and proof closure. Only release
Quests request the release gate. Nightly jobs rotate storage/Raft,
bootstrap/membership, services/WASM, SQL/pgwire, and rebalance/topology; their
failures create owned work rather than blocking unrelated changes retroactively.

## Decision log

- 2026-08-18: Adopted semantic blast radius as the ordinary proof boundary;
  retained the complete suite as release authority.
- 2026-08-18: Chose one subsystem per test plus explicit consumer edges, not
  multi-tagging or reuse of the owner-debt classifier.
- 2026-08-21: Required fail-closed unknown-impact expansion and census equality.
- 2026-08-21: Required explicit full `test:fast` and static proof before pushes
  until the modular gate is implemented and empirically validated.
