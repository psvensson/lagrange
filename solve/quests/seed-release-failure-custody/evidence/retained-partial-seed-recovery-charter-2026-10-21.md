# Retained partial-seed recovery: next-unit charter — 2026-10-21

Author: `subagent:/root/release_recovery_writer`. This is additive, read-only
source correspondence and a proposed next contract boundary. No source, test,
seal, receipt or existing historical record was changed; no test or lab run
was performed for this note. It does not approve implementation or certify
U1, TX1, FreshMG, a release or automatic retained-seed recovery.

**Recommendation:** activate a separately reviewed original-create authority
handoff unit before attempting automatic restart of the known pre-registration
partial seed. The current first refusal is correct in the absence of that
handoff. Existing durable records prove useful narrower facts, but none of the
inspected records presently supplies the missing original allocation grant.
Do not repair this by relaxing the SERVICES guard or manufacturing seed proof.
Old partial stores without such a grant must retain their current fail-closed
outcome.

## Known operation and exact first frontier

The existing failure-custody witness starts a real native seed through
`BootstrapService.bootstrap`, with a supplied retained directory and the
unchanged 3,000 ms release budget. It observes actual control release and then
the first non-control ENABLE commit, moves only the existing handler clock to
the original deadline, and observes the selected attempt's refusal before
OBSERVE_APPLIED_POSITION/RESUME. It proves failed-close custody, same-owner
shutdown retry and an independent retained-origin read after the actual close.
The source-bound and measured evidence is retained in the first-unit handover
and `evidence/independent-witness-review.md`; it was not rerun here.

The actual second bootstrap in that witness reaches
`seedPartitionsPhase/CREATE_OWNER_DEFERRED` for
`artifact_payload_chunks-p1-r1`. Its storage snapshot is readable, `empty:
false`, with `rows: []`; the replacement replica handler has not been acquired.
The first refusal is a partition creation admission, not a message-group
refusal and not a current-control release failure. The origin remains intact.
See `test/bootstrap/seed-release-failure-custody.test.js:174` and the preserved
native diagnostics in `evidence/baseline-native-63420a1a5/controller.log:459`.

The boundary of that evidence matters. The fixture's restart helper
(`test/test-helpers/seed-release-failure-custody-fixture.js:223`) calls the real
storage and auto-rejoin readers, then directly constructs a new
`BootstrapService` with a new local NodeService and `bootIncarnation + 1`.
It does not call public startup, reserve the incarnation through its owner,
or reacquire the process lock. It is not a positive for automatic public
startup recovery.

Why the actual reader selects seed despite native retained files is visible
in source. `readDurableNodesTableSnapshot` only sets `hasDurableNodesTable`
when it absorbs nonempty NODES rows, or encounters an unreadable replica DB
(`rejoin-hints-durable-evidence.js:372,413`). Empty readable NODES tables do
not establish that fact. With absent hints and no nonempty membership rows,
`collectAutoRejoinDecisionContext` computes `durableStateDetected: false`,
and the decision owner returns FRESH_SEED (`rejoin-hints.js:398,438,632`).
That is the membership reader's bootstrap-branch outcome, not a claim that
physical storage is virgin. The separate SERVICES reader marks non-SERVICES
partition DB/sidecar artifacts as `unownedArtifacts` and does not classify
this directory as empty (`rejoin-hints-durable-evidence.js:162,277`). The
partition guard consequently refuses the missing row before construction
(`seed-partitions-phase.js:85,215`).

Public startup adds material owners. `resolveStartupJoinDecision` obtains
expectedClusterId from actual hints, then consumes the auto-rejoin decision
(`entrypoint-runtime-join-decision.js:386`). `acquireLagrangeRuntime` acquires
the exclusive data-directory owner before that decision
(`lagrange-runtime-startup.js:685`). `startSeedNode` reserves the boot
incarnation, resolves the cluster-incarnation fence and reads storage admission
before constructing bootstrap (`lagrange-runtime-startup.js:387`). It also
constructs the actual BootstrapAPI/topology owner before bootstrap. No public
run of the retained scenario is claimed by source correspondence alone.

## Authority producer, durable facts and current ordering

