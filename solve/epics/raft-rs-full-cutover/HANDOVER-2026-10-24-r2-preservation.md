---
audience: agent
status: preserved-wip-runtime-unmeasured
---

# Lagrange rs-raft: R2 preservation and handover, 24 October 2026

The user requested that all changes be committed and pushed and a handover
created. Implementation was frozen for this preservation. This checkpoint
contains the resumed R2 source repairs, two new test files, the diagnostic
reader adjustment, independent reviews, scoped static evidence and lab-request
preparation. It has **no new runtime result** and does not close the Quest.

## Canonical checkpoint

| Surface | Identity |
| --- | --- |
| Repository | `https://github.com/psvensson/lagrange` |
| Remote branch | `work/mg-delivery-resume-r2-20261023` |
| Canonical source checkpoint | `947107b63d54025d41253ae3414faf3af790ff88` |
| Source-checkpoint root tree | `87c15352c9be5c3851bd89f00fb65b62e8c5401c` |
| Source subtree | `5dcc352fe5c279215d33a9d6b7e97173cace3d10` |
| Test subtree | `9c1df949093858a711142563dc203844366e092e` |
| R2 base | `1e2fcc2da391ab72883132a22fbfbde39b2313f7` |
| Earlier preserved production draft | `681da1dc1beb5728a52ee5d223113b71b423156b` |
| Earlier doc-only preservation child | `64c34a5daa60a73668421e8a585f239312066b97` |
| Current checkout | `/workspace/scratch/0c0362d1530e/lagrange` |
| Active Quest | `solve/quests/retained-seed-original-handoff` |

The source checkpoint is remotely present and was fetched back. All **20
changed Git blobs** match the frozen working files; the manifest's 19 payload
entries also match. The twentieth file is the manifest itself. This handover
and the final preservation receipt are a documentation-only child of that
source checkpoint. Their source and test subtrees must remain identical.

The prior session's uncommitted R1 edits were lost when its environment
disconnected. R2 was authored afresh from the preserved branch and has its own
hashes and reviews. The earlier workspace-interruption record remains history;
its claim that the R1 files were unavailable must not be applied to these now
preserved R2 files.

### Preservation method and scope

Shell Git created local source commit
`92bc965165b631ba70cc6898dad36acb649a2318`, then its push failed because this
workspace had no HTTPS Git credentials. The authorized GitHub app created the
**identical tree** on the existing base and published canonical commit
`947107b63d54025d41253ae3414faf3af790ff88`. The Git tree identities match
exactly; the differing commit IDs reflect commit metadata. The receipt retains
the original local commit text and verifies all changed canonical blobs.

This uses the runbook's explicit non-main WIP preservation policy. The local
commit used `LAGRANGE_SKIP_PRECOMMIT=1`; final metadata and composed/runtime
gates were not represented as passing. The binary-evidence guard and staged
whitespace check passed separately. The first sandboxed binary-guard invocation
failed with `spawnSync git EPERM`; the same guard passed with authorized
escalation. No source assertion, timeout, checker or ratchet was weakened.

No main update, merge, Quest land, release, activation or publication approval
is implied. The original integration checkout was not used by this work.

## Read first when resuming

Read `AGENTS.md`, `docs/steering/rules.md` and
`docs/steering/router.md`, then the relevant owners. Keep the existing Quest;
do not create a second authority for the same delivery interaction.

Within this epic, read:

- `HANDOVER-2026-10-23-delivery-stop.md` for the original delivery contract,
  foundation, failed baseline and unfinished W7/W9 requirements.
- `HANDOVER-2026-10-23-resume-workspace-interruption.md` for the C1/C2 discovery
  and lost-R1 boundary, treating its file-custody status as historical.

Under the Quest's `evidence/` directory, read:

- `CONTRACT-mg-source-occurrence-delivery-2026-10-23.md`, including its
  superseding appendices. The rejected 1-MiB/64-event/64-target caps must not
  return.
