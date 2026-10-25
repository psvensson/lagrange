# ADMIN composition review — first frozen source

Reviewer: `subagent:/root/metric_review`. Date: 2026-10-25. Read-only source review; no product or test source edited and no runtime tests executed.

## Verdict

**REVISE source for F-ADMIN-COMPOSE-1.** This records the first frozen candidate even though the author has subsequently prepared R2. The other merge-sensitive deltas inspected did not introduce a confirmed defect.

The reviewed integration starts at `709dc2bebd4abdbec9a5d4fb2232c2621d7897f7` and composes the old ADMIN chain through `a97f79c35b7e1f6428032493918e16e623339688`, then coordinator identity `c582aa545068cf182754da98028812912d628bf0`, mutation confirmation `930abb048f2d04db5bdb47bea20fc2ce7c450a17`, and complete-cohort `9a7aeca9e2dde7d009643d62c904bc789b70c97d`. Marker is excluded.

The author manifest `admin-composition-source-freeze.json` has SHA256 `a8e5e792b74a712e296db374f55e5deee338ad22bf8a11fe641755280b8573ab`. The independent `composition-source-binding-check.json` verifies all 129 changed/deleted JavaScript paths, every staged byte, and zero unbound changed JavaScript files. Of those paths, 116 match their latest incoming unit exactly. The remaining 13 were reviewed against both incoming and current-integration behavior.

## F-ADMIN-COMPOSE-1 — D2 refusal loses its HTTP classification

**Severity: medium. Category: owner interaction / typed outcome. Confirmed by the complete source path; no executable HTTP reproduction was run in this review.**

The admitted ADMIN design, section 1d of `solve/epics/raft-rs-full-cutover/evidence/system-table-write-admission-2026-10-27/DESIGN-system-table-write-admission-2026-10-27.md`, expressly requires D2's `external_cdc_unsupported` refusal to pass through as HTTP 400.

The reachable path is `PATCH /api/admin/tables/:tableId/policy` → `AdminOwnerOperations.updateTablePolicy` → `TablePolicyService.updateTablePolicy` → `assertTablePolicyCdcRequestSupported`. Both the top-level and nested `externalCdcAllowed: true` forms throw the exported `CDC_TABLE_POLICY_REFUSAL.EXTERNAL_CDC_UNSUPPORTED` before any table mutation. That error has neither `deferRetry` nor a not-ready mutation outcome. The first candidate's `REFUSAL_STATUS_BY_CODE` does not contain this code, so `answerOwnerFailure` reaches `ownerFailed` and answers HTTP 500 / `outcome: failed` while retaining the error code.

This is an incomplete representation at the shared HTTP adapter. D2 admission still refuses the unsupported operation. No false-success or unauthorized-write claim follows from this finding. The wrong failure class can nevertheless make callers treat a deterministic refused request as an internal owner failure, contrary to the approved interface.

### Systematic scope and history

The census followed the declared failure codes of dynamic config, table policy, conditional node removal and built-in PG-wire scaling through the same mapper. Their remaining validation/conflict codes are present; unconfirmed outcomes carry retry/outcome metadata and use the existing not-ready path. The newly composed D2 refusal is the demonstrated omission. This bounds the specific correction to the shared adapter, rather than proving that every inherited error path in the repository is complete.

The original D2 review already establishes typed refusal at CREATE-policy and table-policy owners, and the old ADMIN design explicitly anticipated its HTTP conversion. The current branch retained the guard but not that conversion. Available Git history is shallow, so the examined exact unit commits and preserved design/review records are the history evidence; an exhaustive repository-history claim is not made.

Primary comparisons support the same separation without supplying a different product contract. RFC 9110 sections 15.5.1 and 15.6.1 distinguish client-request errors from unexpected internal conditions. The official grpc-gateway `runtime/errors.go` keeps typed `InvalidArgument`/`FailedPrecondition` conversion distinct from internal/unknown failures. These sources were inspected on 2026-10-25:

- https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.1
- https://www.rfc-editor.org/rfc/rfc9110.html#section-15.6.1
- https://github.com/grpc-ecosystem/grpc-gateway/blob/main/runtime/errors.go

### Required correction and discriminator

Add the existing exported owner refusal code to the existing HTTP refusal mapping. Keep validation at the CDC policy owner; add no endpoint policy validator, raw SQL path, alternate retry mechanism, or second outcome classifier.

Extend the existing real HTTP → table-policy owner → canonical gateway witness with both refused true forms, checking 400/refused/original code together with zero mutation engagements, retained cache, and no policy event. Then submit explicit false in the same fixture and require applied success, one actual gateway-to-CDC engagement, cache invalidation and one event. The old mapping must fail the refusal half. Runtime execution remains required through the lab owner; source derivation is not an executed red sample.

## Other scope findings

The incoming obsolete `acknowledged` answer field was removed from the new partition refusal, and both new router fixture branches use the sole envelope builder. Current D1 PREPARED admission and D2 committed traffic recording remain in participant apply. The current Q6 request-answer accessors, local admin dispatch answer shape, seed original-admission callback and listener-before-readiness order remain intact. R2's combined report records the detailed contract matrix and proof selection.
