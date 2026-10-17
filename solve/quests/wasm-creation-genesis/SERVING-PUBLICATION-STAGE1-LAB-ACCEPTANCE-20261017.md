# Serving-publication/retirement stage 1: lab acceptance of the implementer snapshot (2026-10-17)

Lead-authored record (staged review, verification protocol v2). The stage
implements `SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017.md` as revised
(Revision 3 wins over Revision 2 wins over the original text). Implementation by
an Opus 5.5 implementer in the lane worktree; its hand-back report is retained
under `evidence/serving-publication-20261017/implementer-stage1-report.md`.
Independent verification is recorded separately (see the final section).

## Subject

| Item | Value |
| --- | --- |
| Base (lane tip, design Revision 3) | `7696c3d8e9fa5b978bd9a2adac0d157c7693cad6` = `refs/heads/work/rs-raft-event-reconciliation-20261016` |
| Snapshot under test | `300c360baac383cf016be7929788a8cb47860336` = `refs/heads/wip/rs-raft-serving-publication-1` (the implementer's uncommitted tree committed verbatim on top of the base by the lead; temp index -> write-tree -> commit-tree -> update-ref -> preservation push; the lane worktree's index, HEAD and files were not touched) |
| Diff | `git diff 7696c3d8e 300c360ba`: 37 paths, 8 new files, 3033 insertions, 373 deletions; `package-lock.json` unchanged (digest `8fb1a612...`, equal to the base and to the handover tip `35d533b6b`) |
| Lab policy at submission | bridge `lagrange-lab` v0.1.4, not paused, authorization `trusted-repository` for `psvensson/lagrange`, `exact-branch-tip`; `scripts/lab.js fleet` reported every host `lockfile-differs` against the primary checkout (`integrate/rs-raft-2026-09-30`, digest `82d5f5d6...`), which is not the lane's lockfile; every job below placed and ran at its exact requested head |

## Selection (30 files)

The retained 21 of `EVENT-RECONCILIATION-STAGE-LAB-ACCEPTANCE-20261017.md`,
unchanged, plus the frozen C1 witness `test/wasm-service/wasm-creation-bound-native.test.js`
(fixture superseded per N6), the two new files
`test/wasm-service/wasm-creation-publication.integration.test.js` and
`test/wasm-service/wasm-creation-local-record.test.js`, and six neighbours the
implementer named because unbound replicas now refuse user work when not READY:
`test/wasm-service/wasm-service-replica.test.js`,
`test/wasm-service/wasm-writer-completion-v1.test.js`,
`test/raft/raft-rs-backend/wasm-service-group-on-raft-rs.test.js`,
`test/raft/raft-rs-backend/durable-commit-replica-kinds.test.js`,
`test/raft/raft-rs-backend/runtime-opening-refusal.integration.test.js`,
`test/wasm-service/timer-manager.test.js`. Per-host lists:
`evidence/serving-publication-20261017/lab-stage1/<request_id>/request.json`.

## Jobs

| Issue | Host | Head | Files | Outcome | pass/fail | Assertions | Request SHA256 | Log SHA256 (bytes) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| #126 | lenovo-laptop | `300c360ba` | 10 | PASS | 10/0 | 245 | `66181b63c7c20219ad5c19cfbb99a880d7e9e468a06cbc62a36a7d602198ed4c` | `6607a78dcfe59191fc9e9734f1876416f1c06859956de3ea4a90ea83d712e9ad` (2523) |
| #127 | adam-laptop | `300c360ba` | 10 | FAIL | 9/1 | 345 | `8fd4e8fbd47c0bcb342bf8a727c362c4bc04d9a57671a72367e07c1c68ddfe07` | `39428125cbf62e28434e1cb3db9152e066165cc59a8298cb1b01a7f8e6e7f760` (54016) |
| #128 | tv-dator | `300c360ba` | 10 | FAIL | 8/2 | 300 | `e6f3000f6b5d2431ea031ce5814e14271f0ed6933be072967f0aae8300723aa5` | `63d218a7767eae47619e93a6c09995ff365c9847ac4829aa9e11588719359300` (9775) |
| #130 (base control) | tv-dator | `7696c3d8e` | 3 | FAIL | 0/3 | 60 | `351263001c049cdb325f70d629443f5d9a202d44f91987eba0088526e77a6a19` | `d57eda7db115c3f2f11ce3dd64976deb92a5d6b092f08e670c05014f5f1da09b` (58958) |

