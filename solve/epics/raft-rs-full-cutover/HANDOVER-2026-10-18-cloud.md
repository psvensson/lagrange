# Handover: rs-raft cloud takeover, 2026-10-18

Prepared when the owner requested: **commit and push all changes, then prepare a handover**. Implementation and new test submissions were stopped. This is a preservation checkpoint, not a recovery-stage acceptance or merge approval.

Read this note first, then the newest append-only entries in `closeout-plan-2026-10-17.md` and `solve/quests/wasm-creation-genesis/log.ndjson`. The earlier `HANDOVER-2026-10-17-evening.md` remains historical evidence; its unit-1 and lab status is superseded below.

## Exact state

| Item | State at this checkpoint |
| --- | --- |
| Lane / PR | `work/rs-raft-event-reconciliation-20261016`, draft PR [#134](https://github.com/psvensson/lagrange/pull/134). The commit containing this note is the new preservation head. |
| Production and test source | **Unchanged from `a251ce4fd9c980a78c0fd33d8a5f873161f90870`.** No corrective implementation or test-only checkpoint was made in this cloud takeover. New independent tests are preserved as evidence patches, not adopted into the production test tree. |
| Original U1 verification subject | `a251ce4fd9c980a78c0fd33d8a5f873161f90870`, base `381750de29af647d446b19adedf1da53eb712093`: **independently REJECTED**. |
| Original U1 lab snapshot | `d55cb368d027d40c780ab8463aa6b1f254d2a540`, `refs/heads/wip/rs-raft-recovery-u1-1`; its source/test bytes match the U1 subject. |
| Composed candidate | `integration/rs-raft-candidate-20261017` remains `e7a3525a52afcc1e38218483f87ca3a74a421744`, re-read from GitHub at checkpoint. It was not modified. |
| Last fetched main | `47889ca3443abf04a5a79252f4b6db95a28799b5`; re-fetch before eventual composition or merge. |
| Cloud lane worktree | `/workspace/scratch/6d2a7b72384f/lagrange`. |
| Independent verifier worktree | `/workspace/scratch/6d2a7b72384f/verify-recovery-u1`, restored clean at the original subject. |
| Other work | The user's original primary checkout, its staged work, and the other agent's branch were not touched. |

All evidence paths below are relative to `solve/quests/wasm-creation-genesis/evidence/recovery-20261017/` unless stated otherwise. A later session can obtain the exact preservation SHA with `git log -1 --format=%H -- solve/epics/raft-rs-full-cutover/HANDOVER-2026-10-18-cloud.md`; the publication response/PR comment records the verified remote head.

## 1. Independent unit-1 verification is complete and rejects the implementation

The full content-bound verdict is `verifier-recovery-u1-cloud/verdict.md`, SHA256 **`aa5ec206809b76613f55b7547b318a3d4994757d7379d71dbd83fcc5c9b2f168`**. It covers all 31 changed source/test paths, all 55 applicable checklist items across nine templates, the approved design through Revision 5, the requested coverage dimensions, and the complete refusal census.

| Finding | Measured failure |
| --- | --- |
| F1: false reservation finality | `TARGET_ALREADY_OWNED`, `INVALID_EXPECTED_STATE`, and future-binding `STALE_BINDING` each allow the same delayed original request to become ADMITTED after its journal was CANCELLED. The cancelled row has no admission receipt and disappears from recovery inventory. |
| F2: missing inventory lifetime and one-shot ownership | A suspended scan resumes after shutdown and real directory-owner transfer, rebuilds the dead handler memo and invokes old continuation. Separately, concurrent scans let an earlier late scan overwrite ACTIVE with HELD. |
| F3: startup retirement bypasses REMOVE serialization | Coordinator REMOVE and startup RETIRED redrive enter bound stop concurrently for the same canonical replica. Lower idempotence is not the promised admission gate. |
| F4: by-path retirement outlives physical custody | Retirement paused at metadata release is not joined by lifecycle shutdown. After real directory-owner transfer, the old task writes RETIRED locally and CLOSED in authority. |
| F5: historical closure leaves journal residue | Local RETIRED plus old authority history loss is interpreted as done by the handler, while runtime/manager do not project STOPPED or complete the original journal. The row stays IN_PROGRESS. |
| F6: one canonical memo drops distinct obligations | Successor-first inventory lets the old creation replace the successor memo; the successor is never resumed. Reproduced for REENTER + RETIRED and for two ABSENT_UNCLAIMED/REENTER plans. Merely prioritizing REENTER does not fix it. |

The independent patch `verifier-recovery-u1-cloud/independent/independent-witnesses-complete.patch` contains **15 cases: ten counterexamples and five controls**. Every constituent snippet was measured. The combined convenience patch was not rerun as one combined suite. All **13 required independent production mutations were killed**, with exact source restoration after each. M02/M05/M12 also fail direct named assertions after an 18/18 green control run.

When adopting the overlap test for a correct shared startup promise, adapt its setup: assert one underlying scan and shared completion, release the scan gate, then await both callers. The original witness awaited the second concurrent scan before releasing the first in order to demonstrate the defect. Preserve its semantic assertion; do not deadlock a correctly serialized implementation with the old setup.

### Measurements and ceilings

- Original required local suites: **240 tests, 233 pass, seven fail; no skips/cancellations**. All seven driver-conformance failures reproduce identically against the exact changed-production base comparison (30 tests, 23 pass, seven fail on both). They remain inherited failures.
- Fast static passes for the explicit full range: **152 changed paths / 26 JavaScript files**. All 17 changed production files received individual decision-boundary scans. ESLint, cognitive complexity, impact contracts and final shard audit pass. Six scoped-complexity violations and one silent catch are inherited, unchanged.
- Final shard audit covers **2,410 files** with the real pinned MovieLens data. No classification metadata was changed to hide missing data.
- Duplication: tests **698 groups / 26,458 lines**, source/scripts **47 / 1,462**; unused exports **1,456**. These exactly match the inherited observations in the brief, and their configured ratchets still report failure.
- Import seal: source and producer-input digests match. Two local refreshes agree, but resolver/snapshot digests differ from the committed dependency surface. Exact committed seal bytes were **not** reproduced.
- Initial Node/ABI errors, default-sandbox Git subprocess failure, missing data and initial duplication OOM are recorded as prerequisites, never zero-test passes.

`verifier-recovery-u1-cloud/PRESERVATION.md` and its manifest describe exact copies. Test-append snippets retain their bytes with `.txt` appended because they are evidence, not standalone modules. The full raw duplication JSON is 2,560,765 bytes and exceeds the repository's 1 MiB evidence rule. Its complete bytes are saved separately as **`rs-raft-u1-duplication-raw-20261018.json`**, SHA256 **`24b459d282dcb6fb287b94028877818f6429fcb1b4e480d13fb168c9a0d35449`**. `static-prereq-reruns/jscpd-test.external-evidence.json` records its saved identity. The committed summary retains every statistic and duplicate location, omitting only repeated source fragments. The canonical `solve-evidence` release upload could not start because `gh` was unavailable; upload through that existing owner when available. Do not claim that release upload succeeded.

## 2. Correction design: bounded finality approved; inventory review incomplete

### Reservation finality — APPROVED, not implemented

`u1-reservation-finality-bounded-verdict.md` approves only the finality subsection and its oracles in `u1-correction-proposal.md`, SHA256 **`90d98bb2bae217faaeff848200bc684ccfc20a9ac4c2c1a22fc8b759b8a61d34`**, lines 11–46 and the corresponding witnesses.

The agreed boundary is explicit `reservationRefusal: SEALED | UNRESOLVED` on every negative public reserve result. Only the deterministic resource-state owner supplies SEALED from a monotone fact. The metadata interaction marks all other negative outcomes, including capture, encoding, read, submission and contention failure, UNRESOLVED. REMOVE may cancel only from SEALED; UNRESOLVED leaves the original PENDING row and returns UNKNOWN with its owner reason. ADMITTED still persists the exact token before retirement. Terminal journal observations and corrupt identity keep their distinct existing semantics.

The three false-finality owner witnesses must become green, alongside positive cancellation and exact-token retention, future versus irrevocably old binding controls, ordinal/winner/content cases, matching CLOSED admission, retiring binding, ordinal overflow versus encoding capacity, unknown write, unavailable read and bounded-zero contention. An older/fake owner response without SEALED proof must fail closed. Do not reconstruct finality from outcome names in the intent caller.

Assigned source owners: `src/constants/service-instance.js`, `src/control-plane/owners/service-instance-state.js`, `src/control-plane/owners/service-instance-metadata.js`, `src/service/service-consensus-creation-intent.js`. **No edits, test adoption, test-only checkpoint or implementation tests were made before the stop.** `stopped-status.md` confirms that boundary.

### Inventory/lifetime — DRAFT, no approval

`u1-inventory-continuation-contract-v2.md`, SHA256 **`b871e38a5307933e32c085e55e47b0a650c42319da85073b67e028116594858f`**, is a proposed coherent correction. It retains exact plans per original journal identity; one atomic recoverable journal query; shared startup task and closed lifetime; collision-only pending-current memo; currentness consumed from the physical lifecycle owner; one CREATE/REMOVE admission gate with captured REMOVE origin; shared physical retirement finality; separate original-journal completion; stated retry triggers; and joined by-path retirement.

Its independent review stopped at the owner's checkpoint request. `verifier-recovery-u1-cloud/correction-design-review.md` is **INCOMPLETE / REVISE**, SHA256 **`1b9295a3d4e29beec1107adf6dfb9b778244fcf66358a1d3fb5d7eeacadde5d9`**. Preliminary D1 must be resolved: once J becomes current, normal ACTIVE(J) routing refuses a retained noncurrent F as foreign, and HELD(J) routing reenters J. V2 nevertheless promises original CREATE redelivery/wakes will retry F. Give known exact retained-plan lookup explicit precedence after the initial collision, with a named RV6.2/RV7.3 amendment, or provide a different truthful retry contract. Then finish the full review. None of the unreviewed subsections is approved by implication.

Also preserve the distinction discovered during preparation: `{closed: true, completion: UNKNOWN}` is not confirmed original-journal completion. Physical finality alone cannot discharge startup debt or produce the fully completed handler result under the proposed ordering.

## 3. Lab status and requests

The owner successfully reconciled original #160, request `7fe5fca662d2737e8f8e7911db1f072f`, using both required flags:

```sh
~/.local/bin/lagrange-lab reconcile \
  7fe5fca662d2737e8f8e7911db1f072f \
  --confirmed-no-live-work \
  --reason "Job 160 finished with exit_code=0, fail=0 and thermal_scope_closed=true; UNCERTAIN was caused by INCONSISTENT_TAP_COUNTS."
```

This recorded reconciliation; it did not rerun the request. Do not run it again as a routine restart step.

Fresh verified ping #188 at 2026-10-17 20:41:40 UTC reported deployed **v0.1.6**, unpaused, no uncertain execution, trusted `psvensson/lagrange` authorization until revoked, and four hosts: `tv-dator`, `lenovo-laptop`, `adam-laptop`, `adams-gamla`. That is a historical status snapshot. Recheck current deployment/custody before subsequent runs; v0.1.7/v0.1.8 source PRs are not installation receipts. Do not change the lab controller or another project's work as part of this lane.

| Lab issue | Latest recorded outcome | Consequence |
| --- | --- | --- |
| #173–#176 | Original requests only WAITING_APPROVAL in the collected records. Their requested stage-1c SHA is no longer the moving lane branch tip. | No stage-1c execution/proof may be inferred. Prepared replacements below use an exact preservation ref. Original expiry about 05:50 UTC on Oct 18. |
| #183 | COMPLETE PASS, 19/19 files, 426 assertions, adam-laptop. | Original U1 lab component evidence, not independent approval. |
| #184 | COMPLETE FAIL, 18/19 files, 356 assertions, adams-gamla. | Full log's first failure still needs typed evidence retrieval and exact base-signature comparison. Local conformance is inherited red; do not assume the lab failure matches without reading it. |
| #177, set A claimed-good endpoint | COMPLETE FAIL, six pass / six fail, 95 assertions. | Claimed good is not green. Obtain failed-file signatures and establish a valid good endpoint before bisection. |
| #178, set B good | COMPLETE PASS, 3/3 files, 64 assertions. | Validated green endpoint. |
| #190, set B original bad | COMPLETE FAIL, 0/3 files pass, 64 assertions. | Validated behavior-red endpoint. |
| #191, set B midpoint 1 | COMPLETE PASS, 3/3 files, 64 assertions. | Narrows the range. |
| #192, set B midpoint 2 | COMPLETE FAIL at 04:55:08 UTC, 1/3 files pass, 64 assertions. | Latest completed root request; 35 first-parent commits remain in the range. No next source job submitted after the stop. |

Root request/receipt copies and bisection state are in `cloud-rsraft-bisect/`. Agent request preparation and stopped-state records are in `cloud-lab-evidence/`. Validate controller ID, request digest, exact source/ref and hosts, terminal outcome/exit and planned/actual counts. A truncated tail is not the whole log. A CLAIMED record is not completion. An absent result is not PASS.

### Stage-1c replacements: prepared, not confirmed submitted

Root created and re-read `refs/heads/probe/rs-raft-stage1c-381750de2-20261017` at **`381750de29af647d446b19adedf1da53eb712093`**. `cloud-lab-evidence/stage1c-replacement-manifest.json` holds the exact original 89 files split 27/27/27/8, same hosts, immutable request bodies and digests. The four prepared IDs are:

- #173 replacement: `c057e0b45fd2f2f4017b88425f18ec83`.
- #174 replacement: `b40ecd8f1348c2eb6c36633dc2b38fce`.
- #175 replacement: `44b6ff22c17482e8f60fbf2d494dfbf9`.
- #176 replacement: `b86c2ddf52983d5bc883d22edbb8392d`.

These bodies expire **08:45:10 UTC on Oct 18**. The first replacement is **SUBMISSION_UNCERTAIN**: a retry create was interrupted after approximately 579 seconds with no issue or cell ID returned. The other three were **NEVER SUBMITTED**. Root's subsequent latest-five issue collection still ended at #192, but it does not authorize blind replay of the interrupted mutation. `cloud-lab-evidence/stopped-status.md` records that distinction. Search exact IDs and inspect the original journal before retrying any uncertain submission; preserve the same immutable request if it already exists. A newly required request after expiry needs a new ID and truthful timestamps. The owner's standing authorization covers these preserved source tests; another conversational permission ask is unnecessary.

### Bisection restart

Set B files: `operation-port-boundary.test.js`, `wasm-service-group-on-raft-rs.test.js` under `test/raft/raft-rs-backend/`, plus `test/wasm-service/wasm-service-replica.test.js`.

- Proven current good: **`9ff61abda9d28dd58b60f71f3890e4fdd5a2845d`**, #191, request `103d8905ea4d0215b44d7b65f7906b15`.
- Proven current bad: **`9b53962f2e7b8402b2a6a02a4a24b45985cd3563`**, #192, request `8ea4ccbfc45f447ca66191267d1f3daf`, digest `25c6c526e35b665873042fa27ed4b6594310ba87bb0978a507df5e5000c4c6a0`.
- Next midpoint: **`c425ef42e18236ff1187e1112a971588bb02b496`**, index 52 in the preserved first-parent history. **Not submitted.**

Set A's claimed-good `e7c89f4b5114c0238312d3831b65889a4622f4e9` failed #177; claimed-bad is `e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f`. Do not binary-search that purported interval until the endpoint problem is classified.

Do not execute `bisect-lab-v3.sh.txt` unmodified. It has obsolete local paths, a force-push fallback, and unsound result classification (absence of `not ok` can become GOOD, SKIP can be treated as BAD). This takeover used unique fixed probe refs and original issue receipts instead. Keep requests serialized under the actual deployed lab owner; do not assume asynchronous execution from an uninstalled PR. No bisection script remains running in this session.

## 4. Unit 2 and activation preparation

Unit 2 remains unimplemented. `u2-owner-plan.md` maps the existing opening journal, per-process grant confirmation, result propagation and C9 child-process seams. `u2-progress-bound-amendment-draft.md` exposes a contract discrepancy: current APPLIED_PROGRESS is a payload-free notification that can cover a batch of many committed writes. A position payload alone cannot guarantee completion within K writes if an event arrives after a larger batch. Explicitly resolve the approved write-bound versus event-bound wording; do not silently weaken it. Quiet-group progress also needs a known zero counter phase.

`activation-prerequisite-audit.md` maps the charter into reviewable units and all eight identity consumers. Concrete upstream prerequisites include:

1. Installed catalog activation currently ends at ACTIVATION_UNSUPPORTED / RECORDED_NOT_RUNNING; an existing owner must hand installation to the desired definition/creation revision.
2. CONTRACT-R2 requires durable custody of complete pre-selection K/request bytes before first selection delivery, including nonce and founding peers. The capture helper does not provide durability; do not recreate the rejected per-creation catalog history.
3. Injecting an empty ModuleMirror does not load installed artifact bytes on founder nodes.
4. Production projection submission always returns RETAINED while alive. Its exact APPLIED receipt must continue the existing endpoint/PRESENT/ACTIVE path; repeated START alone cannot clear PUBLISHED_UNPROJECTED.
5. HELD budget behavior must cover both the step timeout and the parent operation budget.

Candidate F3 learner cleanup still needs its actual source review and owner repair. Some candidate blobs were absent in the preparer's partial clone; that source-review ceiling is explicit in the audit.

## 5. Resume in this order

1. Read the complete independent U1 rejection and preserve every counterexample. Implement the bounded approved finality correction, beginning with the required test-only checkpoint, then obtain separate independent implementation verification.
2. Resolve inventory draft D1; finish independent content-bound contract/oracle approval before production changes. Implement the six finding classes at their existing owners, including every original journal obligation, current projection ownership, exact gate settlement and physical shutdown joins. Independently verify the complete corrected U1.
3. Implement and verify U2, after the K-bound decision, including the real abrupt-process C9 proof.
4. Complete stage-1c lab replacements/classification and both lane-regression investigations. Set B can resume at the exact range above; Set A first needs a valid good endpoint. Retain inherited reds honestly and repair owners without raising baselines.
5. Compose onto the candidate, execute the activation quest in reviewed units, then the certification formations and closeout. Existing bar remains three consecutive certifications at one frozen SHA on **five distinct machines**; the historical four-host bridge snapshot does not meet it.
6. Complete the exact candidate gates and final owner approval/merge/publisher procedure from the closeout plan. This checkpoint authorizes no acceptance shortcut. The separate 0.3 release obligations remain separate.

### Runtime and custody notes

Use Node 22 and the exact lockfile. In this cloud workspace the verified runtime was `node22-download/node-v22.16.0-linux-x64/bin/node`; verify `node --version` in the same execution context before tests/hooks, because restored directory permissions can make a PATH lookup fall through to Node 24. `better-sqlite3` was rebuilt for Node 22. Default-sandbox Node child-process Git calls previously returned EPERM even with correct stdout; use the permitted normal execution context that actually reads the whole changed range rather than accepting a zero-path static result.

The real MovieLens `u.data` is 1,979,173 bytes with pinned SHA256 `06416e597f82b7342361e41163890c81036900f418ad91315590814211dca490`, downloaded from the repository's existing canonical GroupLens URL. Treat any missing dataset/import-seal mismatch as a prerequisite, never as permission to regenerate acceptance metadata around missing inputs.

All subagents were asked to stop at the owner's request. The verifier and implementation-preparation agent report no live runner or pending mutation; the lab stopped-state manifest records any uncertain issue submission separately. Continue from committed evidence, not from assumed survival of cloud processes or temporary paths.