- `PLAN-mg-delivery-witnesses-2026-10-23.md`.
- `DESIGN-mg-complete-vector-outcome-correction-r2-2026-10-23.md` and its review.
- The current R2/R2b reviews listed below.
- `MANIFEST-mg-delivery-user-handover-2026-10-24.json` and
  `RECEIPT-mg-delivery-user-handover-2026-10-24.json`.

The Quest remains open/red. The last recorded pure probe was eight failed
predicates against target zero; no new probe was run during preservation.
The earlier native-history and retained-state observer results retain their
original exact-source scope and do not validate this candidate. The missing
classification draft and historical elided TAP have not been recovered.

## What is preserved in R2

### Six source files

| File | Change |
| --- | --- |
| `src/partition/partition-cdc-obligation-delivery.js` | Retry timer and drive decisions use explicit states; delivery consumes canonical committed/provisional coverage. Existing cadence and ACK ownership remain. |
| `src/transport/message-router-ack-delivery.js` | A failed stale-socket termination is reported through the existing router diagnostic owner. |
| `src/transport/message-router-delivery-lifetime.js` | An unexpected timer exception reaches the existing idempotent refusal owner. |
| `src/topology/cdc-group-propagation-delivery-methods.js` | Delegates the foreground wait decision and recurring retry notices to their owners. The foreground loop remains here. |
| `src/topology/cdc-group-propagation-retry-wait-report.js` | Uses one bounded per-service throttle and console-only recurring scheduling notices. |
| New `src/topology/cdc-group-propagation-foreground-retry.js` | One explicit-context implementation of the existing stop/attempt/duration/wait decision. |

The delivery module is now **789 lines**, with a **31-line** extracted helper.
The earlier handover's unresolved over-800-line fact is therefore historical.
An initial broader extraction moved the retry loop and produced a new audit
finding; that extraction was rejected. No baseline was raised.

The existing native provisional-route test's captured-only snapshot now reads
`lane.retryTimer.handle !== null`. Calling the live diagnostic function there
would invoke `laneOf` and could alter tenure during the observation.

### Eight foreground boundary cases

The new file is
`test/topology/cdc-group-propagation-foreground-boundary.test.js`.

| Case | Required distinction |
| --- | --- |
| Stop after actual ATTEMPTS_EXHAUSTED | The consumer observes stop without a spent report or background entry. |
| Stop after actual ADVANCE | Stop wins after the real sleep completes and before consumer continuation. |
| Actual STOPPED followed by restart | The captured stopped result still terminates the original delivery. |
| Ordinary attempt exhaustion | Existing background continuation is armed and truthfully reported. |
| Durable attempt exhaustion | Source debt remains owed; ordinary immediate/background maps remain empty. |
| 49 ms remaining for a 50-ms delay | Positive insufficient duration refuses the retry. |
| 50 ms remaining for a 50-ms delay | Equality also refuses the retry. |
| 51 ms remaining for a 50-ms delay | The real delay completes; canonical provisional coverage releases the scan while debt remains and no ACK command is proposed. |

The tests observe the actual helper, sleep, stop/start and consumer. A barrier
delays consumption only after the real helper has returned. Exactly-one
decision assertions prevent downstream stop behavior from hiding an extra
foreground iteration. Durable component cases use actual source-ledger,
subscriber and topology owners with explicitly controlled recipient answers;
they do not claim native recipient commit proof.

### Four C1 predecessor cases

The new file is
`test/message-group/message-group-cdc-receiver-admission.test.js`.

It covers public durable single and batch admission at actual native queue
capacity, public follower admission while another forwarding operation occupies
capacity, and finite caller expiry while a real forwarded response remains
held. The capacity cases use a nested Symbol as a deep-capture discriminator,
then require INVALID with free capacity and a successful valid control.

**Use the corrected R2b review, not the withdrawn initial R2 approval.**
The first forwarding schedule allowed the addressed follower's own native
afterCommit to settle its waiter before the held remote response was released.
The current test holds actual replication to that follower, permits the real
leader and third voter to commit, verifies that the addressed follower has not
locally applied the occurrence, and observes queue closure before replaying
held native packets. This separates raw forwarding closure from local receipt
settlement without mocking queue admission or native receipt outcomes.