Every `placement-head` line in the three snapshot executor logs reads
`300c360baac383cf016be7929788a8cb47860336`; the control's reads
`7696c3d8e9fa5b978bd9a2adac0d157c7693cad6`. Request digests are the SHA256 of
the compact sorted-key `lagrange-lab-job/v1` body, recomputed locally from the
retained `request.json`. Thermal gating was observed by the executor on
adam-laptop (one 30 s hold at 76 C before the ordinary lane). Raw records and
their checksums: `evidence/serving-publication-20261017/lab-stage1/` (33 files,
`SHA256SUMS`); summary `LAB-RESULTS.json` there.

Stage witnesses, all green on the snapshot: publication integration (23
assertions, lenovo-laptop), local record (9), CAS table (10, now including the
allowed-from case), C1 bound-native (3, adam-laptop), genesis integration (14),
reconciliation integration (4), retained bootstrap (16), creation recovery (2),
runtime opening refusal (27), writer completion (7), wasm-service-lifecycle
(60), driver (61), runtime lifecycle (82/34/33), queue files (179/32/11/10),
timer manager (27), meta-table schemas (95), writer state (11), creation intent
(24), node shutdown teardown (23), selection admission (23), reconciliation
unit (8), strong-write native completion (2).

## The three reds: pre-existing at the base, identical failure sets

