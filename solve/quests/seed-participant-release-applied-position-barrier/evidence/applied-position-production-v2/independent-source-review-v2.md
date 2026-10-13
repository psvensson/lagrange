# Applied-position production V2: independent complete source review

Verdict: **REVISE.** Seven consolidated groups below remain in immutable V2. The owned fixed-duration timer correction, canonical generation convergence, exact retained joins, most cleanup custody, runtime publication boundary and fresh final query/census/control/RESUME order are sound; none waives the findings. This is source-content review before candidate behavior. No source/test/metadata/Quest/Git edits, tests/labs/checkers or producers were performed. This new ignored report is the only write.

## Exact binding and custody

Reviewed committed blobs at `be8a54cbbd270501c50ac573c54f251dd9e4f35c`, tree `f00be5e95926dc152e0862965a41d673a6702dad`, src tree `1382406d83de3e9ebcde92b9d2ccb7266e8d6538`, snapshot `/tmp/session-worktree-7wUvpP/tree`. Unrelated uncommitted snapshot/root material is excluded. Compared the whole change to integrated `9ba9a1941b2326d0d0bcfa49c581cc2fcf74af8d` and correction to rejected `bb976f03b1dca9989cfd990af7f188e490ac5243`.

Actual `source-manifest-v2.sha256` SHA256 `a13ccf5e654e2aa4cd8571a8e145cba5c8b1b6759e821d230ade3e493dd3e703`: independently verified all16 source blobs plus authored impact registry (17), zero mismatch. Root custody manifest SHA256 `1164eaf4d13e0a5de63261274697218fd2c63a5d4f7bbed8c446e254b1e6a6c4`: all43 artifact hashes/sizes verified. Author report27db9 is frozen description, not behavior evidence. Seven accepted V1 files are byte-identical to7350's manifest: cutover, service constants/shutdown-entry, operation-port constants/event bridge, runtime constants/publication. Their earlier semantic dispositions are incorporated by exact hash rather than re-auditing unchanged implementation.

Approved combined design review `9c35458737d7b4d0499bb26dd06edc0798f241f67de0e35db371609d0bbca36d` (99f1+553f31+3660), prior full48 source/design reviews7350/6e171/221df, and explicit fixed-duration timer decision22:42:38 remain binding. No static HOLD is treated as green. Canonical metadata refresh changes only generated impact seal after source freeze; it is derived custody, not admission authority.

Aliases: O=`src/node/participant-release-applied-position-observation.js`; R=`src/node/replica-handler-participant-release.js`; L=`src/node/replica-handler-lifecycle-methods.js`; PA=`src/partition/partition-participant-transaction-pause.js`; K=`src/partition/partition-participant-release-contract.js`; CL=`src/node/participant-release-client.js`; D=diagnostic-observation; HC=`src/node/replica-runtime-cleanup-custody.js`; C=`src/node/replica-handler-participant-cutover.js`. All source lines below bind be8.

## Complete correction batch

**S1 — a second await separates the current-context fence from its use.** R287 awaits PA, revalidates complete context at288–299, and returns its async decision. O148 separately awaits that decision, then150–158 checks only active/service/port/registry lifetime and clock before consuming its outcome/refresh eligibility. A queued owner continuation may change term/configuration/runtime/generation/pause between R's return and O's continuation without changing the service/port object. The valid first-read rule intentionally ignores dirty when the answer already satisfies the watermark, so dirty is not a current-context backstop. Revalidate at the actual post-await decision-consumption boundary through the existing R canonical synchronous fence, or provide a real owner no-interleave proof; do not copy generation/status fields or add raw reads in O. Source supports the interleaving; no unsafe OPEN or measured native red is claimed. Final fresh census/resume still prevents admission from being authorized by this observation snapshot, but the requested current OBS verdict/refresh eligibility is not fenced after every await as promised.

**S2 — application progress is falsely classified as stale lineage.** R272 requires latest `status.appliedIndex === context.appliedIndex`. Authentic schedule: PA reads committedN/statusN, then normal K publication occurs before R's post-PA current status observation, while term/configuration/membership generation/runtime/lifecycle/PAUSE remain unchanged and dirty is retained. R returns STALE296 instead of letting valid below-watermark facts consume their wake. Applied progress is the awaited watermark, not an identity fence. Preserve actual identity/generation/current-status authority, and let the single PA/R decision distinguish ordinary monotonic progress without inventing a consumer-side mismatch algorithm. Current V10 deliberately publishes K before PA's status sample, so that witness alone does not falsify this alternate healthy ordering. Add the relevant existing-owner progress schedule; do not change budgets/force a read or tolerate STALE on successful progress.

