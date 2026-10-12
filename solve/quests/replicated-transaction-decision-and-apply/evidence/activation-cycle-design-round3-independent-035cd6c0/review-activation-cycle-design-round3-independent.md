# Activation cycle round 13 — independent design review, round 3

## Verdict

**REVISE the complete activation-cycle design; product source remains HOLD.** This round identifies three grouped boundaries:

1. **AC13-1 — high: first history initialization is not a complete bootstrap handoff.** First CLAIM requires the committed participant-generation origin before PAUSE, but the first control release obtains that origin after PAUSE/drain. The companion first-binding transition for a fresh dependent history is also unstated; the author model preinstalls it outside the commands.
2. **AC13-2 — high: root-to-control result custody lacks a specified slot-reuse fence or historical unresolved-claim result.** The exact candidate now survives submission. If an authorized recovery worker completes/supersedes its committed cycle while its origin still has `submitted_unknown`, the current singleton can advance past the exact result. The contract must either prohibit that schedule through a durable acknowledgement handoff, or define the canonical terminal readback for the retained candidate. Old-target authorization retirement is not that readback.
3. **AC13-3 — medium: the new successor-candidate allowance conflicts with the retained expiry rule.** One clause allows a new candidate/PAUSE under a later recovery turn after committed refusal; the retained rule prohibits a new cycle or PAUSE in such a turn. Same immutable root does not by itself resolve which remaining entitlement permits the next effect.

These are design contradictions/incomplete handoffs, **not assertions that unimplemented source has failed a runtime test**. No future source measurements are demanded as a condition of fixing the contract.

**Scoped design positives:** the exact pre-submit root candidate, captured-versus-submitted states, immutable supersession/current-envelope separation, deterministic before/after PAUSE predicates, and history-scoped old-target retirement are coherent within their stated established-history preconditions. The supersession dispatch correction closes AC12-2 at that scope. AC12-1's missing pre-submit byte custody is addressed; AC13-2 concerns the subsequent result transfer. AC12-3's durable domain, authentic-image continuity and incompatible-history HOLD are addressed once the history exists; AC13-1 concerns first creation/binding.

The accepted local HOLD/owner-ordered retirement/deterministic apply ruling, committed-control-winner-before-PAUSE, no-loser-effect rule, complete population, same-attempt post-ENABLE catch-up, R7-2 resource contract and registration-as-NEW-write remain accepted inputs. No source, startup, C3, FreshMG, merge, main, corpus or distribution approval is implied. The exact production pgwire oracle remains RED and product snapshot `14fac7d6` remains unapproved.

## Exact subjects and evidence

Aliases:

- A: `/mnt/data/peter/projects/.worktrees/rs-raft-startup-activation-20261011`
- Q: A/`solve/quests/replicated-transaction-decision-and-apply`
- E: `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`
- D: E/`activation-cycle-design-round3-independent`
- N: D/`navigation`
- DS: Q/`design-participant-release-activation-authority-2026-10-11.md`
- PR2: E/`review-activation-cycle-design-round2-independent.md`
- AUTHOR: Q/`evidence/activation-cycle-round13-feasibility.mjs`
- AF: Q/`evidence/activation-cycle-round13-feasibility-result.json`
- FEAS: D/`independent-boundaries.json`

| Artifact | SHA-256 |
| --- | --- |
| DS, 3855 lines | `247b5be1e6f60960ca087521c2e250636d654700c636ff15fc3c092b39518f67` |
| Exact predecessor/prefix | `3aeadfe3b654b6b065cd99ac6d9df583dc2fff4a3636225517da8a945763a32d` |
| PR2, read before this review | `f14f361452a8240db6275a72de18073eb27d82021f9cd700b51b7a54e9b87d1a` |
| AUTHOR | `512f56572f88384ddbd5b6e91e75ad766796781dd2f379f6acb0cf56d95a9c90` |
| AF | `7e3ce921544fcbf3eb8247cdd42aaa7b86fe9c17c04bef349502379d5424f182` |
| Author evidence note | `c1b117ac911be07ad259c81895d53b05cf6fd755f8e13623b0dcd7b682f22bea` |
| Author five-entry manifest | `ca1b7d8bde9a7ae37df946528d2f7ee3170bbefab5cff068fbd5b3b6489b7493` |

The current design is byte-identical to the Git object at preservation snapshot **`8e022cc283807a45727c32dab1e3486fcb36c30d`**. Its complete predecessor is an exact byte prefix. Preservation is not approval.

Independent capture checked all **1936** selected `src/package.json/package-lock.json` blobs against unapproved product snapshot **`14fac7d6ef64881daa7a0d266a272b724dfe640a`**: zero mismatches. All five author packet entries verified. Forty-one directly relevant source/steering/contract/template files are copied under N; hashes and selections are in D/provenance.json. The manifest records diagnostic bytes, including this review's executable programs. No product/design/test/metadata/Quest/index/commit/push mutation occurred. No cluster ran.