These four tests are approved for test-only predecessor measurement.
**C1 production correction remains unimplemented and the tests are unexecuted.**

## Exact source and test identities

| File | SHA256 |
| --- | --- |
| Obligation delivery | `e75b632711407fe62a0a988db8289f92b92d75c7dcfb48a19725f4bf93b53e5b` |
| ACK delivery | `cafcf8d5c232b7ef2bde63df07755ca20970a4488f9030bf3228b72b555f65e2` |
| Delivery lifetime | `4040ac08be6f4dc085f2d5fcab7c9677c9581c7c6eb0f1a4b9ed8f2f95947b4b` |
| Topology delivery methods | `c01fd917454bcb9b2e66453c646628cea36f1b22943cedc1feeb65d690ccf4bc` |
| Retry wait report | `e40e7b51b0e642035f698c33e08e9738e277a268606ea36e8bf6fabefd47ae93` |
| New foreground retry owner | `664f0d4e8d71eb68f291850c7e808ff7ccd6a42443a2fd3f36653bf2addd6712` |
| Native provisional-route test | `43cd093c6a10a69a49c7795f8a137f481fd1723f47f85b7544c4296312b3b751` |
| Foreground boundary test | `22e431a614636d34a8903b963608ca5245370046668b4825ae9661e1cce5e123` |
| Corrected C1 receiver test | `697d8f40301fc87ad410b22ddb3464244b44b027b70d15c73debd2861fdc6072` |

## Reviews and actual verification

Current independent review records under Quest evidence:

| Record | Applicable verdict |
| --- | --- |
| `REVIEW-mg-static-foreground-source-resume-r2-2026-10-23.md` | Approves the exact six source files and captured-reader differential for composition and non-main preservation, conditional on remaining gates. |
| `REVIEW-mg-foreground-boundary-resume-r2-2026-10-23.md` | Approves the exact eight-case component test for candidate composition and lab measurement. |
| `REVIEW-mg-receiver-admission-predecessor-resume-r2b-2026-10-23.md` | Approves the corrected C1 test for predecessor measurement. |
| `REVIEW-mg-receiver-admission-predecessor-resume-r2-2026-10-23.md` | Historical initial approval plus explicit withdrawal. It does not approve the earlier `f4192d3d...` test for measurement. |

The current file hashes were independently rechecked during preservation.
All match their applicable reviews and unchanged fixtures. The historical
withdrawal and its recorded earlier hash remain; the live test is R2b.

The author receipt is
`mg-delivery-resume-r2-2026-10-23/static-foreground-receipt.json`,
SHA256 `a976ace0dac40616b3fb5609d14904112fca47519321c5170561a63c4c27d086`.

| Check | Recorded result and scope |
| --- | --- |
| Syntax | Eight static/foreground source/test files pass. The corrected C1 test was separately syntax-checked by its reviewer. |
| Normal scoped ESLint | Pass on the static/foreground scope; corrected C1 test separately passed. |
| Decision-boundary audit | Zero new; three inherited findings. |
| Silent-catch audit | Zero findings. |
| Hot-path diagnostic audit | Zero new; one inherited finding. |
| Literal audit | Zero findings. |
| Whitespace and named ratchet baseline files | Pass; baselines unchanged. |
| Optional cognitive-complexity invocation | Could not start because the sonarjs plugin was not configured. No pass is claimed. |
| Canonical metadata / impact refresh | Not performed for this revision. |
| Final composed static gates | Not performed. |
| Predecessor, corrected candidate or broad runtime | Not executed. |

The source and test reviews do not close native delivery, C1/C2, W7/W9,
classification, protected activation, durable transfer, two-start recovery
or Quest acceptance.

## Outstanding composition corrections

### C1: receiver admission and forwarding custody

