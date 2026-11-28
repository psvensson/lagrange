# The fresh-create completion witness: forms, bindings and results

Subject: `test/node/participant-release-fresh-create-completion.test.js`, a
witness of the sealed quest `participant-release-completion-owner` (impact
contract `participant-release-bounded-completion` in
`test/shards/impact-contracts.json`). Lead ruling 2b-1 (2026-11-28): the
trace assertions that `3ed2d6969` added leave with the trace this repair
removes, so the file returns to its content immediately before that commit,
the `3343a640a` form. All facts below are VERIFIED (hashed from git objects,
read in the quest records, or run).

## Forms, and which record binds each

| Form (first and last commit with these bytes) | SHA256 / blob | Bound by | Against the repaired `src` |
| --- | --- | --- | --- |
| `fefc75988` "test: freeze participant release completion boundaries" (2026-10-21) | `20bed369def78bf2…` / `bf80e210b` | `participant-release-completion-owner` log line 3: frozen test-only baseline, "fresh SHA256 20bed369…" | not run (superseded within the same quest by the next form) |
| `5691a034a` "test: preserve original fresh release outcome observations", carried unchanged into the sealed quest's reviewed candidate `90fb37194` (2026-10-21) | `8c4e7706eea5c794…` / `53b796ffd` | `participant-release-completion-owner` log line 7: "Witness SHA256 8c4e7706…". This is the sealed quest's recorded witness. | **1/7**. Fails with "Fresh replica release authority unavailable": it drives the node-local FRESH_CREATE token path that the R09 supersession replaced (log line 20) |
| `cf9e88ee7` / `54dd2d7ce` (Q6 envelope cutover, 2026-10-25/27) | `60376f321ee69cfc…` / `66f3e2651` | no digest recorded (`router-envelope-q6-stage3b` names the commit only) | not run |
| `d38fef56e` (2026-11-02) | `65e0ece1c857db50…` / `c8159ebad` | rejected attempt of `fresh-create-release-authority-from-committed-operation` | not run |
| `fa3c87e58` "corrective attempt 1b" (2026-11-02) | `f1833dd97017fe15…` / `8ccfc509b` | `fresh-create-release-authority-from-committed-operation`: approved verification of `fa3c87e58` and its `evidence/receipt.json`. This is the form approved under the R09 supersession recorded in the sealed quest's log (line 20). | **6/7**. Case 7 expects 3 outcome reads; `src` reads 2 since `b0dd82398` |
| `3c0b6f2e6` "Assert one completion policy observation of each release reply" (2026-11-20), unchanged up to `3343a640a` | `ce286513f49c9135…` / `7bddce5e8` | **no binding record**: no receipt, seal or verification names the commit, the SHA256 or the blob. One finding names the commit by its four-character prefix: `solve/quests/fresh-formation-user-table-routability/log.ndjson:141` (see below) | **7/7** (restored form) |
| `3ed2d6969` (2026-11-26) up to `ab347e962` | `404cbd1fbc104535…` / `7d8a05870` | no record. Adds `trace` assertions (lines 70, 78-82, 89-90) | **1/7**: `Cannot read properties of undefined (reading 'count')` (red on main since `b14641752`) |

## Two changes recorded only by a finding

Correction (stage 2e; an earlier draft of this file said no quest log or
record names either commit, which was wrong). Both commits are named, by
their four-character prefixes `b0dd` and `3c0b`, in one finding (`type`
finding, `kind` evidence) of another quest:
`solve/quests/fresh-formation-user-table-routability/log.ndjson:141`,
2026-11-20T22:59:14.517Z: "CREATE custody eight-file run b0dd: 6/8, 568
assertions. 3c0b corrects the superseded third-read expectation through a
changing outcome getter and exact failure/no-delivery-repeat control. ..."
No verification entry in any quest names either commit (searched across all of
`solve/` for the prefixes `b0dd` and `3c0b`).

- **`b0dd82398`** "Consolidate CREATE custody and bind typed release
  completion audit" (2026-11-20 23:52 +0100). In `completeParticipantRelease`
  it replaced two reads of `answer.outcome` on a refusal with one
  (`const outcome = answer.outcome;`). With the primitive's redirect check, a
  terminal refusal now reads `outcome` twice where it had read it 3 times (the
  `fa3c87e58` form's case 7 fails on `expected 3, actual 2`). The same commit
  revised the audit's `OWNER_CONTRACT` and `FRESH_CONTRACT` fragments to that
  new body (plus `FRESH_BINDINGS` and a new `FRESH_UNAVAILABLE_DECLARATION`
  check), and added the case "completion audit requires current reply
  classification and typed CREATE uncertainty" to the sealed test
  `test/scripts/participant-release-completion-owner.test.js`.
- **`3c0b6f2e6`** (2026-11-20 23:56 +0100, four minutes later). It rewrote that
  witness case to assert 2 reads for every outcome.

These two changes sit between the last approved form (`fa3c87e58`) and the
form this repair restores. The audit's full revision history after the seal
(three revisions, not only `b0dd82398`) and what the quest's phrase "the
sealed structural audit" therefore means are in `contract-meaning.md`.

## State after this repair

The witness is green (7/7 against the repaired `src`) in its `3343a640a`
form. No seal binds it: the sealed quest's recorded witness is the
`8c4e7706…` form, and the latest verification that approves a form is
`fa3c87e58`. Restoring a sealed binding for this witness, by verifying and
recording `b0dd82398` and `3c0b6f2e6` or by superseding the recorded form, is
the participant-release owner's work, not this repair's.

Outputs (coordination dir `lab/r1-main-red-stage2/`):
`fresh-create-form-5691a034a-vs-repaired-src.txt`,
`fresh-create-form-fa3c87e58-vs-repaired-src.txt`,
`fresh-create-form-3343a640a-vs-repaired-src.txt`; earlier runs against
ab347e962 `src` are under `fresh-create-form-*-vs-head-src.txt`.