Steering was AGENTS → rules → router, followed by authority-and-recovery and the ten complete category templates. Existing threat scope is retained; arbitrary trusted-host code injection or a newly hostile intrinsic runtime is not an additional requirement.

### Executed evidence and limits

- Exact AUTHOR rerun with `/tmp/cdc-node-cap-20261012/node` is byte-identical to AF: **12/12 supplied-fact observations**. The program imports no product receiver, SQLite apply or Raft owner.
- FEAS executes the actual participant store on in-memory SQLite. A new store has `origin=null`, pauseGeneration0 and no control/authorization text. An explicitly supplied origin recording/readback returns originIndex3/term1. This is a private-store observation, **not an ENABLE/consensus certification**.
- FEAS invokes exact author model functions. Fresh dependent `historyId=null` returns HISTORY_MISMATCH for both first PAUSE and supersession-before-PAUSE; the author's prebound matching-history controls succeed. Those are model results, not future production results.
- FEAS separates the independently durable root and control owners for the lost-result schedule. This is an explicit design interleaving, not a production concurrency test. It retains the root's exact pending bytes while a same-root worker completes the control cycle and unrelated B/C reuse the slot. The positive controls recover directly from the still-current control row, or from a durably recorded root result.
- The prior actual canonical-PAUSE/private-SQLite script reran unchanged: exact immediate replay stays generation1, B advances to2, delayed A advances to3, stale expected-generation CAS refuses, current CAS succeeds, and one control-revision CAS wins. Supplied committed coordinates make this a component seam, not Raft proof. It establishes the unchanged old-source ceiling.
- No new production oracle run was needed to judge these design dependencies. PR2 retains the separate instrumented database and exact pgwire RED attribution; neither is relabeled as a new design/source result.

D/commands.md names exact invocations and failed navigation reads, which are not evidence.

## Actual owner inventory and closed-admission trace

Source aliases below refer to exact N copies:

| Alias | Source |
| --- | --- |
| WORKFLOW | `src/bootstrap/startup-workflow-store.js` |
| SEED | `src/bootstrap/seed-startup-session-store.js` |
| CREATE | `src/node/replica-create-admission-owner.js` |
| GATEWAY / MUTATION / QUERY | `src/control-plane/control-plane-system-table-gateway{,-mutation-submission,-query-execution}.js` |
| CUTOVER | `src/node/replica-handler-participant-cutover.js` |
| RECEIVER | `src/node/replica-handler-participant-release.js` |
| RECOVERY | `src/node/replica-handler-release-recovery.js` |
| REQUEST | `src/partition/partition-participant-release-request.js` |
| TXREQUEST / TXAPPLY | `src/partition/partition-participant-transaction-{request,apply}.js` |
| STORE | `src/partition/partition-participant-transaction-store.js` |
| APPLY | `src/partition/partition-participant-release-apply.js` |
| PENDING | `src/partition/partition-service-cdc-stream-base.js` |
| RETIRE | `src/node/participant-release-lifecycle-retirement.js` |

The new semantic `ParticipantReleaseCommandOwner` is a proposed extension of existing owners; no same-named product module implements the new protocol. The evidence note correctly admits this.