| Fact | Existing source/owner and limit |
| --- | --- |
| Startup membership/cluster choice | `resolveStartupJoinDecision` / `resolveAutoRejoinStartupDecision` and `seed-recovery-proof.js`. Current membership, cluster-id matching and peer/quorum proof remain separate from a local opening grant. |
| Original founder placement | Seed MG/partition phases derive the canonical founder identities and node addresses; `SeedInfrastructurePhase.queueBootstrapServiceReplica` places descriptors/options only in the current bootstrap's Maps (`seed-message-groups-phase.js:72`, `seed-partitions-phase.js:115`, `seed-infrastructure-phase.js:295`). These Maps are not a durable grant. |
| Physical incarnation and native history | `RaftRsReplicaLifecycleOwner` stores group/peer/replica identity, incarnation, active/retired state and native opening history in its existing SQLite row (`raft-rs-replica-lifecycle-owner.js:109`). No node-bound original seed allocation or SERVICES handoff fact is recorded there today. |
| Native consensus opening | The operation port captures the exact lifecycle incarnation (`raft-rs-operation-port.js:180`). The runtime restores intact history; fresh native bootstrap and ESTABLISHED history commit together through the existing SYNCED transaction (`raft-rs-runtime-owner.js:443,489`). This proves opening history, not original placement permission. |
| Participant write origin | The real ENABLE origin survives failed startup. It supports the existing-origin release algorithm only after the correct local service is admitted and hosted. It cannot authorize creating that service or changing its generation. |
| Startup progress | `StartupWorkflowStore` preserves node/session/checkpoint/attempt/error fields (`startup-workflow-store.js:55,260`); its file writer uses write/rename (`:125`). It records neither exact replica allocations nor a synced native-opening grant. Promoting checkpoints to authority would add a competing decision source. |
| SERVICES identity/lifecycle | Registration uses the existing INSERT-only `PartitionServiceRowOwner` and `MessageGroupServiceRowOwner`; conflict/unknown answers resolve through their existing authoritative reads. The lifecycle owner retains status transitions and cleanup ownership. Missing rows cannot be synthesized by a recovery updater. |
| Cluster identity | `SeedRegistrationPhase.persistClusterIdIfMissing` mints/persists the CONFIG singleton (`seed-registration-phase.js:643`). It runs after SERVICES registration and other registration writes (`:121-128`). There is no already-minted cluster ID at the known earlier cut to copy into an allocation proof. |

Current order is: fresh membership/storage admission -> volatile founder
catalog -> exact local incarnation/native opening -> acquire release owners ->
participant release -> SERVICES registration -> remaining registration and
cluster-id publication -> later runtime/serving handoff. The release precedes
registration in `seed-startup-plan.js:34-45`. Thus a committed release origin
can survive while the original placement is known only to a dead bootstrap
lifetime. The source supports a missing recovery handoff; it does not support
waiving a protected creation refusal.

## Smallest proposed contract boundary

Reuse the current original-create/physical-lifecycle/registration owners. The
new fact, if approved, is a narrowly scoped record of an already admitted
original seed allocation and its remaining handoff obligation. Its suitable
existing storage surface is the exact local lifecycle row, written by that
owner from an authenticated original-create decision. It must not become a
second SERVICES placement table, generic bootstrap journal or workflow engine.
No new storage format, field names or source patch is proposed by this note.

The initial repair should cover the known cut: the complete original local
founder cohort is present, native bootstrap records are intact, and bootstrap
has failed before completing registration. It may resume only the original
identity, incarnation, service kind/group/partition, original host and declared
cohort. The original issued boot incarnation may identify provenance; it is
not current membership, a lease, or permission for a successor. Missing,
unknown, foreign, conflicting, retired or partly lost allocation evidence
cannot be inferred from file presence, origin, a checkpoint or absence of a
SERVICES row. Partial allocation before the complete cohort exists is a
separate recovery extent unless explicitly included and proved.

Before source work, the bounded owner contract and independent design review
must settle these concrete ordering requirements:

1. **Issue before the effect.** Name the sole original-create producer and the
   validated fresh membership plus storage admission it consumes. Persist its
   exact allocation fact before native participation can escape. Preserve the
   existing atomic bootstrap/history commit and exact-incarnation fences.
   An admission result passed to a constructor is not durable evidence until
   this actual write is proved.
