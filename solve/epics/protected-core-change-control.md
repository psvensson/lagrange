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
A future agent can still edit that module, weaken a nearby gate, or remove the
guard that would have objected. This epic makes protected semantic changes a
distinct repository operation with content-bound evidence.

The mechanism is governance, not a security claim against a repository
administrator. Literal write prevention requires an external ruleset or
credential boundary.

## Scope

The row owns:

1. a machine-readable protected-core manifest;
2. early protected-path and interpretation detection;
3. content-bound authorization for legitimate semantic changes; and
4. self-protection of the enforcement root of trust.

`semantic-authority-hardening` owns the fact inventory and kernel selection.

## Protected manifest

The manifest distinguishes:

- pure semantic-kernel paths/symbols;
- protected stateful owner boundaries;
- raw-field interpretation rules/allowlists; and
- root-of-trust enforcement files.

It must stay small enough to review rather than becoming an "important files"
list. Removing a path or weakening an interpretation rule is a protected change.

## Ordinary failure mode

An ordinary Quest crossing protected semantics without authorization fails
before the broad test corpus with an actionable diagnostic such as:

```text
PROTECTED_SEMANTIC_CHANGE_REQUIRES_AUTHORIZATION
```

The diagnostic identifies the owner/row and sanctioned protected-change path.

## Protected authorization

Authorization is bound to exact content and records:

- semantic owner and interaction owner where applicable;
- reason and change class: implementation-preserving or meaning-changing;
- invariant statements and required safety/liveness/performance receipts;
- negative or mutation controls;
- independent review identity/verdict; and
- digest of the exact protected diff/content reviewed.

Changing protected bytes after review invalidates authorization. An agent cannot
self-authorize merely by creating a correctly shaped file; the path must consume
existing solver/review governance or another explicit user-authorized mechanism.

## Root of trust

The manifest parser, classifier, authorization verifier, and protected-membership
rules form a small root of trust. Required invariant:

```text
ordinary change
  -> cannot weaken protection
  -> then modify newly unprotected semantics
```

Root-of-trust changes require the same or stronger authorization as semantic
code. Tests include compound attacks: remove an entry and edit that path; weaken
the matcher/verifier; reuse stale authorization; or move semantics to an
unprotected path.

## Interaction with existing governance

Reuse existing content fingerprints, solver manifests, independent review, and
scope/owner machinery. Do not create a second quest/review system.

The gate adds one question:

> Does this change modify protected meaning or the mechanism that protects it?

If no, ordinary governance continues. If yes, exact-content semantic
authorization is required.

## CI and local behavior

Run the guard locally for fast feedback and in CI for committed-branch
adjudication. `CODEOWNERS` may route review but is not write protection without
an enforced external ruleset.

## Required receipts

A Quest must prove:

- unauthorized protected edit is rejected;
- authorized exact diff is accepted;
- one protected byte changed after authorization is rejected;
- manifest-entry removal plus edit is rejected;
- ordinary-path weakening of the verifier is rejected;
- moving protected semantics to an unprotected file is detected by an
  interpretation/import or manifest invariant;
- ordinary unrelated source changes are unaffected; and
- generated/test-only collateral cannot grant authorization.

At least one restored bypass must fail for the intended reason.

## Exit evidence

Protected semantics and their protection mechanism have one auditable change
path; ordinary changes fail early when they cross it; exact-content
authorization cannot be reused after drift.

A later external credential boundary may make this stronger. Phase 0.25 is
successful when the repository no longer treats a semantic change as an
ordinary source edit.