| Handoff | Actual placement and dependency | Review disposition |
| --- | --- | --- |
| Seed/operator root capture | WORKFLOW:55–84 clones the command field; :124–161 loads, writes, fsyncs, renames, directory-syncs and rereads a file-backed record. SEED:192–239 replaces execution invocation separately. | A pre-submit record CAS can run while SQL mutation admission is closed. Future source must implement the exact revision/candidate transitions, preserve them on invocation replacement, and refuse non-durable configurations for a durable claim. No new source approval. |
| CREATE root capture | CREATE:348–379 reads the authoritative operation; :497–515 and later CAS calls mutate `replica_operations` through `gateway.updateSystemTableRow`. MUTATION:107+ and QUERY:368–375 route normal SQL mutation, not a magical memory-field write. | This is a different physical dependency from WORKFLOW. Accepted DS:1343–1393 starts ordinary retained C3 only after canonical repository/current NODES publication; it is not a prerequisite for first system activation. That ordering remains valid and avoids falsely declaring all CREATE SQL a startup deadlock. If the proposed candidate/result update targets a currently paused operation-ledger cohort, it must stay pending or use its existing authorized owner interaction; `critical` priority alone grants no mutation permission. AC13-2's chosen custody ordering must state this consequence, not require a raw SQL bypass. |
| First control release | CUTOVER:250–251 skips recursive control release for SQL_TRANSACTIONS; :643 PAUSE precedes :699–701 ENABLE; :754–760 uses the same partition as control/dependent. STORE:104–111 defines origin as the applied participant generation-origin coordinates. TXREQUEST:636–671 and TXAPPLY:575–604 install/read that origin. | Concrete AC13-1 dependency. A founded Raft group or birth authorization is not already this participant origin. |
| Control/dependent proposal | REQUEST:29–41 uses canonical committed-command admission and the operation-owned write path. RECEIVER:373–419 performs current generation/attempt/runtime checks. | The new envelope/body separation fits these owners. New CLAIM/supersession apply/result shapes still need implementation. No socket/remote lookup is added to deterministic apply. |
| Pending response / durable readback | PENDING:364–382 is a volatile map cleared on promise settlement. STORE:114–176 keeps one current control text/revision. | Neither is a durable arbitrary-entry outcome journal. AC13-2 must define the transfer/terminal consumer using the existing owners. |
| Closure and successor | RETIRE:58–89 captures old local authorization; :93–175 obtains current control route and consumes the result. | New same-history old-target response plus after-await authorization/target/publication checks is a coherent extension for authentic old authorization. It does not automatically settle an unresolved root candidate. |
| Recovery wake | RECOVERY:16–55,70–119,124–133 owns four running slots, time injection, unref timers, service/consensus wakes and per-partition coalescing. | Existing trigger machinery can drive the proposed durable roots; it is not itself custody or authority. No extra retry owner is warranted. Current source's pre-origin operator refusal is not mistaken for the proposed durable-root implementation. |

All registration/NODES/READY writes remain after authorized activation. None of the findings requests opening them early.

## Complete grouped findings

### AC13-1 — HIGH: first control-history creation and dependent binding are incomplete

**Contract:** DS:1232–1254,3180–3202,3488–3494,3672–3691,3739–3767.
**Actual evidence:** CUTOVER:250–251,643–701,754–760; STORE:53–79,104–111; TXREQUEST:625–671; TXAPPLY:575–604.
**Diagnostics:** FEAS.nativeFresh/nativeExisting/firstBinding; AUTHOR's supplied predecessor and prebound dependent fixtures.

The new history domain is the right kind of fact: durable, copied through authentic images, unrelated to a new boot/term, and different for an incompatible recreated history. The hash construction also avoids self-reference. The first transition now has a prerequisite the initial seed has not established.

DS:3741–3747 requires the first lawful CLAIM to capture **“the exact committed partition origin before building the PAUSE”**, then verify that origin at CLAIM apply. DS:3490–3491 and the retained winner rule require CLAIM before PAUSE. The accepted first-seed release path must PAUSE and drain before ENABLE applies that origin. The actual control path does not release some other already-originated control partition: SQL_TRANSACTIONS returns null from releaseControlOwnerFirst and later acts as its own control/dependent.

The dependency is therefore:

```text
first history-scoped CLAIM
  needs participant generation origin
origin ENABLE
  follows PAUSE / accepted-work settlement / drain
first PAUSE
  needs committed history-scoped CLAIM
```

A locally founded control group and immutable birth authority provide routing and first-activation permission (DS:1248–1250). They do not manufacture the generation-origin log occurrence. Fresh STORE confirms that distinction. Existing-origin restart is a legitimate positive: the origin already exists and an authentic history can be retained, so the new initialization predicate does not create this cycle there.

A second edge is first dependent binding. DS:3753 requires every dependent fence to carry the new history ID; :3672–3691 validates history and exact prior fence, but names no transition that binds a truly unbound dependent to H before or as its first conditional PAUSE/supersession. The exact author model checks strict equality with dependent.historyId, and both positive fixtures set that value from the control outside any command. With null history, the same exact functions refuse both paths. If first PAUSE is unable to run because its captured attempt is stale, supersession-before-PAUSE needs the first binding too; it cannot depend on PAUSE having installed it.

This is **not** a request to let a missing/corrupt existing history count as empty or to rebind a foreign history. Those refusals remain correct. It is a missing distinction and ownership transition between genuine first initialization, authentic existing history and incompatible/missing old history.

**Required closure:** specify one lawful initial control-history transition using already-authorized first-seed facts, with the actual participant-origin ordering explicit, then specify atomic first binding for an actually unbound dependent under the same trusted registered-dispatch/committed-claim contract. Preserve foreign-history refusal and both PAUSE orders. A narrow special first-origin branch or a revised history seed dependency must be part of the existing owner contract, not an implicit force-open or a second origin/authority.

**Decisive pair:** genuine fresh control with origin=null plus an unbound dependent must traverse the full winner/PAUSE/drain/origin sequence; an existing-history restart must reuse the same history; corrupted/foreign history must remain HOLD. The future source witness is not required to exist before a coherent design can be approved.

