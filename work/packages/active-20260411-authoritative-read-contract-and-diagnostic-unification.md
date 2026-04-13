# Authoritative Read Contract and Diagnostic Unification

## Why

The code now contains several overlapping read surfaces that all mean
"authoritative" slightly differently. Different callers choose their own
combinations of:

1. owner-RPC preference
2. owner-RPC requirement
3. SQL fallback
4. local degradation
5. readiness dimension
6. timeout and pressure behavior

That is a bag of booleans, not a contract. It also means the same cluster can
look different depending on which caller asked. On top of that, diagnostics
still blur important lane distinctions such as owner-RPC vs SQL fallback.

This package collapses those branchy combinations into a small set of named
read contracts owned centrally by the control-plane gateway.

## Scope Basis

Roadmap and AGPL-scoped matrix rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Completion Contracts and Owner Simplification Sprint](../sprints/active-2026-q2-runtime-completion-contracts-and-owner-simplification.md)

## In Scope

1. Replace caller-composed boolean read semantics with a small set of named
   read profiles.
2. Make the control-plane gateway the owner of fallback, degradation,
   readiness-dimension, and source-reporting policy for those profiles.
3. Split result diagnostics so local replica, owner-RPC, SQL fallback, cache,
   and bootstrap snapshot are distinguishable.
4. Align admin, readiness, publication, and harness read paths on the same
   profile semantics.
5. Remove duplicated caller-level conditional logic whenever the gateway can
   own the choice.

## Out Of Scope

1. New transport mechanisms.
2. Rewriting unrelated non-control-plane query paths.
3. Broad observability UI work beyond the minimum needed to make the read
   contracts explicit.

## Invariants

1. One named read profile has one meaning everywhere.
2. The actual answering source is reported truthfully.
3. Read degradation policy is owned centrally, not reconstructed per caller.
4. Callers request intent, not transport detail.

## Hotspots

1. `src/control-plane/control-plane-system-table-gateway.js`
2. `src/control-plane/authoritative-control-plane-view.js`
3. `src/admin/admin-control-snapshot.js`
4. `src/admin/admin-service-discovery.js`
5. `src/control-plane/control-plane-readiness-service.js`
6. `src/control-plane/membership-publication-coordinator.js`

## Status

Partially implemented on 2026-04-11.

Implemented:

1. named read profiles are now resolved centrally in the control-plane gateway
2. repair, planning, diagnostics, and table-lifecycle reads can now declare
   intent without composing the full transport flag bag locally
3. authoritative control-plane view diagnostics now distinguish SQL fallback
   from owner-RPC instead of collapsing both into one source label
4. admin control-snapshot publication observation now passes the diagnostics
   read profile explicitly instead of inheriting planning semantics through the
   publication owner path
5. table-lifecycle reads now explicitly prefer owner-RPC while still allowing
   bounded SQL fallback through the named profile instead of caller-local
   transport shaping

Deep-dive findings now extending this package:

1. `AdminControlSnapshot` still reaches through
   `controlPlaneReadinessService.membershipPublicationService` directly and
   locally chooses sync vs async vs authoritative publication reads
2. `AdminControlSnapshot` still locally queues reconcile and performs
   acknowledgement decisions while serving a read surface
3. bootstrap consumers still reconstruct their own final authority semantics
   from lower-level diagnostics instead of consuming one owner-owned answer

## Detection / Analysis Tasks

- [x] Inventory the current effective read modes and group them into the
      smallest sensible set of named profiles.
- [x] Identify all hot-path callers that currently compose their own flag bags.
- [x] Trace where owner-RPC and SQL fallback are still indistinguishable in
      the result model.
- [x] Confirm which readiness dimensions truly require distinct profiles and
      which can be folded into the same contract.
- [x] Deep-dive publication-observation callers that still bypass the
      readiness owner entirely.

## Implementation Tasks

- [x] Define a small set of named authoritative-read profiles in the gateway.
- [x] Move fallback, degradation, timeout, and readiness-dimension policy
      ownership into the gateway profile resolver.