**S3 — missing nested identity throws before typed refusal.** R48–67 uses `value !== null` then dereferences release/attempt/origin. An otherwise strict release-tagged identity action with own undefined/absent release, attempt, or OBS origin passes the copy skip at89–90 and throws at scalar dereference, instead of existing release INVALID. Capture is outside receive's catch (L137), so direct registered route rejects and the client can relabel transport failure UNAVAILABLE. Make missing/undefined grammar safely false and return the same safe captured INVALID before any owner effects; no blanket exception classifier or empty success fallback. Pin absent/own-undefined variants at actual registered ingress and preserve an existing held starter/no new resources.

**S4 — new guard/custody iteration trusts mutable Array intrinsics.** R88's new for-of over internal RELEASE_NESTED_FIELDS uses ambient Array iterator; a replaced iterator that yields nothing skips strict nested copies and reaches raw nested property/hash reads. O64's map/spread,70's flatMap,105's some,104/278/331 iteration and334's flatMap are new dependencies in resource acquisition/error/retirement decisions. Suppressing flatMap can hide actual cleanup failures and remove a failed record as clean; suppressing iteration can skip owned releases. Use captured safe operations or bounded indexed own-data mechanisms at these new boundaries. Do not broaden to blanket unchanged K/Map/Set resilience or invent a parallel array-decoder/framework. This is within existing JS4/JS6 obligations, not a new review category. Actual boundary/custody mutation controls must restore instrumentation before unrelated runtime/framework work and retain primary errors.

**S5 — the shared budget still supplies an implicit ceiling.** CL51–52 retains `ceilingAtMs = deadlineAtMs`; sender81 uses the implicit two-argument path. Approved D2 requires both absolute values explicitly, with sender passing original deadline as its derivation ceiling and recipient requiring the carried value. Receiver strict ingress110–116 already rejects absent carried input, so no live wire-bypass is claimed. Remove the helper's alternate interpretation and pass the sender's owned ceiling explicitly; preserve the one sampled/capped arithmetic operation and all current outcomes/budgets. Do not reopen arrival renewal.

**S6 — attributable new literal debt remains.** Exact static attribution report SHA256 `ecd9712565b33ee7c98a3fd5acc23d4e5c8ec0a5b03091faca6e4e8faaf6f969` compares canonical same-path refs:9ba9=16,V1=19,V2=32 findings; whole attributable+16 (O10/R5/L1), correction+13. Source confirms O resource labels/error/indices65/235/282–284 and refusal names52/139/298, R capture kind81/133/136/146/149, L malformed138. Name the O resource table/error locally, the shared capture-kind vocabulary in the existing replica-handler constants owner, and release missing-fact values in existing cutover constants. No baseline increase or cosmetic suppression. Root must explicitly add the one existing replica-handler-constants path if selected. Unused1449>1416 and its exact issue set are identical on all3 refs: inherited, not this unit's increase and not waived. Strict4 inherited/global file-size/guideline debt remains separate.

**S7 — the newly changed registered-ingress owner is absent from the named interaction.** Current impact contract and application-and-progress endpoint include R/O/K/PA and the native primary in both witness forms, but omit L entirely. L now owns the actual shared strict-capture consumption and ordinary/generic/refusal routing at137–155. Add that live boundary (and the new shared capture-kind value owner if S6 adds it) to the existing contract/application endpoint, retain exactly two endpoint IDs, and align the existing shared-entry CREATE/REMOVE/STEP_DOWN/membership-read preservation witnesses with final selection. Generated import closure alone does not replace explicit owner/endpoint registration. No parallel contract is needed.

## Sound portions, deviations and limits

O246–255 now retires a fired timer and always terminalizes: invalid/overall clock answer takes precedence, otherwise fixed-duration RPC bound returns existing MESSAGE_TIMEOUT. No timerless pending wake/rearm/new wait remains. CL47–68 uses one captured cap operation/remaining-first safe near-MAX arithmetic; D's new export retains signed diagnostic behavior. Exact registration clock/scheduler is captured292 and reused131/248/257; no join sampling/renewal. Missing carried wire grammar is enforced before map/clock, notwithstanding S5's exported-helper contract.

PA87–174 is one canonical facts implementation. Ordinary term/configuration/applied coherence is preserved; stricter membership-generation equality is composed only for OBS via the same membershipAssessment option100–113/165–167. K77–84 owns generation domain; PA148–150 consumes it and retains projection/FACT.GENERATION. Native-string/CP-number valid families and explicit malformed-producer refusal are intact. Trusted output is not strict-decoded. Inherited ordinary PA/recipient await races remain recorded and excluded; no broad ordinary recovery/row/snapshot redesign is smuggled in.