2. **Consume through public startup.** The real startup decision owner must
   distinguish this unfinished original allocation from an established seed
   and feed a typed outcome to the existing storage/creation owner. A lower
   bootstrap seam or a fresh-label reconstruction cannot provide permission.
   The new local continuation must not serve as cluster-id match, peer/quorum
   proof or authorization to found a new cluster. The old seed-restart-v2
   gate stays authoritative whenever established-cluster evidence applies.
3. **Complete the original release obligation.** After the first non-control
   ENABLE, other founder cohorts may still have no origin. Existing-origin
   recovery deliberately refuses those (`replica-handler-release-recovery.js:
   192-215`). The original allocation continuation must reach the existing
   participant-release authorization owner for precisely that remaining work;
   it must not fabricate an origin, borrow an operator token, or infer fresh
   storage from the membership reader's FRESH_SEED branch. Build, current
   control, full membership census, drain, generation and final OPEN owners
   still decide every release.
4. **Make the SERVICES handoff monotonic.** Registration inserts STOPPED rows
   before activation (`seed-registration-phase.js:209-317`), while current
   startup admission admits only PENDING/CREATING/SYNCING/ACTIVE rows
   (`seed-partitions-phase.js:66`). Crash/lost response between these writes
   is an explicit required edge. Reconcile the exact original create/row
   identity through the existing row owner; do not admit arbitrary STOPPED
   rows. Record the local obligation's discharge so that a later missing row,
   cleanup tombstone, retired incarnation or changed placement cannot revive
   original-create authority. Local storage and replicated SERVICES are not
   one atomic transaction: publication, acknowledgement loss and retirement
   ordering must be stated and tested, not assumed.
5. **Preserve cluster identity ownership.** Today CONFIG cluster_id is minted
   later. A local pre-cluster allocation identity is not that cluster ID. If
   the reviewed design requires the ID earlier, the existing cluster-identity
   owner must explicitly own the earlier mint and later unchanged publication;
   do not create an independent ID or claim a missing value matches. That
   decision must retain all existing mismatch and seed-serving proof gates.

These are prerequisites for an implementation contract, not completed design
or implementation acceptance. In particular, the monotonic SERVICES handoff
and public startup mode must be reviewed before choosing the minimal fields.
A local grant that remains usable after published placement can be retired
would be unsafe even if it makes the first restart green.

## Complete operation and proposed binary evidence

Trigger -> the actual public restart after failed pre-registration release,
with original directory retained and all old native owners closed (or the old
process conclusively exited).

Current facts -> actual public membership/cluster decision and process custody;
readable, exact original allocation and lifecycle/native records; current
SERVICES identity/cleanup observations; current release origin, build,
committed membership, generation and transaction facts. Unavailable facts
retain a named refusal and their existing retry/restart/operator owner.

Permitted effect -> reopen only the original admitted allocation, re-enter the
single release algorithm and complete canonical row registration/activation.
A recovery wake grants none of these effects itself.

Durable commit -> the original allocation write; unchanged synced native
opening/history commit; real ENABLE origin; canonical SERVICES INSERT or
exact authoritative resolution; durable handoff discharge before old-create
permission can outlive published lifecycle authority. Each commit has its
own owner; a shared DONE bit is insufficient.

Lost response/restart -> re-read those owners and resume the same obligation,
never mint another allocation or consume a stale success observation. Partial
registration and cluster-ID publication are named restart cuts, not green
setup assumptions.

Remaining obligation/release owner -> physical lifecycle and cleanup owners
retain exact resources; release owner retains pre-origin or existing-origin
work; row owner resolves uncertain registration; lifecycle/cluster startup
owners retain serving permission. No directory lock is released while required
native cleanup is unsettled (`entrypoint-startup-acquisition-ledger.js:42` and
`data-directory-process-owner.js:64`).