### AC13-2 — HIGH: exact candidate custody is fixed, but result transfer through slot reuse is not specified

**Contract:** DS:3489–3497,3554–3590,3714–3718,3794–3807.
**Actual evidence:** WORKFLOW:124–161; CREATE:348–379,497–515; REQUEST:29–41; PENDING:364–382; STORE:114–176.
**Diagnostic:** FEAS.lostReceipt; AUTHOR.committedClaim and closeCycle.

The new durable candidate closes the original pre-submit identity loss. It preserves exact CLAIM/PAUSE bytes even when the application row still shows the predecessor. That is approved at this scope. The next handoff needs a durable condition both owners can consume.

A reachable schedule under the control-row recovery/slot-release clauses is:

```text
root A durably records submitted_unknown and submits exact CLAIM
CLAIM commits; answer is lost before A's root result CAS
another authorized recovery worker of this SAME A reads the committed row
  -> exact supersession BEFORE PAUSE commits and is proved
  -> control terminalizes A and releases its slot
unrelated roots B and C subsequently claim/close through normal ordering
A's root resumes with its unchanged exact pending candidate
```

A's identity has not vanished; the new capture works. The missing fact is its canonical result/disposition. The current control row holds C plus history/high-water. Its exact A descriptor/result has been replaced. A never reached dependent authorization, so DS:3794's authentic-old-target-authorization precondition for RETIRED_SUPERSEDED does not apply. The origin's new lastTerminalClaim field is still absent precisely because its result write was lost. The volatile pending map is not a crash-surviving result owner.

The normative lifecycle table may intend root-result persistence in step3 to precede **all** later recovery. If so, the control transition/slot-reuse guard must say that and name the exact durable acknowledgement consumed by other workers. Step4 presently names committed control claim plus dependent fence; step7 names dependent delayed-command safety proof. Neither names a root-receipt guard. “The root record records the exact committed result” and “custody transfers without a gap” describe the goal, but do not select which later transition is forbidden while that second durable write is unresolved.

The alternative is a canonical old-candidate terminal answer. That can be feasible without retaining unbounded history, but it must bind the retained root/candidate and history, define what a closure high-water proves for that candidate, and name the root consumer. It must distinguish an outcome such as “this old attempt is now inapplicable” from pretending the original CLAIM returned STALE or never committed. Multiple lawful contenders can propose different claim IDs from one predecessor/ordinal. A prospective ordinal is not a historical CLAIMED certificate.

Current DS:3572–3582 requires exact committed CLAIMED/STALE/INVALID and permits successor capture after terminal refusal. Redriving the same old entry after slot reuse could now yield STALE even if it previously won; the design must define whether that is the original idempotent result, a new authoritative terminal exclusion, or a forbidden replacement. This is not a claim that every replay is unsafe. The ambiguity is the missing canonical meaning and durable consumption boundary.

AUTHOR.committedClaim updates its root object and control object in one synchronous helper. That useful positive collapses the two physical durable owners and does not exercise a lost answer between them. FEAS intentionally separates them; its schedule is **not** an executed future-product race. The paired successes are: read exact A while its control descriptor still exists, or persist A's exact result in its root before allowing descriptor loss.

The physical root placement matters to the correction. Seed/operator roots are local file-backed records. CREATE roots use the authoritative replicated operation ledger. A required root receipt cannot be assumed writable merely because the control singleton is available; if the operation ledger is the paused/degraded target, the chosen ordering must retain custody and provide an owned continuation. Accepted C3-after-registration ordering remains intact and is not itself rejected.

**Required closure:** make the root-to-control acknowledgement/slot-release order executable across crash and another authorized same-root recovery worker, or define the bounded canonical terminal readback for the retained unknown candidate after arbitrary later cycles. Name the exact root CAS, control guard/result and current-history validation; retain original identity and all outstanding effects. Do not introduce another outcome ledger or infer success from absence/high-water alone.

**Decisive pair:** lose CLAIM response before root persistence, let another same-root worker perform supersession-before-PAUSE and attempt slot release, then B/C and old A recovery; compare with root receipt successfully persisted. Both should settle through the declared owner contract. Unrelated B/C must have no authority to silently discard A's root debt.

### AC13-3 — MEDIUM: later recovery has two incompatible successor rules

**Contract:** preserved DS:3375–3381 versus new DS:3489,3579–3582; fixed CREATE deadline DS:857–861.
**Diagnostic:** FEAS.expiry; AUTHOR.captureCandidate/committedClaim.

The preserved rule says a later execution turn may only resolve already accepted commands and:

> “creates no new authority, cycle, PAUSE, admission permission or startup deadline.”

