# U1 physical custody oracle follow-up, 2026-10-19

Status: test-only WIP checkpoint; no production change and no local behavioral
execution. Author: `subagent:/root`. This extends the preserved nine-case
checkpoint whose full tree is
`19d489e687d68b12f6d1f39e0565c205ed329264` (remote commit
`7597e046f498980250de77b87ddb779f4542597e`, branch
`probe/u1-physical-custody-red-20261019`). Production remains identical to
`8c9b14141f89872938d21cc35472b262929818d6`.

## Added physical witnesses

The existing native C6 embedding now supplies fourteen cases in
`test/wasm-service/bound-creation-physical-custody.integration.test.js`.
The original nine cases and their evidence limits are retained. Five cases
are added:

| Fault or race | Actual owner engagement | Required outcome |
| --- | --- | --- |
| Ordinary stop begins first, then exact retirement joins, then exact handler retirement fails | Real initialized native replica; pause its reconciliation shutdown, call real retirement, observe real metadata RELEASING, then fail exact transport retirement | Failed cleanup still holds the open ADMITTED file. A later `shutdownAll` must write the exact RETIRED tombstone and release the object and file. |
| Direct replica stop is still settling when the same retained bound creation is delivered again | Real initialized object in STOPPING, still registered and holding its database, before the lifecycle retirement set owns it | Creation refuses before replacing registration. After actual ordinary cleanup settles, an explicit retry may create a new CREATED object. |
| STOPPED services projection throws | Three native founders reach HELD, form and publish through real writers; only the exact old STOPPED writer is faulted | Real metadata CLOSED and local RETIRED may hold while the old services row and original IN_PROGRESS journal remain. Retry the original retirement to finish both owed effects. |
| STOPPED services projection returns retained work | Same real publication and retirement, with a retained writer answer | The original journal remains IN_PROGRESS; physical FINAL is reported separately as RETIRED_UNPROJECTED. |
| STOPPED writer is absent | Same real publication; the labelled runtime writer seam is removed | Absence of a writer is not completion proof. Restoring it permits only the original journal to complete. |

The three projection cases assert the original journal's nonterminal state
before asserting the new result vocabulary. Their baseline failure can
therefore demonstrate the real ordering defect, not just an absent field.
They also preserve the journal count and the other two founders' original
IN_PROGRESS rows. No services row for the subject is authored by the test.

Paused collaborators are released and admitted work is joined in `finally`.
The ordinary-stop-first case attaches a rejection handler immediately and
asserts the actual cleanup failure after releasing the pause. These tests
are native component/process-custody evidence, not abrupt-process,
power-loss, native metadata quorum or distinct-machine evidence.

## Consumer fixture corrections

The scripted runtime in `runtime-service-bound-route.test.js` now reads the
canonical manager record's `state` field, preserving its expected values.
The scripted driver in `service-runtime-consensus-publication.test.js`
retains one exact origin and supplies the synchronous read-only CURRENT
contract and explicit retirement finality; unresolved retirement remains
explicitly UNRESOLVED. The general handler fixture supplies the approved
journal-only hydration read with UNAVAILABLE, without adding a production
fallback for incomplete test doubles. Existing substantive assertions are
retained. These scripted answers are consumer contract evidence only.

## Independent design decision

`u1-retirement-projection-debt-clarification-20261019.md` records the narrow
independent approval of the ordered debt contract: physical FINAL, then the
actual old STOPPED projection, then the original journal completion CAS and
reread. An awaited projection alone is insufficient because the existing
runtime can return undefined for a swallowed non-ACTIVE writer failure.
The clarification introduces no new journal, durable record, timer or
background scheduler.

The direct-stop and joined-stop races enforce the already approved physical
custody and shutdown obligations; they do not authorize a change to the
generic successor policy or to the existing `.live` predicate.

## Static evidence and remaining gates

The canonical metadata refresh completed over 2,411 test files. Parser
checks and the scoped read-only fast-static gate passed under Node 22.16.0:

```
node scripts/check-fast-static.js --base 8c9b14141f89872938d21cc35472b262929818d6 --explain
changed paths: 14 (4 JavaScript)
fast-static: ok in 18928ms
```

The preceding run found one 103-character test line; it was wrapped and
metadata was refreshed before the successful run. No static guard or
ratchet was weakened. The successful gate covers the edited JavaScript,
dependency boundaries, shard and impact-contract audits and scoped metrics;
it is not a claim that all inherited global ratchets pass. This evidence
Markdown does not change the tested source or fixture subjects.

WIP publication uses the repository's documented preservation exemption,
with all lab and mutation gates still open. Required next steps are exact
test-only baseline receipts, independent oracle review, coherent corrected
U1 source review, the corrected exact-SHA run and meaningful source-only
negative controls. U2 and dependent activation implementation remain gated.