Freeze a real-entry test before implementation and run the old candidate on
the same locked host as the repair, without retries or deadline changes. Use
cold child processes entering `startLagrangeRuntime`, a supplied retained
directory, real reader outcomes and actually issued boot incarnations. Reuse
the existing custody/clock fault mechanism only to select the first actual
non-control ENABLE settlement and advance that handler's clock to the original
3,000 ms deadline; native/node timers and every production owner call remain
real. Do not substitute BootstrapAPI success, construct fresh/cluster-match
outcomes, disable canonical recovery, or reset process claims to simulate a
public restart. The initial process must close through its real owners or exit
before the next process acquires storage.

The baseline must positively engage that committed cut and report its first
actual refusal. The repaired positive must preserve the original origin and
physical identities, reopen only those identities, complete the remaining
pre-origin releases through valid original authority, settle canonical row
handoff and meet the real startup/serving gate. If a later gate refuses, record
that exact frontier; a local OPEN component result is not startup success.

Required targeted negatives are:

- Same retained native history/origin without the new original allocation fact
  (including historical old stores): refusal before new opening authority.
- Wrong node/cohort/incarnation, a retired lifecycle, native loss after
  ESTABLISHED, and unreadable/conflicting observations: no fresh genesis or
  original-create revival.
- Actual nonmatching cluster identity and an isolated stale persisted seed
  without the v2 proof: public startup refuses even if local grant-like data
  remains. No forced seed or manufactured peer proof is allowed.
- Crash/lost answer after a real SERVICES insert but before local handoff
  discharge, including its STOPPED state; exact reconciliation progresses only
  the admitted original row. Cleanup/foreign row and later row absence after
  discharge must not recreate it.
- Remaining original cohort with no origin: valid continuation exercises real
  ENABLE; removing that authority must fail at the named pre-origin owner,
  not at generic setup. Existing-origin replay must preserve the old origin.
- A source-only diagnostic removing the durable original-authority check must
  cause an engaged negative to detect widened permission; suppressing only
  the handoff/restart continuation must make the positive fail at its named
  progress assertion. Static rejection or unavailable setup is not a native
  semantic negative.

Keep cold-process native safety/recovery results separate from distributed
certification, historical failure causation and performance. No RF3 cross-host,
U1/TX1/FreshMG seal, snapshot transfer, partial-cohort loss recovery or latency
claim follows from this next local operation.

## Exact inspected inputs

Working HEAD when this binding was captured: `619c670e1f9d9cd36d44d97c3b2949329389fe09`. All product
files listed below were checked byte-for-byte against `5af0cc7f6d7ddd81bb10e9b590f02cc13e70ddad`
(src tree `8e5f187207b976cdbf03e328d565d6fa46ed745b`). The root is concurrently
composing separately reviewed changes; this note binds the listed bytes, not a
future moving head. It does not overwrite or accept those other changes.