The new clause permits a successor claim candidate after committed STALE/INVALID:

> “under the same root/effect and remaining original entitlement or its existing bounded recovery turn.”

That successor captures a new predecessor/attempt and builds a different CLAIM and PAUSE. It is not merely re-enveloping, replaying or superseding an already accepted command. The design even calls it a new execution attempt after proven failure. A bounded turn can bound work, but its duration is not itself the entitlement for another cycle.

The contradiction is exposed when the original deadline has expired and an exact old candidate obtains a committed terminal refusal. The new sentence allows a fresh candidate under the recovery turn; the retained sentence forbids its new cycle/PAUSE. Keeping root/effect strings unchanged and preserving the old deadline does not resolve the difference.

This is a **contract contradiction**, not an observed timer renewal in future code. Legitimate settlement is already coherent: after expiry, redrive the same uncertain CLAIM, finish the same committed cycle, or send its persisted immutable supersession using a current execution envelope. Those controls remain accepted.

**Required closure:** state a single rule for an expired accepted root after terminal refusal. If no further cycle is entitled, retain an explicit held/conflict obligation with an owned path to resolve it. If the already-admitted effect authorizes a new execution cycle after a proven failed one, explicitly supersede the no-new-cycle clause and specify the existing owner's exact entitlement/generation checks and bounded turn. Do not silently create a new authority or reset the original foreground/CREATE deadline.

This review does not ask the user to decide a policy already delegated to the existing owner; it asks the design to express one consistent rule.

## Scope decisions and preserved controls

| Boundary | Disposition |
| --- | --- |
| Exact pre-submit candidate/root state and no unknown remint | **Approve design sub-scope**, subject to the subsequent result handoff AC13-2. Root/effect vs execution invocation distinction is clear. |
| Supersession canonical command, durable pre-send storage, current envelope, deterministic before/after PAUSE | **Approve design sub-scope for established history**, preserving genuine-first binding finding AC13-1. No volatile route/socket enters apply. |
| History-qualified high-water, authentic image continuity, foreign/missing history HOLD, after-await old-target fence | **Approve established-history design sub-scope.** No generic recreation is certified; no incompatible image is silently adopted. |
| Full first-seed/bootstrap cycle | **REVISE AC13-1.** Birth authority and local route are preserved, but they are not participant origin. |
| Full unknown-candidate result disposal after other recovery/slot reuse | **REVISE AC13-2.** Exact pending identity remains safe; terminal result/continuation needs a declared handoff. |
| Foreground expiry versus successor candidate | **REVISE AC13-3.** Existing same-command recovery remains allowed. |
| Local HOLD/owner ordering; deterministic committed apply; complete population; same-attempt catch-up; registration after activation | Preserve accepted scopes; no new counterexample found against these constraints themselves. |
| R7-2 route bytes, old+candidate/copy admission, four-slot recovery, no new timer/cap | Preserve design scope. No new whole-process memory or performance certification. |
| Source `14fac7d6`, real startup/pgwire, FreshMG, physical acceptance | Still HOLD/RED as previously scoped. Model/SQLite observations do not close these gates. |

## Category-complete 63-item disposition

**P** = design-feasible / preserved at stated scope, with source proof still pending.
**F** = maps to the complete grouped finding above; not a second finding.
**N/A** = explicitly outside this design delta's threat or implementation scope.

### Admission A1–A7

| Item | Evidence and disposition |
| --- | --- |
| A1 Same precheck/dispatch/apply facts | **F AC13-1/2.** DS:3488–3495,3672–3691,3741–3747; CUTOVER:643–701; first CLAIM origin dependency and result-transfer guard incomplete. Established-history supersession consumes immutable command at apply and current envelope at receiver. |
| A2 Transient versus terminal | **P with F AC13-2/3.** DS:3655–3662 maps delivery refusal; :3683–3691 distinguishes stale/history invalid from closure. Root terminal disposition after slot reuse/expiry needs the grouped corrections. |
| A3 Governing budgets | **F AC13-3.** DS:3375–3381 versus :3489,3579–3582. Original deadline remains captured; later turn is separately bounded, not implicit new entitlement. |
| A4 Canonical shapes | **P/F AC13-2.** DS:3516–3545 candidate,3602–3652 immutable effect/envelope,3780–3791 old-target result are explicit. Historical unresolved-candidate result or receipt guard is missing. |
| A5 Observable release/wake | **P/F AC13-1/2.** DS:3714–3718; RECOVERY:48–55,124–133. Exact dependent proof/closure and existing event wake are named; blocked bootstrap and unacknowledged result must get an executable continuation. No latency measurement is claimed. |
| A6 Freshness after awaits | **P.** DS:3647–3662,3794–3800 requires current envelope and old-target/authorization/publication recheck; RECEIVER:388–419 supplies the actual dispatch boundary. |
| A7 Truthful identity | **P.** DS candidate/effect/history/result tuples :3516–3545,3602–3628,3780–3791 retain root/target/cycle. RECOVERY:58–67 logs actual partition/reason. Future diagnostics must not rename a result as original CLAIM refusal (AC13-2). |

