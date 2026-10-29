---
id: release-0-2-7-stabilization
status: open
proof: certification
roadmapRow: null
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

# 0.2.7 stabilization: correct semantics, bounded runtime, usable artifacts

0.2.6 landed the real raft-rs cutover, TX1, FreshMG and SN1. Its next patch
must repair the verified correctness, admission and packaging defects and
establish a bounded, honestly described evaluation envelope. This epic
coordinates that release; existing subsystem owners retain their contracts.

## Current coordination summary

| Field | Current observation |
| --- | --- |
| Checked | 2026-10-28; steering rules/router reviewed 2026-10-28 at `98e69ba13db8f9a5bbf6bc919d6e9c941b07ac8e` |
| Released baseline | `v0.2.6`, `a1e26f6de84433a3913c2ef855d1b787e926d7eb` |
| Integration baseline | `main`, `98e69ba13db8f9a5bbf6bc919d6e9c941b07ac8e`; affected runtime, dependencies, native artifacts and packaging owners unchanged from the release |
| Scope authority | User request on 2026-10-28: verify the release audit and create the 0.2.7 epic; existing Community maintenance scope and edition boundaries apply |
| Acceptance owner | [Requirements and work packages](../specs/release-0-2-7-stabilization/requirements.md); this summary indexes that contract |
| Verified baseline | [Independent verification dossier](release-0-2-7-stabilization/verification-2026-10-28.md), including corrected qualifications and retained witness sources |
| Additional release finding | [Docker Hub README verification](release-0-2-7-stabilization/dockerhub-readme-verification-2026-10-28.md): live page still shows 0.1.0; 0.2.6 metadata update returned Forbidden and was ignored |
| Planning review | [Three independent approvals](release-0-2-7-stabilization/planning-review-2026-10-28.md), after correction of publication ordering and certification semantics |
| First demonstrated blockers | Q01 mutation expressions become NULL; Q02 admitted constraints disappear; Q03 text split placement and normal routing disagree |
| Current unit | Planning and baseline verification complete; implementation packages below are proposed and unsealed |
| Next action / owner | Query owner seals Q01 from the retained native-storage reproducer; release integration owner coordinates Q04-Q07 in the independent ingress/artifact lane |
| Continuation | No implementation or background certification run has been submitted by this planning change; the agent assigned next owns continuation |
| Release state | 0.2.7 is not implemented, certified, tagged or published; no runtime repair is claimed here |

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

One writer owns each changing interaction. SQL, ingress/packaging and Raft
investigation can proceed in parallel; shared parser/runtime/package edits
integrate serially. Each implementation starts from a bounded Quest with a
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

The epic probe is deliberately **not measuring**. Q17 must bind `recordedLog`
to its actual append-only certification Quest log when created, then produce
genuine archived terminal evidence including publication confirmation. The
scenario, recording binding and report production are Q17 work; no fake Quest,
pass receipt or manual green oracle is created here. Existing exact-candidate
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
