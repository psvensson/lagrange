# Original 3720 independent causal review

Reviewer: subagent:/root/composition_review. Review only; no workload replay,
project parser, test, generator or external write. Prepared 2026-11-13.

## Custody and admitted identity

Reviewed complete original-3720.log: 88,359 bytes, 1,627 lines, locally recomputed
SHA-256 fb119db77c8310efcf2daedb8fb9e8bfa64cc476b3b2a0a47cc41435b5a31798.
This equals worker full-output identity in completion provider
https://github.com/psvensson/lagrange-lab/issues/3720#issuecomment-6852320839.
The provider's outer 8,207-byte worker-tail identity is a different artifact.
Coordinator records recovery windows 3731-3742; this review verifies the assembled
stream independently, not a new canonical evidence upload receipt.

Logical request dc2174a5-c971-4d25-99e5-cc2ca79a9890; host adams-gamla;
root test/scripts/proof-receipt-execution-report.test.js; source
56d12341a67d8680b16f8f06847a2499f73b24f6; tree
07668b03cac68d967717ff2b61910fe10702b078; src
 ec5f4204f8031d859808495365fda27e831a5a72.
Source test blob db1e0c3e11c04d1ce4bac1770e7d08c10a01d4c4;
original proof-authority blob d099a998c3be9b8f69b32d9988d9109ede4a9635.

Setup began 12:03:14Z, npm ci completed 12:04:01Z, exit 0 (47 seconds).
Node v22.23.2; native provenance exit 0, SQLite 3.49.2, source ID
2025-05-07 10:39:52 17144570b0d96ae63cd6f3edca39e27ebd74925252bbaf6723bcb2f6b4861fb1,
addon SHA-256 d7d9272b12d11c1dc2bb787741b1b7c4037d336155f316ace3420410c28fda37.
Root ran 12:04:01Z-12:04:09Z; exit 1. Final source guard exit 0.
Completion records finished_at 12:04:12.329Z, recorded_at 12:04:12.543Z,
FAIL/exit 1; execution, container and thermal scopes closed. These closure
facts are native-provider claims, distinct from TAP and source cleanliness.

## Native counts and first divergence

The complete outer TAP is 1..64: 64 top-level tests, 8 passed, 56 failed,
0 cancelled/skipped/todo. The runner labels these 64 assertions; they are TAP
test records, not a count of JavaScript assert calls. Fixture nested runner
work occurs inside the two final passing tests and is not an extra set of
outer cases. The native totals corroborate the provider counters here.

The first failed test is #1, absent execution report: assertRefused expects
execution-report-absent but observes no typed problems. This is separate from
the first stored-reader divergence, #22, which actually returns proven for a
stored corpus receipt lacking execution. Both defects must remain visible.

## All 28 intended stored-receipt negatives reached

Cases #22-49 are exactly the 28 reviewed original controls; all failed at the
intended consumer assertion after real producer minting and real tag/ref storage.
No fixture admission failure prevented this group from reaching its boundary.

- #22-23: exact corpus/release resolution without execution returned proven,
  expected unavailable.
- #24: same-content identity lookup without execution returned proven, expected
  unavailable. The source verifies changed commit identity and matched content
  digest before invoking the real identity reader.
- #25: indexProof returned without the expected receipt-execution exception.
- #26: same-head recordProof reuse returned without the expected exception.
- #27-47: all 21 malformed corpus envelopes returned proven, expected unavailable:
  non-object execution; absent/malformed digest; absent producer/kind/id;
  absent summary; absent/empty/failed commands; absent/non-list/malformed reused
  proofs; negative assertions; empty plan without citation; passed-on-retry;
  missing planned/executed/assertions/runs/passedOnRetry numbers.
- #48-49: unsupported release citation proof and malformed cited object SHA
  each returned proven, expected unavailable.

Thus 26 reader cases directly witness incorrect proven outcomes; two mutation/
reuse consumers directly witness missing refusal. Do not upgrade #25's missing
exception into a measured identity-ref creation claim: its no-ref assertion
comes later and was not reached. Likewise #26's post-call unchanged-object/ref
assertion was not reached. In the other 26 cases, assertStoredReceiptUnchanged
precedes the failed outcome assertion, so those exact ref/object preservation
checks did execute successfully. Diagnostic-text assertions after the failed
outcome checks were not reached.

## Separate systematic producer-refusal defect

The other 28 failures are #1-19, #52-57 and #59-61. Direct API tests receive an
exception without their expected problems/code. CLI #52-53 show the concrete
ReferenceError: RECEIPT_PROBLEM_SEPARATOR is not defined, at original
proof-authority.js:340 in ProofRecordRefused. The constructor fails while
formatting its message, before assigning typed code/problems.

Source history corroborates the shared cause: 207d4f792 retained the separator
constant and constructor use; preserved extraction commit 43e217c014017831cd3485b2e3c117451560a29e
removed the local constant while leaving the constructor use and failing to
import it. The new receipt-contract module has its own private separator.
This is an extraction/owner-dependency defect spanning every typed producer
refusal, not 28 separate local report-validator bugs. CLI stacks physically
prove the ReferenceError; the shared cause for API cases is source-correlated.

These failures do not show invalid reports were minted. They also do not prove
all later no-ref checks: assertRefused aborts at its typed-problem assertion,
so remote-absence assertions are unreached. #57's second corpus-citation variant
and #59-61's reversed two-run order are unreached after their first assertion
fails. Preserve these evidence ceilings rather than crediting entire bodies.

## Eight passing controls

#20 rejects historical qualified retry receipt applicability and retains the
observed retry summary. #21 mints a complete exact release report with execution
summary/producer/digest and real remote receipt. #50 verifies identity-free exact
corpus resolution and same-object reuse. #51 preserves fractional assertion
counts (3.5 summary) and unnamed successful commands. #58 records and resolves
a release citing its exact corpus with zero direct counts. #62 accepts a report
clean in both runs. #63 verifies runner sections, checkout/assertion counts and
one retained failed attempt. #64 verifies nested fixture runners do not inherit
outer proof sections. These are finite native controls, not whole-corpus proof.

## Disposition

Original attempt remains failed and closed; never replay it for green. Its 28
stored-envelope controls supply actual causal-negative evidence for the receipt
reader correction. The separate typed-refusal extraction defect needs its own
bounded repair with independent verification and candidate measurement; existing
native original failures are retained witnesses. No repaired candidate, Quest
seal/land, full-corpus acceptance or final publication is established here.
