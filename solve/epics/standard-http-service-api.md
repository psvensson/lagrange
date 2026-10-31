---
id: standard-http-service-api
status: open
proof: certification
roadmapRow: RM-0.5-standard-http-service-api
graduatesTo: solve/specs/standard-http-service-api/requirements.md
doneWhen:
  probe: scenario-harness
  args:
    scenario: standard-http-service-api-acceptance
    consecutive: 3
    metric: priority
    certification: true
quests: []
authorizes:
  - src/authoring
  - src/service
  - src/runtime
  - src/node/runtime-service-request-cell-handler.js
  - src/node/runtime-service-call-cell-handler.js
  - src/bootstrap/shared
  - src/control-plane/owners
  - src/cli
  - src/public-api.js
  - wit
  - package.json
  - package-lock.json
  - examples
  - test
  - architecture
  - docs
  - README.md
  - CHANGELOG.md
  - scripts/checks
  - scripts/check-current-capabilities.js
  - scripts/check-service-portability-claims.js
  - scripts/generate-current-capabilities-doc.js
  - solve/epics
  - solve/specs
  - solve/quests
---

# Hono services through one standard HTTP boundary

## Decision

Adopt Hono as the first supported application framework. Developers write normal
Hono routes and middleware, return standard Responses, and explicitly await the
request-scoped Lagrange client when they need distributed execution. Lagrange
owns deployment, admission, capabilities, invocation lifetime and distributed
operations; it does not grow another routing or response-helper framework.

The [requirements](../specs/standard-http-service-api/requirements.md) are the
single detailed successor HTTP/application contract. They contain the verified
0.4.0 delta, implementation packages, owner crosswalk and public acceptance.

## Version and ownership

The [AGPL feature map](../../docs/development/agpl-feature-map.md) owns version
scope and sequence.

Published 0.4.0 is the inspected baseline, not proof that the former 0.4 milestone
is accepted. Bounded reduction/resource/claim repairs target 0.4.1 through their
existing owners. The Hono contract and unfinished practical-service acceptance
target 0.5, together with the existing pilot requirements. OCI consumes the same
application and call contract in 0.6; advanced execution remains 2.0.

The existing [pilot specification](../specs/pilot-readiness-and-public-proof/requirements.md)
retains selector, paging, structured-contribution and multi-operation ownership.
The [developer-journey specification](../specs/developer-journey-and-measured-comparisons/requirements.md)
retains artifact publication/deployment, stable revisions, onboarding and real
comparisons. This epic consumes those outcomes and adds no parallel acceptance
ledger, uploader, deployment mechanism or benchmark runner.

## Current summary

- Governing source: `07206ba1c8bb396f4eb097a753915bb34580d824` (v0.4.0).
- Steering: rule-set revision 5; rules/router reviewed 2026-10-30.
- Last checked: 2026-10-31; GitHub v0.4.0 published at 14:16:56 UTC.
- State: approved planning direction; Hono runtime implementation and acceptance
  are unverified. No implementation Quest has been sealed by this change.
- Source-identified blockers: the generated guest handler serializes its return
  without awaiting it; ingress retains only a JSON-object envelope and selected
  headers; generic reduction can discard contributions before guest reduction.
- Next action: seal the bounded 0.4.1 correctness repair under the existing call
  owner and H1 under this epic. H1 may proceed independently once its consumed
  contracts are fixed; integrated acceptance observes the one version sequence.
- Continuation owner: the assigned service API integration agent. No runtime run
  or background continuation is submitted by this planning change.
- The named acceptance scenario and its original reports are future work. Their
  absence is intentional; documentation checks cannot create runtime evidence.

## Decision log

- 2026-10-31: Peter selected Hono after rejecting a new Lagrange web framework
  and requested a post-0.4.0 audit, verified recommendations and a new epic.
- 2026-10-31: Independent source review credited the released artifact ingestion,
  identity-only deployment, binding revisions and JSON-body repair. Their
  composed runtime evidence remains with the existing acceptance owner.
- 2026-10-31: Adopt one Fetch entry and service-level capability boundary. The
  successor explicitly replaces per-handler `http.post`/`calls` declarations;
  historical sealed records retain their original meaning.
- 2026-10-31: Verification added full HTTP fidelity, admitted revision pinning,
  request lifetime and uncertain-execution semantics. Completed-response replay
  does not authorize automatic replay of arbitrary HTTP application code.
- 2026-10-31: Use the executable epic schema, including status and doneWhen, as
  the recent developer-journey epic does. Do not repair the conflicting epic
  README or the Solver in this product-planning change.
- 2026-10-31: The existing epic frontmatter parser cannot represent nested
  required-receipt arrays. Use the existing certification scenario probe with
  its ordinary three-run criterion; the linked spec defines consumed evidence
  families. Do not add a new parser or a probe that can never measure completion.
- 2026-10-31: Independent reviewer `subagent:/root/handler_design_review` approved
  the composed planning candidate after source/delta review by separate agents.
  Review covered HTTP fidelity, authority, replay/cancellation, zero/multiple
  operations, paging/reduction, proof quality and coordinated version homes.
  The final guest-safe authoring-subpath correction was separately rechecked.
  Epic schema, roadmap authority, audience/current-document/link checks, ASCII
  policy, rule-set/steering checks and diff whitespace checks passed. This is
  documentation adoption only; no runtime, cloud or full-system run is claimed.
