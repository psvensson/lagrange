# RS-Raft cloud-session stop and local-agent handover — 2026-10-26

**The user requested a stop. Stop new implementation/review/test packages.**
This is a custody and preservation checkpoint, **not a candidate accepted for main**.
No main merge, release publication, or exact-main post-merge certification has occurred.

Read [the 2026-10-25 preserved handover](HANDOVER-2026-10-25-codex-stop.md) first
for all original admin/source branches, exact failed patches, stop manifest,
fresh-seed controller, and pending milestone work. This addendum covers the later
cloud session and should not replace the original manifest.

## Restore source and choose the right branch

1. Load `AGENTS.md`, `docs/steering/rules.md`, then
   `docs/steering/router.md`; respect the current owner's contracts and
   normal hook/Quest workflow. The currently published baseline is
   `709dc2bebd4abdbec9a5d4fb2232c2621d7897f7`, whose executable
   parent is `9311c883d03fa7004f4ecfc43530c315a0f7b029`.
2. The **newest cloud WIP source** is the GitHub branch
   `work/cloud-metric-runner-composition-20261026`. Fetch its remote tip
   explicitly and verify its merge parents: runner root equivalent
   `49fd3ab7976dd1ccb2ae135cefe9d8867e5ed11e` and metric owner
   `0e6923bb82fb83db3015b51e7f48ae1336d5f581`. The original local
   runner parent was `7aee1d55c8c9cf6e80f17920dcadab7c2d91dd28`,
   with **the same tree** `b257d173000637631fc3e2e474892115e03e5bf3`
   as the published equivalent. Preserve both parents' semantics; no
   cherry-pick of older source over this integration.
3. The scratch checkout may be ephemeral. Trust **remote Git tree and
   commit identities**, not the cwd or an old agent's now-missing worktree.
   There is no force push, hook bypass, arbitrary ratchet increase,
   cancellation of another job, or reclassification of a red receipt in
   this checkpoint.

## This session's separately published work

| Package | Published GitHub head | Evidence and limit |
| --- | --- | --- |
| Native test-double repair | `work/cloud-native-fixture-contract-20261025` at `b5b75b93a7fff22a819990e186c623c335b92c1e` (tree `005050e3400820349e7745f90be1c0c6c4ad1a75`) | Independent APPROVE; [lab #2070](https://github.com/psvensson/lagrange-lab/issues/2070) ran 19/19 native files, 192 TAP entries (185 leaf assertions), no failed/skipped/retried tests. Formal Quest landing still held by broader gates. |
| Canonical Node24 child TAP and one owned test runner | `work/cloud-runner-native-integration-20261025` at `fa5aa7c6a1901c7241c96a272913938c96c5a44f` (tree `982e30c46fbab70c9b925b1b5114dba478f63993`) | Independent composition APPROVE for the runner; canonical TAP reporter and removal of inherited `NODE_TEST_CONTEXT` before children. Local 41 runner assertions pass, 19 native files/192 TAP entries pass. Full corpus/static still red. |
| Fresh-checkout bounded-output fixture directory | `work/cloud-runner-test-output-root-20261026` at `49fd3ab7976dd1ccb2ae135cefe9d8867e5ed11e` (tree `b257d173000637631fc3e2e474892115e03e5bf3`) | Test-only, independently APPROVE. Reproduced original ENOENT under fresh checkout, then repaired by the test's own `test-output` parent creation. A second fresh worktree passed 1/1 file, 41 assertions, no retries. Quest remains blocked because release gates are red. |
| Metric owner and current runner composition | `work/cloud-metric-runner-composition-20261026` (resolve its **remote tip SHA** when fetching) | WIP, two-parent merge of the preceding runner tree and metric head `0e6923bb...`, including regenerated test metadata and owner-debt inventory. Source preservation reviewed; **3/6 selected metric files fail** and the complete seven-file cone has not run. Do not call this independently accepted or ready for main. |

Normal Git hooks were **not bypassed**. Local Node24 needed
`NODE_OPTIONS=--max-old-space-size=6144` for the repository-wide
duplication scanner; the prior default Node heap exhausted despite adequate
physical memory. Do not treat this memory setting as a changed acceptance
criterion.

## Metric composition: exact red evidence

The source branch's combined metric provenance implementation was
independently **approved before composition**:
`solve/quests/metric-report-provenance/evidence/REVIEW-COMBINED-METRIC-SOURCE-2026-10-25.md`.
It incorporates actual analyzer read and resolution provenance, negative
probes, and effective HOME-derived CommonJS context (the earlier suspected
HOME escape was exercised by a real negative control, not left as a hypothesis).
An independent stop review verified 19 incoming JavaScript files: 18
byte-identical to the metric branch; the one difference is two nonexecuting
history-comment lines. Q6, CDC D2 and all `src/` runtime bytes stayed
unchanged. The approved M2 SHA256s are:

- `scripts/metric-report-inputs.js`:
  `ff23a957d07acb6d960fa866210c69b20f06c5b20ac81f5b58e50305eb817080`
- `test/scripts/metric-cycle-resolution.test.js`:
  `a03a97773f407075aab534c899b3fc2e6299070cb930ab283ec965a4cde7042c`

The merge's **new six-file run failed** (3 passing files, 3 failing,
173 runner-reported assertions, no retries). The run selected
`metric-report-provenance`, `metric-report-inputs`,
`metric-cycle-custody`, `metric-cycle-resolution`,
`metric-duplication-inputs` and `complexity-ratchet-closure`.
The passing files reported 31 assertions total (4+23+6). All three failing
files first recorded a 30-second TAP expiry. Resolution had completed nine
HOME checks; inputs had completed its preceding M1 checks. Provenance
timed out within the first async test after 17 checks, followed by an ENOENT
from a late content read after fixture teardown. That **may** be a teardown
race but is not proven local; two intended runtime-context checks were never
reached. Do not paper over it by raising timeouts or claiming all passed.
The required seventh file `inventory-ordinal-segments.test.js` was not
selected, so there is no official seven-file acceptance.

