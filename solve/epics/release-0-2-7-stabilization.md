---
id: release-0-2-7-stabilization
status: open
proof: certification
roadmapRow: RM-0.2.9-stable-core-completion
graduatesTo: solve/specs/release-0-2-7-stabilization/requirements.md
doneWhen:
  probe: scenario-harness
  args:
    scenario: release-0-2-7-stabilization
    consecutive: 1
    metric: failed
    certification: true
quests:
  - release-0-2-7-core-runtime-and-semantics
  - release-0-2-7-release-surface-and-packaging
  - release-0-2-7-docker-context-and-publish-speedup
authorizes:
  - src/query
  - src/partition
  - src/raft
  - src/message-group
  - src/transport
  - src/bootstrap
  - src/runtime
  - src/service
  - src/cli
  - src/diagnostics
  - src/admin
  - src/config
  - src/live-query
  - scripts
  - test
  - vendor/raft-rs-wasm
  - wit
  - charts/lagrange-node
  - .github/workflows/release.yml
  - .dockerignore
  - Dockerfile
  - package.json
  - package-lock.json
  - knip.json
  - architecture
  - docs
  - examples
  - README.md
  - RELEASE.md
  - CHANGELOG.md
  - solve/specs/release-0-2-7-stabilization
  - solve/epics/release-0-2-7-stabilization
  - solve/changes/global-owner-debt-inventory/inventory.json
---

# Stable-core completion for 0.2.9

This existing stabilization epic continues from the released 0.2.8 baseline.
Its original 0.2.7 identity, work-package IDs, Quest seals and evidence remain
unchanged; the user-approved next completion milestone is **0.2.9**. This is a
current planning correction, not a new release, runtime fix or acceptance claim.
Existing subsystem owners retain their contracts.

## Current coordination summary