### Retry Y1–Y7

| Item | Evidence and disposition |
| --- | --- |
| Y1 Owed retry fires | **P/F AC13-1/2.** RECOVERY:40–55,100–133 is existing trigger; DS:3511–3512 forbids it owning candidate identity. Exact durable roots are specified, but the two unresolved dependencies need an event/guard. |
| Y2 Unreadable evidence bound | **P.** DS:3572–3576,3661–3662,3798–3800 retains unknown debt; RECOVERY:25–31 and DS:3375–3381 bound a turn. Unreadability never authorizes replacement. |
| Y3 Every stop retains/disposes | **F AC13-2/3.** Captured/submitted/claimed/refused and supersession dispositions are named; old unknown candidate after slot reuse and expired terminal refusal lack one consistent disposition. |
| Y4 No circular suppression | **F AC13-1.** Actual fresh origin=null plus CLAIM-before-PAUSE and origin-after-drain. CREATE's different storage dependency is explicitly inventoried above, with accepted C3 ordering preserved. |
| Y5 Cadence/concurrency ceiling | **P.** DS:864–879,3383–3389; RECOVERY:17–19,40–45,100–119. Four running phases, per-partition coalescing, fixed existing cadence and sequential phases remain; no new timer/attempt-amplifying path. Source resource measurements remain later gates. |
| Y6 Late success/replay | **P/F AC13-2.** DS:3664–3670,3695–3711 gives exact supersession replay. Unknown CLAIM identity stays exact; its historical result after closure needs the distinct terminal contract. |
| Y7 No ACK reset | **P/F AC13-3.** DS:3480–3481,3661–3662 expressly rejects ACK/append/CORE_OK as commitment or deadline renewal. New-cycle entitlement is the only deadline issue found. |

### Transport T1–T5

| Item | Evidence and disposition |
| --- | --- |
| T1 Processed versus ACK | **P.** DS:3480–3481,3655–3660 requires committed apply/readback. REQUEST:29–41 binds entry to canonical request owner; transport ACK has no release authority. |
| T2 Late answers | **P/F AC13-2.** DS:3664–3670 retains supersession identity across old receiver delivery; result lost before root CAS is the separate outstanding handoff. No late response may drop root debt. |
| T3 Typed consumers | **P/F AC13-2.** DS:3655–3662,3677–3691,3780–3800 explicitly names delivery, apply and old-target outcomes. Unresolved old claim is not an old authorized target. |
| T4 No route/handler | **P.** DS:3655–3662 returns DEFERRED/retryAfter and retains command under fixed turn; RECEIVER:373–387 returns unavailable facts. No indefinite newly introduced await is authorized. |
| T5 Fixture fidelity | **P, limited.** AUTHOR and FEAS are explicitly supplied-fact models; actual SQLite seam is separately identified. No claim of real router/native/cluster supersession execution. DS:3830–3836 retains required future production seams. |

### Sweep S1–S5

| Item | Evidence and disposition |
| --- | --- |
| S1 Clock/unref | **P.** RECOVERY:23–31,40–45 uses injected time and unref; DS:3375–3381 retains existing turn owner. No new timer implementation in this docs delta. |
| S2 Role/config/attempt | **P.** DS:3631–3670 revalidates current execution; RECEIVER:388–419 actual role/attempt/lifecycle boundary; :3672–3691 apply uses only committed bytes/local row. No socket-time apply authority. |
| S3 Restart memory loss | **P/F AC13-2.** DS:3554–3589 makes pre-submit bytes durable and preserves on boot replacement. PENDING:364–382 proves pending promises are not durable outcomes; slot reuse remains unresolved. |
| S4 Legal long recovery | **F AC13-3 only.** DS:3375–3381 preserves exact accepted work after foreground expiry. It cannot simultaneously grant and forbid a new successor cycle. |
| S5 Closed-admission progress | **F AC13-1; conditional CREATE placement documented.** DS:1232–1254 and real origin order expose self-dependency. Seed/operator root file persistence itself has no ordinary SQL gate. |

### Recovery R1–R5