The public durable receiver in
`message-group-service-cdc-propagation-runtime-methods.js` captures input
before queue reservation and has a forwarding branch that bypasses bounded
admission. The proposed consolidation routes public durable input through the
existing `applyCDCBatch` / committed-acceptance owner, removes the competing
receiver ingress decision and charges raw forwarding through the same existing
`queue.ownOperation` mechanism.

Preserve canonical DEFER and terminal native-commit guards inside the owner.
Caller expiry must settle finitely while the raw forwarding operation retains
its slot until actual closure. Do not wrap the entire delivery in another
`ownOperation`: the local native route already owns a raw child, and a nested
outer wrapper risks deadlock or incorrect late custody. No new queue or cap is
part of this plan.

Measure the reviewed C1 test against unchanged production before implementing
this correction. The named intended failure cuts are:

- `C1_PUBLIC_SINGLE_CAPACITY_PRECEDES_DEEP_CAPTURE`
- `C1_PUBLIC_BATCH_CAPACITY_PRECEDES_DEEP_CAPTURE`
- `C1_PUBLIC_FOLLOWER_CAPACITY_PREVENTS_SECOND_FORWARD`
- `C1_PUBLIC_FORWARD_DEADLINE_SETTLES_BEFORE_RAW_CLOSE`

### C2: transport erases contradictory receipt fields

The defect remains in `normalizeDeliveryOutcome` and
`transport-semantic-outcome.js`: transport normalization can replace explicit
metadata before the canonical CDC validator examines it.

**No C2 test file or correction exists in this R2 checkpoint.** The lost R1
test's recorded hash is historical, not recoverable test custody here.
Recreate and independently review a new test using real local dispatch,
identified WebSocket SERVICE_RESPONSE and inline ACK paths, with positive
committed/provisional controls, wrong-group/ACK-only controls, and contradictory
metadata cases. Include provisional `deferRetry:false` and a conflicting
`deliveryState:'delivered'` with a positive retry hint.

The earlier recommended approach is transport-owned preservation of explicitly
supplied metadata through the existing metadata field list, with explicit state
conflicts remaining failures. Do not copy CDC grammar into transport or let a
raw delivered claim overwrite a computed failure/deferral. Require idempotence
because inline ACK replies are normalized twice. This remains a design
recommendation pending exact new tests, predecessor measurement and source review.

## Lab request and artifact custody

The normal route remains the current controller's generic `lab-work` operation
through `psvensson/lagrange-lab` Issues. Use exact-SHA locked execution and the
project's canonical runner. Do not use local runtime tests, raw SSH runners or
GitHub Actions. Always set `login:false` for shell calls.

The resumed session prepared these read-only requests:

| Request ID | Operation | Current evidence |
| --- | --- | --- |
| `820eddf1eda7434e8b7886437d1630fd` | ping | Submission unconfirmed; no matching issue or receipt found. |
| `361e210b7bdb4d9792dba17d9d1485f4` | fleet observation | Submission unconfirmed; no matching issue or receipt found. |

The posting tool call was interrupted without a confirmed issue URL. At
**08:38 Stockholm time on 24 October** (`06:38:12Z`), independent exact-ID
searches and a recent all-state issue inventory returned no match. The inventory
contained 20 issues, #1194 through #1213. This establishes observed absence,
not that an issue could never have existed historically. Both envelopes expired
around 01:53 Stockholm time on 24 October. Neither contains source-executing
work, and neither was replayed during preservation.

The exact request packets and
`preflight-submission-reconciliation-2026-10-24.json` are preserved in
`evidence/mg-delivery-resume-r2-2026-10-23/`.
Historical successful preflight #1187/#1188 is from the earlier session; it is
not a fresh health check or reservation. No source-executing request was built
or submitted by the resumed work, and there is no known runtime job to cancel.

### Reusable builder and collector

The original verified archive remains outside Git:

[Preserved draft archive](https://github.com/psvensson/lagrange/releases/download/solve-evidence/retained-seed-original-handoff--mg-delivery-candidate-drafts-preservation-20261023-1304.tar.gz)

Archive SHA256:
`c0eb799e1651a8feb0a3f4d349ed5d25d88ca83432ebe38348115167ee0656c6`
(732,117 bytes).

| Artifact | SHA256 |
| --- | --- |
| Reviewed request builder in archive `measurement-and-static/` | `4d07e125ebb1bf5db596933fdabc565023a7205fdcb5524c8fa65ea84a330b47` |
| Reviewed full TAP/stderr collector R2 in the same directory | `ae248b12797118ec5bbfdb671262337cec22f6599cb92208c93208911f1c1aa1` |
| Pinned `lab_pool_work_contract.py` | `2d6e5e3c2f032e205c37cbc8ecd1bb7fded442196fa22d91fc5c0fe4625f6586` |
| New exact relocation wrapper, `run-lab-request.py` | `dad8d81399a57eb5bc65b17172c8cfa812a69de4650b89a9c71bfaf5f16be45e` |

The newly authored 513-byte wrapper is now Git-backed in the R2 evidence
directory. Its original local layout was
`/workspace/scratch/0c0362d1530e/artifacts/`, with
`measurement-and-static/` and `lab-contract/` beside the wrapper.
Recreate that layout before using it; the Git copy is exact preservation of
the wrapper, not a claim that those sibling dependencies are installed beside
the evidence file.

The pinned contract is in `psvensson/lagrange-lab` at
`53e262450fada3b4e706898201a3c732811ae4d0`, path
`upgrades/v0.2.2/lab_pool_work_contract.py`. The wrapper only relocates the
builder's digest-checked directory. Fresh controller identity, release and pool
facts must be read before a future packet; changing deployment or contract bytes
requires inspection, not silently changing the digest check.

The collector invokes canonical `npm run test:file` once with retry-once zero,
retains command status, and emits full final TAP/stderr as bounded gzip/base64
parts. Capture the complete available worker stream and decode/hash these
artifacts. Normal completion is covered; hard-kill output custody is not claimed.

## Exact continuation order

1. Start from the remotely preserved branch. Verify the source/test subtree
   identities and read the current reviews. Keep historical rejections and
   evidence append-only. Do not import lost R1 approvals.
2. Recreate and review C2's test. Create an isolated test-only predecessor from
   `1e2fcc2da391ab72883132a22fbfbde39b2313f7`, copying the corrected C1 test
   and newly reviewed C2 test without these R2 production repairs.
3. Regenerate canonical test metadata, check the predecessor production tree
   remains unchanged, freeze and publish its exact commit, and independently
   review the lab packet. Obtain fresh preflight and use the usual locked lab,
   preferably tv-dator for attribution.
4. Measure the intended predecessor assertions with full TAP/stderr custody.
   Import, setup, deadline-precondition or fixture failures are not behavioral
   proof. Do not relax assertions or increase timeouts to make setup pass.
5. Implement C1/C2 through their existing owners only after the measured red.
   Review the exact composition, add affected owners and witnesses to the
   existing delivery impact contract, regenerate metadata and complete the
   applicable static gates. Include the new foreground helper in owner coverage.
6. Freeze and measure the focused candidate: existing delivery/native/router/
   vector/property tests, all new witnesses, and generic transport outcome
   regressions. Preserve every failure before deciding the next correction.
7. Finish W7 as the real source-owned A-before-B composite across several weak
   budgets, actual later formation/native routing and eventual source ACK.
   Finish W9's real sessionless 2-MiB CONFIG input, 65 native target groups,
   over-64 vector and real remote encoding. The SQLite TEXT versus wire-domain
   mismatch remains unresolved; it does not authorize rejected fixed caps.
8. Continue retained-work classification, protected activation, durable transfer
   and composed two-start recovery, then the broader integration and exact-main
   verification gates. None is complete by this preservation.

The user requires systematic owner-level investigation: trace the complete
operation, consult project history and primary references for the bug family,
and use actual project receipts and source-ledger evidence for acceptance.
