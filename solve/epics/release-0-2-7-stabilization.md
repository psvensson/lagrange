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

# Stable-core corrections for 0.3.1 and completion for 0.3.2

Preserve this epic's identity, Q01-Q18 owners, seals and evidence. Approved
allocation retires future 0.2.9: **0.3.1** selected installation/publication
corrections; **0.3.2** remaining stable-core/composed acceptance. Historical
roadmap identity is unchanged.

## Current coordination summary

Checked **2026-10-30 08:02 UTC** on main
`a43ce6a9fe3c2ffd17fcb084e596a0c709ba88c9`, rule-set 4; adoption uses revision 5
and supplies no runtime certification. Published baseline is **0.3.0**, source
`79ac781fcc3a30482492751b9971cb178e3cfdca`. [PR151 and historical run limits](release-0-3-queryable-core.md#current-summary)
are indexed once in Queryable Core. Preserve delivered raft-rs/TX1/FreshMG/SN1.

- **First installed blocker:** [formation run](https://github.com/psvensson/lagrange/actions/runs/40997386220/job/123873699856)
  failed with `ORIGINAL_ALLOCATION_HOLD` and missing `/app/package-lock.json`;
  PR151 leaves that interaction unchanged. Published-digest/npm boot are
  separately unmeasured.
- **Publication:** [0.3.0 job](https://github.com/psvensson/lagrange/actions/runs/40979217502/job/123814900648)
  PATCHed Docker Hub. Earlier Forbidden is historical; Q16 still owes failure
  handling, stale-write prevention and readback.
- **Public/operating frontier:** the [terminal scenario](../../test/distributed/scenarios/release-0-2-7-stabilization.js)
  is local, not full Q17. Source/reused-dependency fixtures and refused PG
  system-table setup need actual artifact/public-owner proof. Q10/Q11 retain
  control-plane/message-group retention/replay; Q14 reconciles current TX1
  read/retry/unknown outcomes. Credit existing snapshot/diagnostic/admission fixes.
- **CI:** [main gate](https://github.com/psvensson/lagrange/actions/runs/41020679400)
  was in progress at check time. Old receipts/[CI failure](https://github.com/psvensson/lagrange/actions/runs/40978623107/job/123812756682)
  neither certify nor veto fresh main.
- **Next owner/action:** release integration assigns bounded startup/provenance
  work and Q16/Q17 continuation using [first actions](../specs/release-0-3-queryable-core/tasks.md#first-actions).
  Retain actual failures. 0.3.1/0.3.2 remain planned pending normal release proof.

Solved [core](../quests/release-0-2-7-core-runtime-and-semantics/log.ndjson),
[packaging](../quests/release-0-2-7-release-surface-and-packaging/log.ndjson) and
[Docker/proof](../quests/release-0-2-7-docker-context-and-publish-speedup/log.ndjson)
records receive their bounded credit, not full Q17. Preserve the dated
[dossier](release-0-2-7-stabilization/verification-2026-10-28.md),
[Docker finding](release-0-2-7-stabilization/dockerhub-readme-verification-2026-10-28.md)
and [planning review](release-0-2-7-stabilization/planning-review-2026-10-28.md).

## Work sequence

Use the sole [Q01-Q18 allocation](../specs/release-0-2-7-stabilization/requirements.md#current-version-allocation),
[scope boundaries](../specs/release-0-2-7-stabilization/requirements.md#existing-work-and-scope-boundaries)
and shared [J0-J10 pickup index](../specs/release-0-3-queryable-core/tasks.md#package-ownership-and-pickup).
Q/J labels are packages, not Quest records. Use bounded red witnesses, applicable
evidence and explicit supersession where needed. Independent work uses defined
contracts, one interaction writer and ordered integration, without waiting for
preceding publication. Expansion/comparison stays 0.4; larger pilot proof 0.5.

## Release acceptance

The [requirements](../specs/release-0-2-7-stabilization/requirements.md) and
[journey policy](../../test/guidelines/release-gate.md#major-feature-user-journeys)
own detail. 0.3.1 accepts selected corrections/claims, leaving full Q17/core open;
historical inventory adds no blanket gate. Q17 binds installed/public-service
and pre-publication proof to one candidate; normal authority permits publication,
then Q16 confirms artifacts. Its certification Quest binds `recordedLog` and
genuine archived/publication evidence; local scenario checks cannot substitute.
Q18 means bounded cleanup/durable routing, not zero historical debt. Preserve
exact-candidate corpus/release and separate cutover physical proof; no synthetic
terminal record, green oracle or retargeted receipt. Shared [review horizons](release-0-3-queryable-core.md#completion-and-next-review)
apply. Initial retained-history correctness remains 0.3.2, not deferred pilot work.

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

- 2026-10-30: User approved the reviewed working-user-journey candidate and
  repository adoption. Retire 0.2.9 as a future release while preserving this
  epic/roadmap identity and all original Q owners, Quest seals and evidence.
  Allocate the bounded installation/publication correction to 0.3.1 and
  remaining stable-core/composed acceptance to 0.3.2. Queryable Core consumes
  those results; 0.4 comparison/service expansion and 0.5 pilot scope retain
  their owners. Adopt rule-set revision 5 and the canonical major-feature
  journey policy. Credit v0.3.0/PR151 and retain exact-source evidence limits;
  this documentation adoption neither certifies nor publishes a runtime.
