---
audience: development
documentClass: evidence
---

# Seed shutdown retry negative control

Date: 2026-10-20.
Base: `e29e46abf6c5daf506d8c0500b5a9a1d16c2bcd6`.
Branch: `diagnostic/seed-custody-retry-negative-20261020`.
Status: uncommitted diagnostic prepared for independent review; unmeasured.
This deliberately defective source must never be merged.

The sole behavioral change removes the rejected-attempt reset from
`BootstrapService.shutdown`. Its now-empty catch/rethrow scaffold is removed
as well; the original awaited result and error still propagate. The owner
therefore retains a rejected `shutdownPromise` permanently. The repaired
phase routing, cleanup summaries, native-object maps and SQL references are
unchanged.

Source SHA256 before:
`d1fe96117414f9049e3247dff6820e817030024482efcc507c541d3e160feb69`.
Source SHA256 after:
`ce54e0c1ac4b11afe6c41f3800d3b00bfa08be24a818f9e92d8da813a1d624b4`.
Exact source-only Git patch SHA256:
`604a9f5f433786dc460f39f06e6a8ccc0f4e234d4ff7527506c6236cfff49074`.

`git diff --exit-code` against the exact base reports no changes under
`test/`. The native test and fixture were also compared byte for byte:

| File | SHA256 |
| --- | --- |
| `test/bootstrap/seed-release-failure-custody.test.js` | `5c82b7321196e624f1e16963047c33281a56edc8e2ff71a8aeba5089cf758f21` |
| `test/test-helpers/seed-release-failure-custody-fixture.js` | `f15ac20c8f229e8265a4c21cdb44b0449972ee6ae5fd51456f4a01dd6d3dda10` |
| `test/bootstrap/bootstrap-shutdown-quiesce.test.js` | `9d1df4d004c7b7bd9ddd9829d184cf89589e7ca51e42ef294044c29cf1800b6a` |

Expected semantic discriminators, pending execution:

- The focused shutdown case first proves concurrent callers join one cleanup
  and receive its exact rejection. Its next same-owner call then fails
  `a new shutdown re-enters the retained cleanup owner`, and `cleanupCalls`
  stays one instead of becoming two.
- The actual seed case first proves committed ENABLE, original deadline
  expiry, correct registration cleanup, exact retained database custody and
  an actual top-level shutdown rejection. After restoring the real native
  close, the same-owner retry still returns the old rejection. The named
  native retry subtest fails while the unchanged fixture performs explicit
  cleanup-only teardown through the existing owner.

A generic setup/import failure, unengaged timeout or hang is not a successful
negative control. No tests, lab run, commit, push or acceptance were performed
when this preparation record was written.

## Reviewed preservation decision

`subagent:/root/control_source_review` subsequently approved the exact source
hash and unchanged witnesses for isolated measurement. The execution
candidate already retains its actual failed ordinary hook and unresolved
static findings. This intentionally defective diagnostic uses the explicit
WIP-only preservation exception in `docs/development/solver-runbook.md:167`
so the locked runner can name a commit. No ordinary hook is claimed for this
diagnostic, and no green, landing or publication state is being obtained.
Its run artifacts and independent result review will be retained in the
execution branch's Quest, never merged from this branch.