| Item | Evidence and disposition |
| --- | --- |
| R1 Stale does not clobber live | **P.** DS:3554–3559,3584–3589 root revision CAS; :3672–3691 dependent fence; :3794–3800 after-await target reread. Enumerated writes: candidate state/result/lastTerminal, control claim/history/phase/high-water, dependent PAUSE/supersession/auth, owner terminal disposal. |
| R2 Restart/current owner | **P.** DS:3563–3570 preserves candidate across execution takeover, current envelope separate :3631–3653. Changed boot neither erases root nor changes immutable history. Source implementation pending. |
| R3 Population not empty | **P.** DS:3529–3534 complete canonical control/dependent target/configuration text; prior accepted full-census and same-attempt checks retained. No empty/cached population can replace authority. |
| R4 Partial-effect replay | **P/F AC13-1/2.** PAUSE-first/supersession-first/replay/closure are explicit; first dependent binding and closed historical unknown-claim result are the uncovered edges. Native old A→B→A behavior remains unapproved-source evidence. |
| R5 Absence proves nothing | **P.** DS:3572–3576 refuses remint from missing row; :3762–3776 rejects missing/foreign history. AC13-2 requires an affirmative terminal result, not absence. |

### Concurrency C1–C5

| Item | Evidence and disposition |
| --- | --- |
| C1 Capture plus authoritative CAS | **P/F AC13-2.** DS:3554–3559 preadmits and root-CASes before operation call; :3490 control winner CAS. End-to-end result acknowledgement needs a guard between these durable owners. |
| C2 Post-await consume | **P.** DS:3556–3559 rereads capture; :3647–3662 current envelope after queueing; :3794–3800 target successor check. Canonical text is pinned before awaits. |
| C3 Single winner | **P.** DS:3193–3212 and3490 single contended control slot before PAUSE; no losing contender dispatch. Actual STORE:168–176 CAS winner remains a valid primitive control. |
| C4 Wakes/late answers | **P/F AC13-2.** RECOVERY:100–119 same-partition in-flight gate; durable CAS is cross-worker backstop. Same-root recovery versus origin-result persistence is the explicit outstanding schedule. |
| C5 Correct keys | **P.** RootOperationId/effectId plus controlHistoryId/controlPartition/cycle and dependent release/fence in DS:3516–3545,3602–3628,3727–3755. Local partition singleflight does not substitute for the global control slot. |

### Formation F1–F5

| Item | Evidence and disposition |
| --- | --- |
| F1 Full self-dependency inventory | **F AC13-1/2.** Owner table above enumerates file roots, operation-ledger SQL, control/dependent stores, origin, response map, closure and wake. No imaginary durable entry-outcome store fills the gap. |
| F2 Recovery obtains prerequisites | **F AC13-1.** Initial CLAIM needs the origin it must precede; existing-history positive does not repair fresh initialization. CREATE/C3 remains after system activation per DS:1374–1393. |
| F3 Registration NEW write | **P.** DS:1243–1254 and accepted prefix require origin/release before registration. No fixture opens the gate or moves seed writes earlier. |
| F4 One original window | **F AC13-3; other scope P.** DS:857–879,3375–3381. No performance margin or runtime duration is certified by this design review; bounded later turn is not an implicit renewed foreground request. |
| F5 No bypass | **P.** DS:3240–3245,3672–3675,3714–3718 preserves registered handler/operation/private apply and no volatile lookup. Corrections must remain in those owners; no raw DB/Raft or readiness escape proposed. |

### Harness H1–H6

| Item | Evidence and disposition |
| --- | --- |
| H1 Mechanism reached | **P.** FEAS separates actual fresh-origin observation, exact author's fresh-history refusal, lost-result design schedule and expiry text contradiction. No import/setup failure is used as a red. |
| H2 Model versus actual | **P.** AUTHOR:source declarations and evidence note explicitly no production imports; FEAS.scope and commands.md retain exact limitations. Actual store/CAS tests do not certify future command paths. |
| H3 Time/order fidelity | **P.** No sleeps or compressed timers infer expiry. FEAS.expiry uses deadline5000/now6000/turn7000 solely to expose clause conflict; lost-answer schedule keeps commit, root persistence and slot reuse separate. |
| H4 Complete fields | **P/F AC13-1/2.** Design canonical fields complete for established history; model preinstalls origin/history and combines root/control update. Report records those omissions explicitly rather than treating a simplified fixture as full handoff proof. |
| H5 Nonvacuous controls | **P.** AUTHOR includes A/B/C and different dependent roots; FEAS has nonempty exact pending candidate, positive current-row/root-receipt controls, fresh/prebound dependent pair and same-/foreign-history results. No empty registry proves completion. |
| H6 Proof ceiling | **P.** Exact14fac source unchanged/unapproved, prior pgwire RED unchanged. Design positives are not startup/source/merge acceptance. |

### Owner interaction O1–O10

