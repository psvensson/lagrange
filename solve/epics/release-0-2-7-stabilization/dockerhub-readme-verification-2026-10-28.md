---
audience: development
documentClass: evidence
---

# Docker Hub README: verification and Q16 scope addition

This addendum records the user's 2026-10-28 report that Docker Hub still shows
0.1 and request to ensure it always receives the current README. It supplements
F16 without rewriting the earlier audit or claiming a live repair.

Source examined: `af55b5ace1473c0d516937733df0dd3c3450dd63`, the planning PR
based on `98e69ba13db8f9a5bbf6bc919d6e9c941b07ac8e`. Release source remains
`a1e26f6de84433a3913c2ef855d1b787e926d7eb` / `v0.2.6`.

## Actual remote state and release failure

A read-only GET of the public
[repository metadata](https://hub.docker.com/v2/repositories/psvensson/lagrange/)
on 2026-10-28 returned namespace psvensson, repository lagrange and a
4,655-character `full_description`. Its tag guidance still says:

```text
| `0.1.0`, … | One tag per `vX.Y.Z` release, built from that git tag |
```

The displayed content also retains a Codeberg release-process link, whereas
the current canonical template points to GitHub. Metadata `last_updated` is
`2026-10-28T13:35:22.982665Z`; that timestamp alone does not establish a README
update and must not be used as the synchronization oracle.

The [0.2.6 publication job](https://github.com/psvensson/lagrange/actions/runs/40696611697/job/122845178947)
contains this sequence at 13:35:23-24 UTC:

1. Docker latest push reports digest
   `sha256:6fe9153645f28a63b26c6777a9f97b1b4e0d383d1861859fa375029cef63c37a`.
2. The pinned Docker Hub description action reads the generated overview.
3. It logs Acquiring token, then Sending PATCH request.
4. It records `##[error]Forbidden` at `2026-10-28T13:35:24.3811910Z`.
5. The workflow continues to GitHub release publication and ultimately succeeds.

Thus the stale page and ignored update failure are directly confirmed. The
exact account/token permission or API-policy cause behind Forbidden was not
independently established; no credentials were inspected or changed.

## Existing owner and missing guarantees

The canonical Hub input is
[docs/dockerhub-overview.md](../../../docs/dockerhub-overview.md) plus
[CHANGELOG.md](../../../CHANGELOG.md), through
[scripts/release-notes.js](../../../scripts/release-notes.js). It is not a copy
of root README. Rendering version 0.2.6 from the inspected tree produces the
current 0.2.6 guidance; stale remote content does not imply the renderer cannot
produce it.

| Boundary | Verified current behavior |
| --- | --- |
| Update step | release workflow lines 321-328 use `continue-on-error: true` |
| Policy | RELEASE.md lines 107-115 explicitly make the update best effort and suggest manual paste |
| Trigger | Tag publication runs the update; ordinary merged documentation changes do not |
| Credential preflight | Tests registry pull/push scope, not description-edit capability |
| Prerelease protection | Image latest has a stable guard; the subsequent shared description step has no corresponding guard |
| Serialization | Existing release-publish concurrency group serializes releases; future doc-only writers must share its ownership |
| Content selection | The renderer includes all non-Unreleased changelog sections; the version argument alone does not exclude later dated-but-unpublished entries |
| Verification | No remote description fetch-back/content comparison appears in the publication path |
| Receipt | The Docker publication record contains image digests but no verified overview result, content hash or document revision |

Owners: [release workflow](../../../.github/workflows/release.yml),
[release policy](../../../RELEASE.md),
[receipt reader](../../../scripts/checks/release-publication-receipt.js),
[renderer tests](../../../test/scripts/release-notes.test.js) and
[release contracts](../../../test/release/project-hardening-contracts.test.js).
Existing tests cover rendering/markers/size/idempotence and release wiring;
they do not prove remote synchronization or stale-write rejection.

## Disposition

The user's request extends existing
[Q16](../../specs/release-0-2-7-stabilization/requirements.md#q16---align-release-artifacts-metadata-and-documented-journeys-p2)
with automatic stable-release/documentation refresh, correct metadata
permissions, remote content verification, ordered writes, explicit failure and
idempotent repair. It uses existing release/renderer/receipt owners, preserving
the distinction between candidate checks and post-publication confirmation.

Historical release notes may legitimately mention 0.1. The requirement concerns
current version guidance, examples and applicable capability narrative, plus
content equality with the selected canonical rendering. No live Docker Hub
write, new workflow trigger, credential modification or release was performed
while preparing this addendum.

Independent planning review: `subagent:verify_release_027` approved the added
requirements and source/observation distinctions. Documentation current-state,
audience, roadmap-authority, public-formatting and relative-link checks passed.
