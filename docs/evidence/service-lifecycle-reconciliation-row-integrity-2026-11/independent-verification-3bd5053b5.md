---
audience: evidence
recorded: 2026-11-14
quest: service-lifecycle-reconciliation-row-integrity
---

(Typographic dashes in this report were replaced by ASCII hyphens for the documentation audit; nothing else was changed.)

VERDICT: REJECT - candidate 3bd5053b5c3a3109c96416c9b0c9ae315d3887fa

`3bd5053b5..1cf73fca8` changes quest records only. Probe cells from my own clone: candidate+probe `ff74c1936`, job 310d0eed-7ea9-4535-a0e7-05c7222e537a (adams-gamla); base src+probe `d920aaa48`, job 3da8f88c-4fb2-4516-9a0e-9141f1662894 (tv-dator). Evidence: `lifecycle-row/verify-probe-{candidate,base}`. Line numbers are `src/cache/system-table-cache-authoritative-reconciliation.js`.

## Blocking, introduced by the candidate (green on base, red on candidate)

**B1 - P2/S-3, P5.** `:407-423`, `:436-441` (authority cloned at `:363`, preservation gated off at `:294`). Authority row version newer + authoritative column null/missing: the cached value is wiped (raft_role, group_id; cells F1a/b/d/e). Through the production handoff (H1): cached target active/follower@5 - the CL-035 local voter seed, which keeps an older label by design (`src/node/replica-handler-create-status-methods.js:646-651,688`) - authority active/null@9: handoff completes, `raft_role` null, projection `raft_role_missing: 1`, spread lost. Base keeps follower and the holder. The owner's role-CAS-miss recovery reaches the same mode on its own seeded row (`src/raft/authoritative-row-mutation-helper.js:619-634`). Resolved silently, not reported as the constraint requires. New shape of a known mechanism (CL-021/CL-035 role wipe).

**B2 - P3, P1, P4.** `:444-453`, predicate `:198-201`. Equal `updated_at`, cached lifecycle strictly newer, cached lifecycle column null where the older authority holds a value: the older value is written under the newer lifecycle label. F2a: `error_message` 'boom' on a newer `creating` row. F2b: `trigger_reason`; not aligned before, aligned after. F2c: same on a repeated read. New shape of the quest's own mechanism (label disagrees with content).

## Blocking by the claim's letter (pre-existing, unchanged, not routed; red on both)

**B3 - P3.** `:454-456` identity columns of a strictly newer cached row are overwritten from the older read, then aligned (F3a). `:429-435` an older cleanup row replaces a strictly newer cached one (F4a). `:457-459` no incarnation check when the cached row is kept: an older incarnation's lifecycle and role land under a newer cached row (F10).

**B4 - P4/S-2 over-claim.** `:191-202`: at equal version any present-but-different column (group_id, created_at, create_attempt_token) is aligned, not "exactly one interleaving" (F5). P4's "reported when the cached group is strictly newer" is contradicted by the candidate's own assertion (cache test `:348`).

## Model completeness

Missing axes: authoritative per-column state (null/missing/present); cached content ahead of durable under an older label (owner-local seeds); caller (owner guard refresh versus handoff). Missed variants: lifecycle columns at equal row version under a newer cached lifecycle; identity class; cleanup kind; non-role columns; cross-incarnation keep-cached; non-finite cached `updated_at` carrying an HLC (F7a, pre-existing: stale HLC kept, a late CDC event regresses the reconciled row).

## Attack matrix

1. Pass: role installed, not aligned beforehand.
2. Pass: both test files only gain lines.
3. Fail: B1, B2.
4. Pass except F7a; non-finite authority is stopped by the completeness gate.
5. No new unbounded retry; B2 turns a false negative into a regression.
6. Fail: B3, B4, H1.
7. Pass: fenced builder and callers unchanged.
8. Witness is real end to end (only the authoritative read and `completeOperation` stubbed); red reproduced on base (3da8f88c, same 12 assertions); covers cache-behind only.
9. No consumer, bound, retry, fallback, typeof or mode change; baseline only tightened; `scripts/check-complexity.js` is outside the recorded writable paths; the quest log holds no census.
10. Receipts match: 8e2873c6 FAILED 9/38 + 12/127; 104e18d8 COMPLETE 55/55, 2706 assertions. The attempt entry records `paths: []`.

## Mutation table and independent green run

Not run (reject-fast). By inspection, unmeasured: (b) is a no-op in the keep-cached branch (equivalent); (g) in the authority-newer branch is the candidate's own behaviour; (h) is unreachable in lifecycle mode with finite versions, so the two named files cannot kill it.

## Out of property

Routed items confirmed: F6 missing-key fill under a newer cached row; F9 authoritative null over a cached lifecycle value.