| Product input | SHA256 |
| --- | --- |
| `src/lagrange-runtime-startup.js` | `cbe0c4ea766eacacd4dab194470725f82a3ec2085977f6e51a83a0ea00ff3e28` |
| `src/entrypoint-runtime-join-decision.js` | `dfe5c499206c420d7f74a22417132996e8dbd652ea1fd99250e72b1ef4d57b3f` |
| `src/entrypoint-startup-acquisition-ledger.js` | `619b9eeb8c4064161863ad1bd7dfa79eb5f7409543f0c90c222976fd29373baf` |
| `src/storage/data-directory-process-owner.js` | `46ceabee8eb770347f5723cf19628b547d24423a630d89a4166ff8cbbd44922b` |
| `src/bootstrap/rejoin-hints.js` | `5d265e3d8fc0a13ab13274217970bdbec7c98a85b0e88e10b213c5382d518c4e` |
| `src/bootstrap/rejoin-hints-durable-evidence.js` | `ec8df0fbd6bb84fd008fa403462f59628806ac51c0bb9ecc21c86abd632e07dc` |
| `src/bootstrap/seed-recovery-proof.js` | `fc6ae991015570988396f48e9c6d88d6fad5e3b91ac80d849d3b4f4f0819909c` |
| `src/bootstrap/seed-startup-storage-admission.js` | `a49b9cc57e0c391e3672e9f69d5541984193fd8d0e8ff13faaa3f7993d483e63` |
| `src/bootstrap/phases/seed-infrastructure-phase.js` | `206e1a95e7ae9fc760a696296a73253721deb0a616b66170853ef08cd5475dea` |
| `src/bootstrap/phases/seed-message-groups-phase.js` | `a735823abb037fa2096a266eb7a9769925a0cb3ec92c75ac5f10e7d8e7b1b58c` |
| `src/bootstrap/phases/seed-partitions-phase.js` | `3b86eede8a945086161ead9680521791aebd317568a2a50f0af829d8fd93b8a3` |
| `src/bootstrap/phases/seed-registration-phase.js` | `ea726696d17f4611e3b46f57f054bcc37cb8ab3233b0c42db58dbf2d532784f0` |
| `src/bootstrap/pipeline/seed-startup-plan.js` | `f4a18a1fce24d98c64fa3366be19fc2a5620eb08be836a33b135a4f30b02d947` |
| `src/bootstrap/bootstrap-service-seed-workflow.js` | `4d4f439ca2a098d21f8e52b5c82713e879e1acea2ace6fe021af9d416fa3f202` |
| `src/bootstrap/startup-workflow-store.js` | `7bd5f8d95e4580d0ed62a72c499e7e6d23843d8c7b8a2e14a7047bb590347b65` |
| `src/raft/raft-rs-replica-lifecycle-owner.js` | `692ff3dd28f0ae4fe7f70b1128361df494437b3a8939d83bba5471cd5e5bfe01` |
| `src/raft/raft-rs-operation-port.js` | `ab3b0a3c27b1568ab644d458ebcf078f47d8da98255d41317bdc766923ff0597` |
| `src/raft/raft-rs-runtime-owner.js` | `b47951f39c6a5e7b93670a3a730115b3993976e808ec2e7d76598ade270dbc0f` |
| `src/partition/partition-service-row-owner.js` | `5097f714b3498a458f92ff71493a5d819a215dd96aa9a4b0845defaffbc798f6` |
| `src/node/participant-release-authorization-owner.js` | `056e5be750c4862fb8b869187904671b8da4690032033a9effcda01d2d0c2e7c` |
| `src/node/replica-handler-release-recovery.js` | `d3ddafe1710e8d709f9c1a80c5a0cec5940d4b9fd6b2d0cef6cb6771c4cd5b0d` |
| `src/node/replica-handler-participant-cutover.js` | `29614ff0e427e4971cb4a186e000f8deafa55081a91877635833398948210464` |

| Owner, seal, historical evidence or witness input | SHA256 |
| --- | --- |
| `architecture/contracts/authority-and-recovery.md` | `128538d75429c1d31b9cb7aa245eef9392ef14f7ee948c925086582a972a1ae5` |
| `architecture/runtime-contracts.md` | `0fe213d96ec992dc696136e7f17c315f740fe82afccd6588bc9bf1ec62f8ee6b` |
| `solve/quests/replica-opening-history/quest.json` | `d37a784bc53481fdef765d84436996e23c0036512acf291024cf98708e099139` |
| `solve/quests/seed-restart-recovery-mode-v2/quest.json` | `6e6c562fcbc1d3dc12cc934333bb9d8a3ec605dd61e9551d11a4b4ecba5fa5a7` |
| `solve/quests/durable-cluster-identity-v2/quest.json` | `5d30ac5aeecb207223e42bd97a7f343e6194010534109f7b8b16f48159a39a67` |
| `solve/quests/seed-release-failure-custody/HANDOVER-2026-10-20.md` | `0aaf947ab1f019696a917c2f5150b5eb67d2dfb12a333fb9c938df18aaa81367` |
| `test/bootstrap/seed-release-failure-custody.test.js` | `5c82b7321196e624f1e16963047c33281a56edc8e2ff71a8aeba5089cf758f21` |
| `test/test-helpers/seed-release-failure-custody-fixture.js` | `f15ac20c8f229e8265a4c21cdb44b0449972ee6ae5fd51456f4a01dd6d3dda10` |

The opening-history seal is `316e5fcdab102ddc562433139d73b3df62748590`;
the seed-restart-v2 seal is `23ca84017cfd906269bb81cbf217e791a2785ec5`.
The migrated durable-cluster-identity-v2 Quest currently has `sealedAt: null`
and an orphan-log marker; this note does not invent a seal for it. Its current
source owner still defines the single cluster identity. No seal was amended.