| Item | Evidence and disposition |
| --- | --- |
| O1 Single authority | **P.** DS:3504–3512 root owner, :3490 control winner, :3672 dependent apply, :3794 lifecycle consumer. Caches/routes/diagnostics do not arbitrate. |
| O2 Typed whole handoff | **F AC13-1/2/3.** Supersession and established-history old-target shapes are now complete; initialization, root result disposal and expired-successor entitlement remain the three grouped boundaries. |
| O3 Paired refusal/progress | **P/F AC13-1/2.** Same model proves existing-history refusal/progress and exact replay; fresh/unbound and lost-root-result controls expose the missing adjacent handoffs. Prior counterexamples are cumulative. |
| O4 Stale then fresh | **P at current envelope; F AC13-3 for successor.** DS:3704–3711 reacquires lawful envelope around unchanged old effect. A new candidate after terminal refusal/expiry needs the chosen entitlement rule. |
| O5 Backpressure | **P.** DS:3383–3389,3554–3556 reserves old+candidate/copies first, retains resource owner and no cap/limit raise. No false terminal status releases debt under pressure. |
| O6 Canonical wake | **P/F AC13-1/2.** DS:3714–3718 plus RECOVERY:124–133 supplies event route. First-origin dependency/result custody must name the prerequisite whose resolution that owner can observe. |
| O7 Projections not authority | **P.** DS:3480–3481,3655–3660,3753–3776 refuses ACK/cache/current boot/counter as authority. History water is narrowly scoped; it is not silently reused as a root result. |
| O8 Exact treatment | **P.** D/provenance.json verifies design/prefix/Git object/source1936/author5; original model rerun exact bytes. FEAS is explicitly a boundary diagnostic, not a reverted product candidate or aggregate test-count claim. |
| O9 No alternate owner | **P.** Actual REQUEST:29–41, RECEIVER:373–419 and DS:3511–3512 keep canonical path. Searches found no implemented new candidate/history alternate path; those commands are explicitly future work. |
| O10 Contract/registry/witness | **P, source gate pending.** DS:3830–3836 requires actual owners and metadata witnesses together. Existing impact-contracts.json:600–650 covers operation-port/session persistence interactions, not all future cycle endpoints; future implementation must register the new coupled release/root/history witnesses and primary classes. Docs-only approval does not claim current metadata completeness. |

### JavaScript / canonical boundary J1–J8

| Item | Evidence and disposition |
| --- | --- |
| J1 Safe arithmetic | **P.** DS:3342–3346 retains safe nonnegative non-minus-zero ordinals and exhaustion-before-effect; :3548–3552 pins finite/safe fields; existing deadline helpers remain. No runtime numeric testing of nonexistent command claimed. |
| J2 Own data | **P.** DS:3548–3552 rejects inherited/accessor/boxed values before canonical capture; :3672–3675 applies own primitive validation. Wire result/source implementation remains a later gate. |
| J3 Accessors/TOCTOU | **P.** DS:3548–3559 pins canonical bytes before await and rereads durable equality; receiver/target guards recheck current facts. Author model is not a hostile-input validator proof. |
| J4 Prototype pollution | **N/A for new arbitrary-host expansion; preserve existing guards.** Authority-and-recovery threat-model section and DS:3548–3552 require canonical own fields; this docs delta does not implement or weaken product pollution defenses. |
| J5 Primitive/exotic fidelity | **P.** DS:3548–3552 explicitly rejects boxes/unsupported versions/sparse inputs; history/effect IDs are pinned strings. No Symbol/coercion escape is approved. |
| J6 Mutable intrinsics | **N/A for new hostile-runtime certification.** No intrinsic-dependent source is changed. Existing sealed protections stay required; this review does not demand arbitrary runtime patch immunity beyond the owner threat contract. |
| J7 Canonical digests | **P.** DS:3180–3190 uses acyclic intent→cycle→command; :3602–3630 separates immutable effect hash from route; :3743–3749 avoids initializedByClaimEntryId self-reference. Initial origin prerequisite is AC13-1, not a hash collision claim. |
| J8 Bounded authentic arrays | **P, implementation proof pending.** DS:875–879 bounds established cohort; :3529–3534 carries full texts and :3548–3556 requires dense/typed/pre-admitted bytes. No count-only empty-population or all-data allocation exemption is introduced. |

**63 items completed: A7 + Y7 + T5 + S5 + R5 + C5 + F5 + H6 + O10 + J8.**

## Next bounded correction

Reconcile the three grouped contracts together: legal initial control/dependent history formation; exact root result custody through other-worker recovery and slot reuse; and one explicit post-expiry successor rule. Keep the established-history supersession/domain corrections as accepted inputs. Then implement through the existing owners and certify their source/SQLite/Raft/startup interactions against one exact candidate. No new global barrier, second ledger, force-open or full redesign is requested.