| File | Snapshot failure set | Base control (#130, same host) | Local controls (controller, classified runner, one file at a time) |
| --- | --- | --- | --- |
| `test/wasm-service/wasm-service-replica.test.js` | `applyCommittedEntry` subtests 1, 2, 3, 5 (`TypeError: Cannot read properties of undefined (reading 'push')`) + `lifecycle interleavings` model | identical five | implementer: identical set at the base and in its tree (its report F2) |
| `test/raft/raft-rs-backend/durable-commit-replica-kinds.test.js` | all 3 subtests (partition `partition_write_cutover_paused`; message-group `application transactions keep NORMAL` `[1]` vs `[1,2]`; WASM-service write `REFUSED INVALID_WRITER_COMMAND`) | identical three | identical three at the base worktree and in the lane worktree (`local-durable-commit-base.log`, `local-durable-commit-snapshot.log`) |
| `test/raft/raft-rs-backend/wasm-service-group-on-raft-rs.test.js` | subtests 3 (`written.accepted` undefined at `:238`) and 4 (restart kv check false at `:270`) | identical two | identical two at the base worktree and in the lane worktree (`local-wasm-group-base.log`, `local-wasm-group-snapshot.log`) |

None of the three files is touched by the diff (`git diff --stat 7696c3d8e
300c360ba -- test/raft/raft-rs-backend/` is empty; the replica unit file gains
only the N5 READY line and one appended assertion, both of which pass). The
stage therefore adds no red to the selection and removes none. All three are
lane-level reds outside the retained 21 and are recorded as findings below;
they are not this stage's to fix (R16) and are not absorbed (R17).

## Lead review notes (author-side, before the independent verdict)

- Source read in full by the lead: the six new modules, the reconciliation
  adapter, the opening phase machine, the replica and replica-lifecycle
  changes, the lifecycle, the metadata owner's allowed-from table, the manager
  and operations branches, the driver split. Tests and fixtures read: the N1
  supersessions (appended with Revision 3 citations; `assertHeld` and
  `assertNoServing` kept as witnesses of the never-observed schedule), the N6
  C1 fixture supersession (creation through `bootstrapConsensusCreation`,
  INIT authored by the continuation, retire by creation; the C1 discriminator
  kept), the CAS allowed-from case, the component fixture seams (gateway read
  fault distinct from the journal fault, hold-after-apply, lost-reply hook,
  retired-address answer, opt-in wake consumer).
- Noise to drop at commit: `test/shards/impact-contracts.json` re-serialized
  three unrelated `CL-040/041/042` descriptions from `\u00a7` escapes to the
  literal section sign; the lead restores the escapes so the diff carries only
  the `service-consensus-retained-native-bootstrap` contract change.
- The import-graph seal (`test/shards/impact-graph-seal.json`) is stale in the
  snapshot because six modules entered the graph; `solve land` refreshes it.

## Findings (R17)

1. Lane red outside the retained selection: `durable-commit-replica-kinds`
   fails for all three replica kinds at the lane tip (partition write admission
   paused by the participant transaction cutover; message-group application
   transactions not NORMAL; WASM-service write refused `INVALID_WRITER_COMMAND`).
   Owner: the lane's integration with the cutover branch, not this quest.
2. Lane red outside the retained selection: `wasm-service-group-on-raft-rs`
   subtests 3 and 4 (unbound WASM group write not accepted; restart kv check).
   Same owner as 1; the implementer's census found no unbound-path change
   beyond the serving fence, and the fence is not what fails here (identical at
   the base).
3. Lane red outside the retained selection: `wasm-service-replica` unit
   (`applyCommittedEntry` cases pass no `effects`; interleaving model deviations
   112/1884 at the base). Pre-existing; the N5 READY repair did not change the
   set.
4. `scripts/lab.js fleet` reports `lockfile-differs` against the primary
   checkout's branch, not against the SHA a job will run; it is not a readiness
   signal for a lane whose lockfile differs from the primary checkout's.
5. Design gap surfaced by the implementer (F0): sibling founders' grants race
   on the single `service_instances` row CAS; losers get a typed
   `STATE_CHANGED` hold and are re-driven by the operation owner (one
   desired-state cycle of latency per raced founder). Row granularity needs an
   owner decision in a later stage; the witnesses assert the typed hold and
   the re-drive, never a silent retry.

## Independent verification

Verifier: a separate Fable 5.1 subagent (`subagent:ae829628f3ad2b27f`), read-only
on the lane, working in its own detached worktree at the snapshot
`300c360ba`; brief retained in the session scratchpad, verdict retained at
`evidence/serving-publication-20261017/verifier/verifier-verdict-stage1.md`
with its mutation runner, plans and logs beside it. Verdict: **APPROVE**, no
blocking finding; eight non-blocking findings and two design-text amendments
recorded (design note, "Revision 3 amendment A1"; quest log).

- Frozen claim: design section 0 as amended by Revisions 2 and 3; oracle =
  metadata slot phase via the owner's CAS, the local record phase, the typed
  results.
- Coverage: vet B's 45 cells plus the Revision 3 cells, each mapped to a
  witness and assertion; UNCOVERED and recorded: cell 21 (KV timer fires after
  enable), cell 22 partial (safety tick), cell 29 (late apply between tombstone
  and port close, benign), the typed edges `LOCAL_GRANT_NOT_RECORDED` and
  `SERVING_ENABLE_FAILED` (traced: idempotent re-grant, local CAS, latch), and
  "a HELD replica keeps its subscriptions" (F-M1). The F0 assertion shape
  ("one wake per replica: OBSERVED or GRANT_HELD(STATE_CHANGED)") was judged a
  faithful consequence of the owner's single-row CAS, with the typed hold and
  re-drive themselves witnessed (P1 `reentries === 1`, P18).
- Independent census of guards, shutdown callers, failure readers,
  `changeResourceState` callers and `creationWake` readers: identical to the
  implementer's.
- Mutations: M1, M3, M4, M7, M8, M10, M11 re-run with matching first
  failures; eleven added by semantic class (V1-V11): nine engage (first
  failures named), V2 and V5 do not because their outputs are
  indistinguishable by design (open-time SERVING is already refused by
  admission; a stopping replica's landed grant is permitted to stay counted),
  V1b does not and is the F-M1 coverage gap. Every mutation restored
  byte-identically.
- Static on the snapshot: fast-static ok; decision boundaries 0 new over 22
  src files (baseline 806 unchanged); eslint clean on 36 files; complexity
  scoped 3 inherited; whole-tree complexity `1793 > 1755` and test duplication
  `698 > 697` VERIFIED identical at the base by restoring the diffed paths;
  cognitive 0; literals/silent-catch/runtime-grammar 0 new; shards current;
  file-size unchanged.
- Lab: placement heads matched for all four jobs; log digests matched
  `result.json`; the three reds judged pre-existing by independent reasoning
  (both unbound neighbours open through `initialize()` and fail in the writer
  codec, not at the serving fence).
- Required of the lead, done in this commit: the F-A1 design-text amendment
  (D4'/D5' "never blocks" superseded by "never a precondition of the fence;
  the handle release waits for the attempt to settle"); the N1 quest-log
  decision entry; R17 findings for F-W1, F-M1, F-W2, the uncovered edges and
  the three lane reds.

Lead's commit-time changes after the verdict (no source or test change):
`test/shards/impact-contracts.json` escapes restored (three unrelated
descriptions), `npm run test:metadata:refresh` (classes unchanged in
digest, import-graph seal refreshed), this record and the evidence folder.

## Stage 1b: amendment A2' (bounded owner-side re-decide for slot transitions)

Lead-authored addendum (2026-10-17). Owner decision recorded in the quest log
(option 2 of the F0 alternatives); amendment A2 vetted (REVISE, no mechanism
defect; `evidence/design-vets-20261017/design-vet-A2-20261017.md`), resolved
by A2' in the design note; implemented by an Opus 5.5 implementer (report
retained at `evidence/serving-publication-20261017/implementer-A2-report.md`).

| Item | Value |
| --- | --- |
| Base | `89e70949fcbd49655dd93ab1cfc728c1b17b0981` (stage 1 landed) |
| Snapshot under test | `8ec78a5e09cffa661acc249d576d25997adef9d1` = `refs/heads/wip/rs-raft-serving-publication-2` (the implementer's five uncommitted files plus the lead's uncommitted design/plan/log appends) |
| Diff | `src/control-plane/owners/service-instance-metadata.js` (184 -> 240 lines: `submitState`/`settleSubmission`, bounded `mutateResource`, `boundedChange`), `test/control-plane/service-instance-creation-cas.test.js` (CAS-A1, A1b, A1c, A2, A3, A4, A5a, A5b, A6, A7), `test/control-plane/service-instance-selection-admission.test.js` (:206-223 superseded), `test/wasm-service/wasm-creation-publication.integration.test.js` (P1/P13/P15/P18 changes, P19, P20), `test/wasm-service/wasm-retained-bootstrap-fixture.js` (`reenterOnWake` STATE_CHANGED branch removed) |

| Issue | Host | Head | Files | Outcome | Assertions | Request SHA256 | Log SHA256 (bytes) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #142 | lenovo-laptop | `8ec78a5e0` | 9 | PASS 9/0 | 263 | see `evidence/serving-publication-20261017/lab-stage1b/LAB-RESULTS.json` | idem |
| #143 | adam-laptop | `8ec78a5e0` | 8 | PASS 8/0 | 242 | idem | idem |

Selection = every test consumer of the metadata owner and its fixtures (17
files): CAS table (20 assertions, up from 10), selection-admission (23),
creation-intent (24), the two minimal-deployment owner guards, reconciliation
unit, `system-metadata-owner-modules` (146), local-record, publication
integration (25, up from 23: P19 and P20), genesis, reconciliation
integration, retained-bootstrap, C1 bound-native, creation-recovery,
wasm-service-lifecycle, driver, runtime-lifecycle. Both placement heads equal
the snapshot. No red. The three pre-existing lane reds recorded above are not
consumers of this owner and were not in the selection.

Red-first and mutations (implementer, retained under
`evidence/serving-publication-20261017/implementer-A2-*`): CAS-A1/A1b/A1c/A2/A3/A7
red before the source change (A4, A5a, A5b, A6 guard unchanged behaviour and
were green by design); 13 of 23 publication cases red; MA1-MA7 all engage
(MA1r added: single-shot for RELEASING/CLOSED only, caught by P19's own
retirement assertions; MA3 "bound removed" not measured because it would hang
the runner, both off-by-one directions measured instead).

Lead decisions on the implementer's open findings: the P19 tombstone oracle is
`ALREADY` for a live replica (the in-path tombstone of A1/N15 precedes the
by-path verification), asserted together with the local record RETIRED read
through a second connection; A2'.7's "tombstone.outcome === 'RETIRED'" was the
vet's wording for a replica with no live instance and is corrected by this
record. The stale comments at `wasm-creation-reconciliation.integration.test.js:94`
and `:122` ("re-drives a sibling-raced grant") are superseded by the lead at
commit, as is `wasm-creation-bound-native-fixture.js:312-314`.

Independent verification (stage 1b): a separate Fable 5.1 subagent
(`subagent:a8256b8a4e62d0ef5`) in its own detached worktree at the snapshot;
verdict **APPROVE**, no blocking finding
(`evidence/serving-publication-20261017/verifier-a2/verdict.md`, with its
mutation driver, probes and logs beside it). Coverage: 35 cells mapped to
committed witnesses, with six probes on the pristine source for the cells no
committed witness covers (recorded in A2''). Mechanism read line by line; the
loop lives only in `mutateResource`, selection stays single-shot, the bound is
nine submissions, each submission runs under a fresh write identity. Mutations
MA1-MA7 re-run with matching first failures, plus MA1r, VA1-VA4 and VA8 by
semantic class; VA1 ("UNKNOWN re-decided") was caught only natively, which
produced the component witness CAS-A8 that the lead added from the verifier's
own probe and ran green locally (`lab-stage1b/local-cas-a8.log`). Statics on
the snapshot: decision boundaries 0 (baseline 806), eslint clean, complexity
and cognitive 0, fast-static ok, shards current; the whole-corpus duplication,
literals, silent-catch and decision-boundary reds verified identical at the
base. Lab: both placement heads and log digests matched. Eight non-blocking
findings resolved or recorded in design section A2'' (F-1 text correction on
the final re-observation, F-2 CAS-A8, F-3 unreachable edge, F-4 citations,
F-5 P19 oracle, F-6/F-7 forms accepted, F-8 inherited statics).
