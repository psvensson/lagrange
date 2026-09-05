---
epicContractVersion: 2
id: protected-core-change-control
roadmapRow: RM-0.25-sc-change-control
graduatesTo: null
---

# Protected core change control

Architecture: [`architecture/protected-semantic-core.md`](../../architecture/protected-semantic-core.md).

## Intent

A semantic boundary is not protected merely because it has a good module name.
A future agent with a failing test can still edit that module, weaken a nearby
gate, or remove the guard that would have objected. This epic makes protected
semantic changes a distinct repository operation with content-bound evidence.

The mechanism is governance, not a claim of security against a malicious
repository administrator. If a credential can rewrite every repository byte,
only an external ruleset or credential boundary can make protected source
literally unmodifiable by that credential.

## Scope

The row owns four related mechanisms:

1. a machine-readable protected-core manifest;
2. early detection of protected-path and protected-interpretation changes;
3. a content-bound authorization artifact for legitimate semantic changes; and
4. self-protection of the small enforcement root of trust.

It does not own the semantic inventory itself or decide which facts belong in
the kernel; `semantic-authority-hardening` owns that ladder.

## Protected manifest

The manifest should distinguish at least:

- pure semantic-kernel paths/symbols;
- protected stateful owner boundaries;
- raw-field interpretation rules and their allowlists; and
- root-of-trust enforcement files.

The manifest must remain small enough to review. It must not become a generic
"important files" list.

Removing a path or weakening an interpretation rule is itself a protected
change.

## Ordinary failure mode

An ordinary Quest that touches protected semantics without authorization should
fail before the broad test corpus with a typed, actionable diagnostic such as:

```text
PROTECTED_SEMANTIC_CHANGE_REQUIRES_AUTHORIZATION
```

The diagnostic should identify the semantic owner/row and the sanctioned path
to create a protected change rather than encouraging local bypasses.

## Protected authorization

A legitimate authorization is bound to exact content and records:

- protected semantic owner;
- interaction owner where applicable;
- reason for change;
- change class: implementation-preserving or meaning-changing;
- invariant statements;
- required safety/liveness/performance receipts;
- negative or mutation controls;
- independent review identity/verdict; and
- digest of the exact protected diff/content reviewed.

If protected bytes change after review, authorization becomes invalid.

An agent must not be able to authorize its own arbitrary protected change merely
by creating a JSON file with the right fields. The authorization path must
consume the repository's existing solver/review governance or another explicit
user-authorized mechanism rather than a self-asserted flag.

## Root of trust

The manifest parser, protected-change classifier, authorization verifier, and
rules determining protected membership form a small root of trust.

Required invariant:

```text
ordinary change
  -> cannot weaken protection
  -> then modify newly unprotected semantics
```

Changes to the root of trust require the same or stronger authorization as
changes to the semantic code it protects.

Tests must include compound attacks: remove a manifest entry and edit that
semantic file in the same diff; change the path matcher; disable the check;
replace exact-diff binding with a stale authorization; or move protected code to
an unprotected path without updating the manifest.

## Interaction with existing governance

Reuse existing content fingerprints, solver manifests, independent review, and
scope/owner machinery where they already express the required fact. Do not
create a second review or quest system solely for protected code.

The protected gate should add one question to the existing path:

> Does this change modify protected meaning or the mechanism that protects it?

If no, ordinary governance continues unchanged.

If yes, the additional semantic authorization must be present and content-bound.

## CI and local behavior

The guard should run locally and in CI. CI remains the independent enforcement
surface for a committed branch; local preflight is for fast feedback.

Do not rely on GitHub `CODEOWNERS` alone. It is useful review routing, but without
enforced branch/ruleset configuration it does not prevent writes. Repository
rulesets/credential separation can later strengthen the boundary outside the
repository.

## Required receipts

A Quest implementing this epic must prove at least:

- unauthorized edit of a protected semantic path is rejected;
- authorized exact diff is accepted;
- changing one protected byte after authorization is rejected;
- removing a manifest entry and editing the removed path is rejected;
- weakening the verifier itself is rejected by the ordinary path;
- moving protected semantics to an unprotected file is detected by an
  interpretation/import guard or manifest invariant;
- ordinary unrelated source changes are unaffected; and
- generated/test-only collateral cannot accidentally grant protected
  authorization.

Mutation tests should restore at least one bypass and demonstrate that the guard
fails for the intended reason.

## Exit evidence

The epic is complete when protected semantics and the protection mechanism have
a single auditable change path, ordinary changes fail early when they cross that
boundary, and exact-content authorization cannot be reused after drift.

A later external credential boundary may make this stronger. Phase 0.25 is
successful when the repository itself no longer treats a semantic change as an
ordinary source edit.