O38–47/316–324 accepts only the validated immutable canonical coherent tuple and returns the stored inner Promise before same-record cleanup; later clean fresh requests are allowed. Seven slots57–114 retain one actual error including thrown null, continue independent releases, preserve exact scheduler/closure and actual true/false unsubscribe grammar. Installing/pending/releasing guards and late returned handles191–289 block reentrant premature discharge. Registry218–227 synchronously terminalizes replacement/removal while facts are held; service shutdown230–240 and handler cancel328–334 retain exact record/late-tail identity. S4 must remove new intrinsic assumptions before nonthrowing/all-custody claims are accepted. No new ledger, decision cache, replay algorithm, force cleanup or storage-deletion permission.

Runtime publication and service shutdown-entry are exact accepted V1 hashes: apply/finishReady/drainReady precedes payload-free runtime announce/status marker; marker uses a separate lifecycle/applied pair, never diagnostic read cache or transport ACK. C69–77 adds one applied-watermark phase after actual ENABLE. Then C291–309 freshly reads full census, derives finalLocal, calls sole transactionReleaseProofOf, classifies full final census/proof, checks current control owner, and sends RESUME. PA238–267 rechecks lifecycle after facts and current generation/status without await before OPEN; wrong-ID idempotent/current proof policy stays intact. This safe final order does not waive S1/S2 observation contract defects. No query-proof freshness is inferred from equal values or singleton fixtures.

## All48 dispositions with evidence