| Field | Current observation |
| --- | --- |
| Checked | 2026-10-29 against `main` / `v0.2.8` at `add04d91a8ef8d9300a6f9cb1a23003ec4a61cd7`; governing rules/router reviewed 2026-10-28 |
| Released baseline | [0.2.8](https://github.com/psvensson/lagrange/releases/tag/v0.2.8), following the raft-rs/TX1/FreshMG/SN1 foundation in 0.2.6 |
| Publication history | [CHANGELOG.md](../../CHANGELOG.md) records 0.2.7's npm-only partial publication after Docker context failure and 0.2.8's forward repair; neither fact closes every Q01-Q18 obligation |
| Scope authority | User-approved 2026-10-29 single version sequence: residual stable-core obligations belong to 0.2.9; service expansion/Scenario A comparison to 0.4; pilot qualification to 0.5. Community maintenance and edition boundaries remain unchanged |
| Acceptance owner | [Requirements and work packages](../specs/release-0-2-7-stabilization/requirements.md); this summary indexes the existing contract without changing its predicates |
| Recorded component completions | The three linked Quests have original solved terminal records: [core/runtime](../quests/release-0-2-7-core-runtime-and-semantics/log.ndjson), [release surface](../quests/release-0-2-7-release-surface-and-packaging/log.ndjson), and [Docker/proof repair](../quests/release-0-2-7-docker-context-and-publish-speedup/log.ndjson). Their bounded claims do not automatically establish full epic acceptance |
| First directly observed publication blocker | The [0.2.8 publish job](https://github.com/psvensson/lagrange/actions/runs/40859657429/job/123399556166) returned `Forbidden` on Docker Hub description PATCH; its later overview check validates local rendered content, not remote synchronization. Q16 remains an owed publication obligation |
| Public-path evidence boundary | The [named scenario](../../test/distributed/scenarios/release-0-2-7-stabilization.js) currently checks local comparator/parser/route/receipt/rendering behavior. It does not supply Q17's public transactions, remote failure/recovery or installed-consumer journeys |
| Residual census | Reconcile Q10/Q11 retained-log coverage and Q14 transaction/read/retry claims with current source and original evidence. The [capability page](../../docs/current-capabilities-and-limitations.md) still excludes control-plane/message-group snapshot compaction. A documented partial-commit limitation requires source/evidence reconciliation; client uncertainty alone is not proof of partial commit |
| Unmerged work | [Scenario A PR #148](https://github.com/psvensson/lagrange/pull/148), observed at `3b737ce7e1c818194f8188297dd175f6135e271e`, contains relevant SQL/transaction/replication repairs. Its older PR-body proof count and earlier lab receipts are not current-head qualification |
| Current unit | Documentation and release-allocation reconciliation. No 0.2.9 runtime candidate or certification run is created by this change |
| Next action / owner | Release integration owner re-censuses outstanding Q01-Q18 obligations against 0.2.8 and relevant WIP, routes the Q16 permission/readback defect to the publication owner, and prepares genuine Q17 composed evidence without broadening prior component seals |
| Continuation | Next implementation and physical certification are not submitted by this documentation change; the release integration owner retains continuation |
| Release state | 0.2.8 artifacts are published experimental alpha. 0.2.9 is the current planned milestone and remains unreleased; full stable-core/public-path acceptance is not inferred from artifact publication |

The [original verification dossier](release-0-2-7-stabilization/verification-2026-10-28.md),
[Docker Hub finding](release-0-2-7-stabilization/dockerhub-readme-verification-2026-10-28.md)
and [planning review](release-0-2-7-stabilization/planning-review-2026-10-28.md)
remain dated evidence. Current implementation and later observations supersede
their status snapshots without rewriting those records.

## Work sequence

Detailed scope, owner paths, falsifiers and acceptance belong only in the
[specification](../specs/release-0-2-7-stabilization/requirements.md#work-packages).
The IDs below are work-package IDs, not fabricated Quest records or seals.

| Package | Outcome | Sequence / existing home |
| --- | --- | --- |
| Q01 | Preserve or refuse mutation expressions | First correctness repair; query parser/admission/rendering |
| Q02 | Enforce or refuse declared schema constraints | Query/provisioning interaction; serialize shared parser edits with Q01 |
| Q03 | One storage-compatible order for split and routing | Successor under split/merge owner; preserve solved numeric-key work |
| Q04 | Protect internal cluster routes on HTTP ingress | Bootstrap/control ingress owner; independently actionable |
| Q05 | Ship a complete executable runtime | Existing release/build owners |
| Q06 | Make npm service authoring work from the installed package | Service compiler and npm packaging owners |
| Q07 | Repair actual shipped dependency trees | Source, packed consumer and image evidence; coordinate with Q05/Q06 |
| Q08 | Bound diagnostic history | Existing cutover RS2; durable-store owner |
| Q09 | Bound inbound admission and eliminate recursive exhaustion | Bounded successor to existing liveness/captured-extent contracts |
| Q10 | Complete safe retained-log coverage | Data leaders/followers, control-plane and message-group owners; Q11 supplies observation |
| Q11 | Surface snapshot failure and retained-history debt | Existing cadence and diagnostics owners |
| Q12 | Retain attributable release-proof evidence | Existing proof authority; preserve valid content-based reuse |
| Q13 | Reconcile native build provenance | Existing binding/build manifest owner |
| Q14 | State and rehearse the read/retry/upgrade envelope | Existing capability and pilot-envelope owners |
| Q15 | Provide a tested private deployment profile | Existing chart/image owners; no enterprise feature expansion |
| Q16 | Align release metadata, verified Docker Hub README and consumer journeys | Existing publication owner; follows Q05-Q07/Q13-Q15 |
| Q17 | Certify one composed candidate and published-artifact journeys | Integrates Q01-Q16; release gates remain separate and mandatory |
| Q18 | Simplify touched decision paths and route residual debt | On-contact work; broad convergence remains with its existing epic |

One writer owns each changing interaction. These packages are work within the
single 0.2.9 milestone, not independently scheduled release tracks. Shared
parser/runtime/package edits integrate serially. Each residual implementation
starts from its existing or explicitly superseding bounded Quest with a
measuring red witness. Reuse or supersede existing records explicitly; never
rewrite their seals or infer that an old OPEN board entry means landed code
is absent. The [ownership map](../specs/release-0-2-7-stabilization/requirements.md#existing-work-and-scope-boundaries)
identifies the relevant predecessors.

## Release acceptance

Q01-Q16 require their declared repair, proof or explicit support-envelope
decision; documentation alone cannot close a behavior defect. Q17 binds applicable
pre-publication evidence to one integrated candidate and exercises the genuine
public service path. Normal release authority then permits publication; Q16
confirms registry artifacts before final epic closure. Q18 requires narrow
cleanup and durable routing of broader
debt, not a whole-project rewrite or zero historical complexity violations.

The named scenario now exists, but its local checks do not provide Q17's full
composed witness. Q17 must bind `recordedLog` to its actual append-only
certification Quest log and produce genuine archived terminal evidence,
including publication confirmation. The production-path scenario, recording
binding and report remain obligations of Q17; no synthetic Quest, pass receipt
or manual green oracle is created here. Existing exact-candidate
release/corpus gates and the
cutover's separate physical-certification claims retain their own authority.

## Decision log

- 2026-10-28: User selected 0.2.7 stabilization after the 0.2.6 audit. Verified
  current source and repeated the bounded negatives before planning repairs.
- 2026-10-28: Keep the release epic compact; multi-Quest acceptance lives in
  the linked spec. Use the current Solver schema/template and `board`/`probe`
  commands; the older epic README's v2/`overview` guidance conflicts with the
  executable owner and is recorded as documentation debt in the dossier.
- 2026-10-28: Preserve TX1/SN1/FreshMG and existing owner boundaries. No new
  consensus path, duplicate retry ledger, generic TTL deletion, secondary-index
  programme, broad SQL expansion, commercial backup/PITR or production claim.
- 2026-10-28: All implementation packages remain unsealed. The user authorized
  this epic and verification; this change does not publish version 0.2.7.
- 2026-10-28: User requires Docker Hub to receive the current README reliably.
  Q16 now requires automatic release/documentation synchronization, metadata-edit
  permission checks, remote content verification, stale-write prevention and
  honest failed/pending status. Updating the plan does not update the live page.

- 2026-10-29: User approved one ordered, fully versioned programme and its
  implementation in the planning documents. Preserve this epic's stable 0.2.7
  identity and all recorded seals/history; assign its residual completion to
  0.2.9. Record delivered component work and observed Q16/Q17 evidence limits in
  the mutable summary. This update neither publishes 0.2.9 nor certifies a
  runtime, comparative workload or physical operating envelope.
