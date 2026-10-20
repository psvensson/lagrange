# U1 V1/V3 inventory and execution-custody control review — 2026-10-20

**Disposition: bounded oracle/control evidence APPROVED; combined U1 OPEN.** This is an
inspection of immutable source, test files, direct GitHub commit-parent/diff
information, and terminal Lagrange-lab receipts. It is **not** an independent
whole-U1 source acceptance, a fresh local test execution, U2 permission, or a
merge certificate. All intentionally defective branches below are **negative
controls only; never merge them**.

## Exact positive checkpoint

- Source and test candidate:
  `ccdd6938c5e79ff95fbd71a2090ba4c800223266`.
- Two newly recovered witness paths:
  `test/node/runtime-service-restart-inventory-custody.test.js` (Git blob
  `aee8be3aefc8425cfc4564db694475bc85619065`),
  `test/node/runtime-service-remove-execution-custody.test.js` (Git blob
  `1ccdd109aace967ef199e0c190f88a2808385638`).
- [Lab #438](https://github.com/psvensson/lagrange-lab/issues/438):
  PASS, 2/2 files, 7 runner-reported cases, `tv-dator`.
- [Lab #439](https://github.com/psvensson/lagrange-lab/issues/439):
  PASS, 15/15 focused files, 418 runner-reported assertions, `tv-dator`.
- [Lab #440](https://github.com/psvensson/lagrange-lab/issues/440):
  PASS, 23/23 compatibility files, 958 runner-reported assertions,
  `lenovo-laptop`.

Those three runs use the same exact candidate and restore the earlier missing
two-witness positive selection. They are separately executed jobs, not a claim
that the repository-wide generated/static gate or the approximately 1,896-file
selected change cone has passed. A PASS is not independent review approval.

## Source-only mutations, frozen test bytes

Each mutation has `ccdd6938…` as its **direct parent**. The GitHub commit
diffs show only the named production source path was changed; the two witness
test blobs above are untouched. Full test-file result labels, not merely exit
codes, were inspected. These controls prove that the named invariant is
observable under this component setup.

| Control | Deliberately removed guarantee | Exact source mutation | Terminal result and decisive failure |
| --- | --- | --- | --- |
| V1-F | Failed inventory releases ownership for retry | [`b5999e19`](https://github.com/psvensson/lagrange/commit/b5999e199e0a45a57f7550e4566adb10f07d51c0) | [#447](https://github.com/psvensson/lagrange-lab/issues/447) FAIL as intended: `FAILED_SCAN_MUST_RELEASE_ITS_RETRY_OWNERSHIP`; 2/3 cases retained |
| V1-A | Repeated observers join the one inventory task | [`3edd823d`](https://github.com/psvensson/lagrange/commit/3edd823d866f768d3659ef49f382615f719ee7f1) | [#468](https://github.com/psvensson/lagrange-lab/issues/468) FAIL as intended: `THREE_OBSERVERS_STARTED_MULTIPLE_OWNER_SCANS`, actual 4 versus expected 2; 1/3 cases retained |
| V1-B | Post-await stopped/obsolete-task fence at journal and inspection returns | [`e01475fe`](https://github.com/psvensson/lagrange/commit/e01475fe1682a2f071de65bf34200a19d6782239) | [#470](https://github.com/psvensson/lagrange-lab/issues/470) FAIL as intended: shutdown-during-journal and shutdown-during-inspection returned plans (`outcome` undefined) instead of typed `UNAVAILABLE`; 1/3 cases retained |
| V3-S | Post-STOP exact successor memo guard | [`d9d95ac1`](https://github.com/psvensson/lagrange/commit/d9d95ac100262c19ce37b3561a76804457529b2e) | [#448](https://github.com/psvensson/lagrange-lab/issues/448) FAIL as intended: `LATE_OLD_STOP_SETTLED_SUCCESSOR_MEMO`; 3/4 cases retained |
| V3-G | STOP attempt always releases its admitted execution slot | [`881c1c31`](https://github.com/psvensson/lagrange/commit/881c1c319c6378451af42cba368cdc2f41024ca0) | [#449](https://github.com/psvensson/lagrange-lab/issues/449) FAIL as intended, with `LATE_RETURN_RETAINED_OLD_EXECUTION_GATE`, `UNRESOLVED_STOP_RETAINED_ITS_OLD_ATTEMPT_GATE` and queued-successor nonprogress; 1/4 cases retained |

**V1-B bounds:** it intentionally removes both post-await lifetime checks in one
source-only negative because either surviving guard can stop the same late
application. This establishes the combined lifetime contract under both held
journal and per-row inspection schedules. It does *not* establish independent
one-line kill evidence for each check in isolation, and does not justify
loosening either.

## Owner/contract conclusions

- The inventory's `restartTask` is the **single** shared scan owner.
  An unsuccessful scan releases that owner; a successful applied scan stays
  reusable; shutdown leaves neither new memos nor fresh ready admission.
  The source and witnesses preserve the original durable creation obligation.
- The runtime handler's installed execution entry is the **single** REMOVE
  scheduling owner. Its admitted memo/generation is separate from the
  coordinator observer. Physical STOP and outcome publication must each check
  identity; the exact old execution must be released even after supersession
  or failure. An observer is bounded to the existing entry.
- The bound-retirement witness validates captured original creation/token and
  one coordinator observer at the manager seam, **not** a full native
  resource-retirement or multi-machine test.
- The two new V1 controls and the earlier three controls constitute meaningful
  changed-source negative evidence, with actual first forbidden effects; this
  closes only these **five bounded control questions**. It does not imply
  comprehensive coverage of U1's original nine mechanism groups or 55 checks.

## Remaining mandatory decisions (unchanged)

1. Exact net production review/rebind of the changed nine-path owner delta
   since `ac092686975dd22b4843be8df8e2e1d3663c0b7f`, including the
   separately modified WASM shutdown exact-handler boundary.
2. Finish the normal current-source static/generated/impact/metadata gate and
   source-only controls for the other required mechanisms; no substitution of
   15+23 for the full changed-owner cone.
3. Reconcile P0–P5 return-currentness mutations and negative logs to the same
   final candidate, plus synchronous handler retirement and rollback/commit
   ordering. Adjacent request-Cell queued-START finding remains explicitly open.
4. Complete U1-1 through U1-7 and the 55-item/five-workstream acceptance
   matrix before U2 implementation, activation, or merging to `main`.

This evidence document is an **isolated review-branch addition only**: it does
not edit production, tests, frozen negative controls, or the positive candidate.