See
`metric-provenance-lineage-composition-20261026/evidence/2026-10-26-composition-stop.json`
for per-file counts, exact command, TAP/ledger SHA256s and caveats. Raw
local `.tap` files/ledger are ignored work output; **they have not been
published**, so a local agent should reproduce the test cone on a pinned
checkout before closing the custody/lifetime failure.

`npm run test:metadata:refresh` and the generated global-owner inventory
refresh both exited zero. Their five generated files were composed rather
than replaced by hand. Measured full cyclomatic total remains
**1765 against 1755** (red); cognitive 150/150, cycles 0/0,
source duplication 44/44 and test duplication 653/654 passed. Full corpus
and final release gates are still open.

## Lab job custody: one earlier request still nonterminal

[Lagrange Lab request #2127](https://github.com/psvensson/lagrange-lab/issues/2127)
was submitted for the earlier `fa5aa7c6a1901c7241c96a272913938c96c5a44f`
exact-source 19-native-file plus runner witness, request ID
`c7b1d140-5f53-4c3b-a4e2-cd8778ede936`. The body is one canonical
base64-part request, SHA256
`cdee80b684fe813820177cd5d95c259b65d5ebe3350b6af30642699951fca6d0`;
its request expiry is `2026-10-26T07:43:49.365Z`.
At the last checked comments (`2026-10-26T05:26Z`), it had **only the
submission comment**: no claim, execution receipt, or terminal result.
This is not a passing lab result. Check its actual terminal custody **before**
submitting a replacement; do not cancel/delete an unknown in-flight job.
Lab #2070 is a distinct completed native fixture witness, not #2127's result.

## Existing blockers carried forward

- **Fresh seed:** the independently approved controller and public startup
  smoke checks do not substitute for the canonical external fresh-seed
  receipt, which has never run on the composed candidate.
- **Admin:** node removal, PG-wire scaling and exact table identity have
  bounded approvals but were not composed. Coordinator identity and
  config/policy mutation outcome commits await independent review.
  Diagnostic-marker and partition-cohort readback remain **normal-hook
  blocked** with exact source patches preserved by the 2026-10-25 handover.
  Do not bypass 13/14 ambient-intrinsic findings.
- **Caller migration:** still need marker-backed write-ack visibility,
  seven mixed-load scenarios with one provisioned user table and original
  acknowledgments/fault obligations, separate control-plane marker proof,
  and MovieLens owned-session reset only after failed-shutdown custody.
  Preserve the invocation journal.
- **CDC D4:** real three-node joining-group handoff, held nonactive
  hydration, over 256 updates and delete, positioned live convergence
  and authoritative equality; joining-group fan-out admission remains
  unresolved. Do not remove the old window before this witness.
- **Other gates:** retained-seed, FreshMG, transactions and split/merge,
  snapshots, WASM, W7 ordering and eventual native acknowledgment,
  W9 actual 2 MiB input / 65 remote targets / over-64 vector semantics,
  broad corpus/static, exact-source service/recovery/composition,
  repeated five-machine certification, independent closeout and
  exact-main post-merge proof.
- **Capability decisions:** preserve the old affinity demo's exact
  two-replica/20-candidate experiment or replace it with a public Binding
  experiment; retire callback uploader or implement an owned publication
  capability. Neither choice was made. Acknowledged message-group-ID
  and completed transaction-record endurance are **separate follow-ups**,
  not automatically new merge blockers and not TTL authorizations.

## Safe next move for a local agent

On an explicit **resume** instruction, fetch the remote cloud WIP branch;
check commit parents, clean source tree, Quest red receipts, lab #2127
terminal state and current GitHub branches. Investigate the **common
test-runner/file-timeout/fixture-lifetime mechanism** across the three
metric reds (and historical parallel test failures) before claiming a
local fixture issue. Fix at one named authoritative owner; no compatibility
fallback, second analyzer, arbitrary time extension or weakened oracle.
Run the sealed seven-file cone with retries disabled, then independent
review on the **exact** tested tree. Keep further admin/D4 composition
serialized, and never advance to main while release gates are red.

**At this stop:** no further implementation was started, no main merge
was performed, and this WIP checkpoint is preserved for the local agent.