| Item | Verdict / evidence |
| --- | --- |
| Admission1 same precheck/enforcement | REVISE S1/S3; captured coherent identity R98–151 feeds R/O, but final consume fence/typed absence incomplete. |
| Admission2 transient/terminal | REVISE S2/S3: ordinary progress must not be STALE; missing grammar must INVALID. Real typed UNAVAILABLE preserved R251–299. |
| Admission3 existing budgets | REVISE S5 contract;5000ms/overall unchanged CL47–93, captured O292/131. |
| Admission4 reason/envelope | REVISE S3/S6; safe captured identity R70–83, observed refusal wrapping251–254 sound. |
| Admission5 hold release | APPROVE structure O103–122/191–289/328, HC90/123; REVISE S4 hidden failures under mutated methods; physical latency pending. |
| Admission6 freshness | REVISE S1/S2; R275–299 full fence before additional O await; no cached authority accepted. |
| Admission7 honest identity | APPROVE normal R70–83/251–254; S3 needs correct invalid path rather than transport relabel. |
| Retry1 must fire | APPROVE fixed cap terminal O248–255 and native marker; S2 missed valid progress wake remains. |
| Retry2 frozen bound | APPROVE original budget/clock and timer/debt O131–143/248–255/328; S4 error visibility required. |
| Retry3 loud exits | REVISE S3/S4; typed invalid/stale/unavailable/cleanup reason otherwise exact. |
| Retry4 circular waiting | APPROVE prompt registry/service/handler terminal cancellation O218–240/HC90 before waits; no timerless branch. |
| Retry5 pressure | REVISE S2/S4; single record/flag/bit O19/145–188 and fixed7 slots bound rate, no poll/retry timer. |
| Retry6 late result | APPROVE inactive old tail150 and identity deletion96–100/settled join320–323; S1 latest consume context remains. |
| Retry7 resets/ACK | APPROVE exact reviewed RT/port publication; no ACK/proposal reset or alternative driver. |
| Concurrency1 synchronous claim | APPROVE insertion305–312/validated matcher; S3 typed malformed before claim required. |
| Concurrency2 await/use | REVISE S1/S2; PA/R fence not sufficient after O148; ordinary inherited race explicitly excluded. |
| Concurrency3 one winner | APPROVE stored inner Promise320–323/terminal answer116–121; no renewed settled debt join. |
| Concurrency4 reentrancy | APPROVE pending/installing/releasing and exact late handles74–114/191–289; S4 ambient iteration undermines custody. |
| Concurrency5 resource identity | APPROVE captured handler/service/port/scheduler306 and per-replica map311; no address keys. |
| Formation1 subsystem reads | APPROVE PA sole build/membership/status/origin/work/context; no additional CDC/core read owner. |
| Formation2 independent wake | REVISE S2 progress timing; actual post-publication event plus lifecycle wakes O213–240, no self-read repair. |
| Formation3 clients gated | APPROVE C full classifier/control/PA resume order, observation never grants admission; S1/S2 cannot be ignored. |
| Formation4 total window | APPROVE hard window source, no measured candidate; every healthy expiry remains red. S5 contract correction required. |
| Formation5 no bypass | APPROVE no tick/campaign/proposal/reset/raw-core/cached OPEN; unchanged native queue/transport ACK boundary. |
| Harness1 intended red | HOLD new exact candidate/source/treatment; current qualified c128 negative is pre-feature evidence, not V2. |
| Harness2 actual seam | APPROVE intended real handler/native3-voter and CP boundary limits; V4 test bytes separately unreviewed. |
| Harness3 time geometry | APPROVE safe clocks/cap/fired timer; no compressed expiry/renewal, S5 explicit ceiling required. |
| Harness4 complete fields | REVISE S3 mandatory absent nested fields; canonical input/body/deadline/target pins otherwise R98–127. |
| Harness5 nonvacuity | HOLD native N/K, S1 second-await/S2 alternate publication, intrinsics/custody, query/control/old-work proofs. |
| Harness6 proof ceiling | HOLD candidate behavior/startup/fullcone/corpus/Quest/main; no static red converted to positive evidence. |
| Owner1 sole semantic owners | APPROVE PA facts/K domain/R fences/CL cap/O scheduling; REVISE S1 actual consumption and S7 registry binding. |
| Owner2 typed seam | REVISE S3; valid primitives/strict copied nested inputs, generic unknown vs releaseINVALID otherwise explicit L137–155. |
| Owner3 paired invariant | HOLD actual paused/noeffects→same attempt native release/K+1; S2 progress no-stale variant needs causal witness. |
| Owner4 stale→fresh | REVISE S2; first satisfying read O158 now one read, authentic lag eligibility PA109–113 sound. |
| Owner5 pressure/backoff | APPROVE no new budgets/loops, REVISE S2/S4; bounded cleanup debt instead of dropped acknowledgment. |
| Owner6 wake/release custody | REVISE S4; fixed slots and existing shutdown aggregation HC123–124 otherwise sound. |
| Owner7 projections | APPROVE clock/event/diagnostic projections never authorize; marker actual status/apply separated. |
| Owner8 A/B fingerprints | APPROVE17 manifest/43 custody verification only; final source/test/metadata/host proof HOLD. |
| Owner9 no fallback/duplication | REVISE S5 implicit default, S1 use same fence owner; no copied membership mismatch/projection exists. |
| Owner10 registration | REVISE S7; native primary both forms correct, exactly2 IDs retained; final canonical metadata pending. |
| JS1 numeric edge lattice | APPROVE captured clock/time/generation primitive domain and safe derived arithmetic; S3 absence handled incorrectly. |
| JS2 own properties | REVISE S4 iteration bypass; U strict copy reused before raw discriminator and declared nested pin otherwise sound. |
| JS3 getter/TOCTOU | REVISE S4; frozen copied top/nested valid intent normally never reread raw caller fields R130–151. |
| JS4 pollution | REVISE new R/O Array iteration dependencies S4; unchanged K/Map/Set assumptions remain unclaimed broad hardening. |
| JS5 boxes/exotics | APPROVE normal scalar-before-hash guards R48–107/K77–84; S3/S4 missing/bypassed-copy cases need repair. |
| JS6 mutable intrinsics | REVISE S4; captured numeric/freeze/hasOwn/reflect operations correct, new Array helpers not captured. |
| JS7 hash/coercion | APPROVE canonical K identity reused after primitive pins; S4 can skip strict nested copy and invoke raw fields. No second hash builder. |
| JS8 authentic arrays | N/A new peer/census wire decoder: none. Owned resource/field arrays introduce S4 iteration risk; unchanged bounded K census algorithm unclaimed. |

## Required next steps and acceptance ceiling

Record S1–S7 as one rejection batch, preserve immutable be8/history, then repair only the existing canonical owners with any extra constants/registry scope explicit. Add causal controls for missing/undefined nested identity; final post-R await lineage change; monotonic apply between PA and final fence; new intrinsic guard/custody mutation; explicit shared ceiling; shared ingress preservation/registration. No new fallback, deadline, polling, decoder, test-only verdict or parallel lifetime owner. Exact corrected source/content review precedes native candidate/treatment labs.

Attributable literal debt must be removed without raising baselines. Inherited exact unused1449, metric/file-size/guideline/corpus/startup risks remain HOLD even after child code is repaired. Frozen V4 controls, full helper cone, query preservation/source order, source-only final pair and dirty-retention treatment remain separate reviews/proofs. Non-main preservation of honest REVISE is allowed by root authority, never current source approval, Quest completion or main certification.