- [ ] Remove or retire hot-path caller combinations of
      `preferOwnerRpcRead`, `requireOwnerRpcRead`, `allowOwnerRpcFallback`,
      `allowSqlFallback`, and similar flags where profile intent covers the
      use case.
- [ ] Move remaining publication-observation callers off raw
      `preferAuthoritativeRead`-only semantics where the diagnostics or
      planning profile should be explicit.
- [x] Separate owner-RPC and SQL fallback source reporting in results and
      diagnostics.
- [x] Add focused regression coverage for profile behavior, degradation, and
      truthful source reporting.
- [ ] Remove `AdminControlSnapshot` direct access to
      `membershipPublicationService`; route publication observation,
      authoritative read choice, and acknowledgement through one readiness-owned
      surface.
- [ ] Fail loudly on missing authoritative read owners for final semantics
      instead of synthesizing local replacement logic from secondary data.

## Validation

1. The same named profile yields the same effective behavior across admin,
   readiness, and publication callers.
2. Diagnostics can distinguish owner-RPC failure from SQL fallback success.
3. Callers no longer need local condition trees to define what
   "authoritative enough" means.

## Done When

1. Hot-path callers request named read intent rather than composing boolean
   transport bags.
2. Authoritative read semantics are centrally owned and consistent.
3. Read diagnostics truthfully identify the answering lane and degradation
   path.

## 2026-04-11 - named diagnostics contract now resolves end-to-end
- AuthoritativeControlPlaneView now resolves named read profiles directly instead of relying on every caller to rebuild owner-RPC and SQL fallback policy.
- HeartbeatService canonical visibility verification now uses the diagnostics read profile.
- The diagnostics profile now carries both strict owner-RPC policy and the repair-eligible routing dimension through the lower-level authoritative view.
- Focused tests passed:
  - node test/control-plane/authoritative-control-plane-view.test.js
  - node test/control-plane/heartbeat-memory-trend.test.js

## 2026-04-12 extension
- The next remaining cleanup in this package is not lower-level gateway work; it is caller-path removal.
- `AdminControlSnapshot` still acts like its own publication-read ingress and workflow side-effect owner, which violates the single-ingress doctrine.
- This package now explicitly owns that cleanup.

## 2026-04-12 Deep-Dive Extension: Remove Owner Bypass and Caller-Local Authority Reconstruction

### New structural issue

`AdminControlSnapshot` still bypasses the readiness owner and reaches directly into `controlPlaneReadinessService.membershipPublicationService`. That means admin snapshot code still chooses sync versus async versus authoritative reads, may enqueue reconcile, and may acknowledge publication itself. This is an owner-boundary violation, not just a read-profile cleanup gap.

### Additional implementation tasks

- [ ] Move membership-publication observation, acknowledgement eligibility, and authoritative read-lane choice behind one readiness-owned surface.
- [ ] Remove direct `membershipPublicationService` access from `AdminControlSnapshot` and other non-owner callers.
- [ ] Remove caller-local sync/async/authoritative fallback reconstruction anywhere a named owner answer should already exist.
- [ ] Make authoritative decision points fail closed on missing owner answers rather than silently rebuilding weaker local heuristics.
- [ ] Keep named read profiles, but ensure they select transport and fallback policy only inside the owner boundary, not in admin/bootstrap callers.

### Additional hotspots

1. `src/admin/admin-control-snapshot.js`
2. `src/control-plane/control-plane-readiness-service.js`
3. `src/control-plane/membership-publication-coordinator.js`
4. `src/bootstrap/owners/bootstrap-readiness-owner.js`

### Structural concern

This package now explicitly includes the remaining injected-owner bypasses, not only read-profile normalization.

## 2026-04-12 Close-out Update

Implemented in this package:
1. Readiness-owned membership-publication read options now resolve explicit authoritative/owner-RPC policy for diagnostics and planning.
2. Admin control snapshot now consumes readiness-owned publication observation first instead of reaching directly into publication internals by default.

Validation outcome:
1. Focused authoritative-read unit coverage passed.

Status:
Structurally completed for this sprint.
