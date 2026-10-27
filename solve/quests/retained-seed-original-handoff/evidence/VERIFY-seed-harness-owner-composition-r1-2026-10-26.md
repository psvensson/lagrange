---
audience: development
documentClass: evidence
---

# VERIFY: seed-harness-owner-composition r1 (73fa63298)

## Verdict: REQUIRED CHANGES (two exact, small; everything else may be kept as is)

- **Subject:** `73fa6329836c3e69a56f3b3108dd4180c1cfb72e` (parent `5cfabc308`, `refs/wip/lab-seedharness-2`),
  branch `work/seed-harness-owner-composition-20261025`. Test-only: `git diff --stat 5cfabc308 73fa63298 -- src bin vendor` is empty.
- **Verifier:** independent; I did not write the unit. I edited nothing in the implementer's worktree or in
  `/mnt/data/peter/projects/lagrange`. I ran in detached scratch worktrees (head, base, mut) and removed them at the end.
- **Overall:** the core claim holds. At 73fa63298 no touched or sampled file reports DIR, AUTH or O4. The custody
  composition matches production's release semantics. No test bypasses the hold. The admission-fence rewrite is
  red when the fence is removed (I confirmed this by mutation). The singleton diagnosis is correct.

### Required changes

**RC1. `test/bootstrap/bootstrap-sequence.test.js:418` and `:513` hit a harness defect, not the O3 hold.**
- These two tests ("activates message-group rows after seed registration" and "notifies local admin runtime
  before seed self-publication") still use `new BootstrapService` directly and call `bootstrap()`.
- I probed `result.error` on both at head. Each fails at `phase: not_started` with
  `Cannot read properties of null (reading 'getDataDir')`. That is the harness DATADIR defect, not O3.
- The code gives no reason for leaving them. The commit message speaks only of "the four direct bootstrap()
  server/self-connection tests".
- `classify.tsv` marks the whole file `RED/CONT`, which hides these two reds.
- **Fix:** move both onto `createVirginSeedBootstrapService`. Their phases are stubbed, so they will then stop at
  `completeSuccessfulBootstrap` → `assertOriginalSeedContinuation` (O3), which is the honest class. Alternatively,
  report them as residual harness defects. Either way the report must stop counting them as "blocked by the hold".

**RC2. The doc comment on `acquireSeedStartupAuthority` gives the production order wrongly.**
- The comment is at `test/integration/helpers/cluster-test-helpers.js:~272`. It says the order is
  owner → storage admission → membership outcome.
- Production's actual order is:
  1. owner: `src/lagrange-runtime-startup.js:719`;
  2. membership outcome: `resolveStartupJoinDecision` at `:743`, which calls `resolveAutoRejoinStartupDecision`
     (`src/entrypoint-runtime-join-decision.js:400`);
  3. storage admission: only after that, inside `startSeedNode` at `lagrange-runtime-startup.js:413`.
- The helper reads admission before membership. Both reads are read-only, so the behavioural risk is low, but the
  "production order" claim is false.
- **Fix:** read the membership outcome before `readSeedStartupStorageAdmission`, which makes the claim true. If that
  is not wanted, correct the comment and the commit claim.

## (A) The helper and custody

- **Owner never defaulted.** `acquireSeedStartupAuthority` acquires through `acquireDataDirectoryProcessOwner(dataDir)`
  unless the caller *explicitly* owns the key (`Object.hasOwn(options,'dataDirectoryProcessOwner')`).
  - `acquiredOwner ?? options.dataDirectoryProcessOwner` only chooses between the acquired owner and the caller's.
    It is not a null fallback.
  - The only explicit `null` in the tree is the designed DIRECTORY witness at
    `test/bootstrap/seed-original-attempt-lifetime.test.js:368`, which goes through its own fixture. That file is
    unchanged and green (21/21) at both commits.
- **Failure paths.**
  - A later failure releases an owner the helper itself acquired: the catch around admission and membership, and
    the catch around `new BootstrapService`.
  - `createPreparedVirginSeedBootstrapService` shuts down, and so releases, when `prepareOriginalSeedAttempt` throws.
- **Release only after a successful shutdown.** `bindVirginSeedStartupCustody` calls `release()` only after
  `await shutdown()` resolves. If shutdown fails, the owner stays held for the life of the process.
  - This matches production. `bindDataDirectoryProcessOwner` (`src/storage/data-directory-process-owner.js:76-86`)
    releases only after `shutdownRuntime` resolves, and the cleanup ledger defers with
    `requiresSuccessfulCleanup: true` (`lagrange-runtime-startup.js:721-723`).
  - So on a failed shutdown the owner is retained, not leaked by accident and not released.
- **Divergence (recommended, not required).** The `finally` still runs `rmSync` on a fixture-owned directory when
  shutdown failed, while the owner is still held.
  - The doc says the directory is removed "after the owner is released".
  - Production never deletes the directory, and `seed-release-failure-custody-fixture.js:closeFixture` *retains* the
    directory on failure.
  - Suggestion: run `rmSync` only on the success path, so it is consistent with the custody fixture.
- **`:395` untouched.** `src/raft/raft-rs-original-allocation-preparation.js:390-397` is unchanged, and no `src`
  file changed at all.
- **No bypass of the hold.**
  - No added test line stubs or assigns `assertOriginalSeedContinuation`, `assertOriginalSeedAttempt`,
    `admitOriginalSeedReplica` or `prepareOriginalSeedAttempt`, or replaces `originalAllocationPreparation`.
  - The only assignment in the tree is pre-existing: `test/bootstrap/seed-retained-effects.test.js:639`, which this
    commit does not touch.
- **Formation-sim seed host** (`test/simulation/formation-sim-production-seed-host.js:336-356, 559-562`):
  - The hand-written `startupServicesAdmission` copy is deleted. The host consumes
    `acquireVirginSeedStartupAuthority` and passes the real owner and membership outcome.
  - It awaits `prepareOriginalSeedAttempt` before phase one, outside the runner, which matches production at
    `lagrange-runtime-startup.js:438-439`.
  - The refusals A2b-7/A2b-8 still fire before acquisition (`claim` / `refusePrecomposed` run first). They are
    correctly `assert.rejects` now that the host is async.
  - Minor: the host has no try/catch around `new BootstrapService` after acquiring, so a constructor throw would hold
    the owner until the process exits.

## (B) Owner-decision distinction, per file (my runs, 73fa63298 against 5cfabc308)

How to read the "Before" column:
- **DIR** = `original-allocation-directory-custody-unavailable`.
- **AUTH** = `original-allocation-authority-unavailable`.
- **O4** = `… is not a function` (delegate drift).
- **DATADIR** = the null `dataDirectoryManager` TypeError.

The before and after classes come from reason-string counts in my own TAP output (`logs/base2`, `logs/head2`).

| File | Before (base) | After (73fa63298) | Distinction class | Positive startup assertions |
|---|---|---|---|---|
| bootstrap/lifecycle-owner-replica-routing | AUTH (2/3) | green 4/4 | harness defect resolved | intact; real create/start through the adapters; a declared member is queued, so the property is real, not vacuous |
| bootstrap/production-scheduling-defaults | AUTH (2/4) | green 4/4 | harness defect resolved | intact, assertions unchanged; real hosted-replica authorities |
| bootstrap/seed-infrastructure-phase | O4 (0/2) | green 2/2 | harness defect resolved | intact (router stored, resolver installed, selection owner consulted, leader bypass refused). The fake `MessageRouterSetup.create` calls `options.retainRouter`, the seam the setup owner documents (`src/bootstrap/shared/message-router-setup.js:127,168`); the retain callback is production's (`seed-infrastructure-phase.js:234-237`) |
| bootstrap/seed-infrastructure-runtime-identity | O4 (1/3) | green 3/3 | harness defect resolved, with a **partial weakening** | A1c now reads `service.nodeId`, which the fixture pre-seeds with the expected id, so A1c no longer detects "the phase never set the identity". The comment "every recorded value is one the phase set" is untrue. The MUTATION test still proves the setter path is live. Recommended fix: record through wrapped `setNodeId`/`setNodeAddress` delegates |
| bootstrap/seed-message-group-founder-open-refusal | O4 (0/1) | red: `original-retained-history-classification-unavailable` | assertion blocked by a hold (the retained classification hold, Quest retained-seed-original-handoff; not O3) | the RESEED_REQUIRED and durable `retired` row assertions are intact, and it is red truthfully. One assertion was dropped: "a held founder is not mapped" (`services.has(REPLICA_ID) === false`). Recommended: restore it as `!service.messageGroupServices.has(REPLICA_ID)` |
| control-plane/core-system-logic-runtime-witness | O4 (test 3) | red at O3 (test 3); tests 1-2 green both | assertion blocked by the hold | intact (success, COMPLETE, writers handed over, lease/heartbeat RUNNING, armed on the injected clock) |
| simulation/…-bootstrap-phase-one | AUTH (3/8) | green 8/8 | harness defect resolved; A2b-1/A2b-3 rewritten to the fence (see C) | phase-one obligations intact. The retired self-dial/IDENTIFY obligation (A2b-3) was **deleted, not relocated**. Recommended: carry "post-handoff `startWebSocketServer` establishes the self connection over the link" into the fresh-seed activation Quest acceptance |
| simulation/…-five-node-composition | AUTH (2/3) | green 3/3 | harness defect resolved; A2c-2 rewritten | intact |
| simulation/…-production-handoff | AUTH (0/5) | red O3 (0/5) | assertion blocked by the hold | unchanged (only `await` added) |
| simulation/…-production-message-groups | AUTH (0/4) | green 4/4 | harness defect resolved | unchanged; message-groups precede the first O3 site (`seed-partitions-phase.js:388`), so it is not vacuous |
| simulation/…-production-partitions | AUTH (0/3) | red O3 (0/3) | assertion blocked by the hold | unchanged |
| simulation/formation-sim-bootstrap-owner-entry | AUTH | green 9/9 | harness defect resolved | unchanged (needs the runner's `@tapjs/mock` loader; see Limits) |
| simulation/…-transcript-determinism | AUTH (0/5) | green 5/5 | harness defect resolved | unchanged |
| simulation/formation-sim-charged-seed-host | AUTH (0/3) | red O3 (0/3) | assertion blocked by the hold | unchanged |
| simulation/formation-attribution-provenance | AUTH (37/38) | red O3 (37/38) | assertion blocked by the hold | unchanged |
| bootstrap/seed-release-failure-custody | DIR | red O3 | assertion blocked by the hold | intact. The fixture holds one owner across both lifetimes and releases it only after a clean close (`seed-release-failure-custody-fixture.js:244,287-290,320-326`) |
| bootstrap/bootstrap-sequence | DIR + DATADIR (23/39) | 26/39: 4 migrated tests red at O3, **2 still DATADIR (RC1)**, "without wsPort" red at O3 | mixed; must be reported split | intact, unweakened ("bootstrap should succeed", self-connection before services, and so on) |
| integration/convergence-control-snapshot | DIR | red O3 | assertion blocked by the hold | unchanged |
| integration/seed-node-bootstrap | DIR | red O3, then a downstream `cdcService` null TypeError | assertion blocked by the hold | unchanged |
| bootstrap/phase-failure-handling.property | DIR (5/9) | O3 (8/9; property 4 red) | assertion blocked by the hold | see D. The 8 green properties are green at the hold, not proof of phase-failure handling |
| bootstrap/seed-original-attempt-lifetime (control) | green 21/21 | green 21/21 | n/a | the DIRECTORY witness is unchanged |

**Fresh-seed acceptance demonstrated:** none. That is correct and expected; nothing in this unit claims it.

**The "5 AUTH → green" claim** is the lab's count at `ae90b7873`. At 73fa63298 the 11 AUTH files split 7 green and
4 at O3; phase-one and five-node turned green after the lab run. The 5 + 2 files that turned green prove the
property they meant to (see the table). The one exception is the A1c weakening in runtime-identity.

**The two O4 → green files** are real proofs: they consume the owner's builder. The A1c caveat applies to
runtime-identity.

## (C) The admission-fence rewrite

- **The live property.**
  - `src/bootstrap/phases/seed-infrastructure-phase.js:221-238`: `MessageRouterSetup.create` gets no `wsPort`,
    gets `externalAdmissionEnabled: false`, and receives the `retainRouter` custody callback.
  - Admission opens only in `startWebSocketServer` (`bootstrap-service-runtime-methods.js:298-330`) and
    `openExternalTransportAdmission` (`:338-344`). Both call `assertOriginalSeedContinuation()` first.
- **The retired shape is pre-7fa4d79ae.** `git show 7fa4d79ae -- src/bootstrap/phases/seed-infrastructure-phase.js`
  removes `wsPort: wsPort` from the router options (`externalAdmissionEnabled: false` was already present) and
  moves `setMessageRouter` into `retainRouter`.
  - So `routerOptions.wsPort === WS_PORT`, the bound endpoint and the self-dial/IDENTIFY transcript are the
    pre-7fa4d79ae behaviour.
- **Red by construction.** Both mutations ran in a scratch worktree and were reverted (`git checkout -- src`;
  status clean before removal).
  - **M1, wsPort restored and admission enabled (the implementer's edit):** 3 reds: A2b-1, A2b-3, A2c-2.
    Log: `logs/mut-both/`.
  - **M2, the exact pre-7fa4d79ae shape (wsPort restored, admission still false):** the same 3 reds.
    Log: `logs/mut-wsport-only/`. So the wsPort/endpoint/no-frame assertions carry the result on their own.
  - **Unmutated:** phase-one 8/8, five-node 3/3.
- **One assertion edit.** `incomingPeerIdentity(router)` is now expected to be `undefined` rather than `null`.
  That is consistent with "no inbound peer at all".

## (D) phase-failure-handling

- **The singleton cause is confirmed from the code.**
  - `BootstrapService` defaults to `options.nodeService || NodeService.getInstance()` (`src/bootstrap/bootstrap-service.js:180`).
  - `NodeService.initialize` returns early once initialized (`src/node/node-service.js:137-138`).
  - The phase then writes `d.setNodeId(nodeService.getNodeId())` (`seed-infrastructure-phase.js:177`).
  - So in runs 2..n the service id becomes run 1's id while the attempt was declared under run n's id, which gives
    `original-allocation-identity-mismatch`.
  - The fix, a fresh `new NodeService()` per run through the owner's constructor option, is the production shape
    (one runtime per process). After it, IDENT = 0 in my runs.
- **numRuns 3.** The only arbitrary is `nodeIdArb` (`fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,35}$/)`). Three
  distinct ids is a small sample but not a degenerate one; the configs are fixed constants anyway.
- **The comment is truthful.** It says the properties measure the continuation hold until fresh-seed activation
  lands. In fact all 9 properties accept any `success:false`.
  - 8 pass at the hold, which says nothing about the leadership-wait failure they were written for.
  - Property 4 (the error contains leadership/timeout/failed/error) is red because the hold string contains none of
    those words.
  - Reports must count this file as "blocked by the hold", never as "phase failure handling demonstrated".
  - The comment's measurement date (2026-10-25) does not match the commit date (2026-10-24). This is cosmetic.
- **Duration.** My runs: 207 s (first run) and 359 s (second run; local machine contended, with thermal holds
  between files). Both are within the 600 s file budget. On the 2.4x-slower GCP runner lottery (see memory) 359 s
  would not fit, while 190-207 s would (about 500 s). Treat the margin as thin.

## (E) Doubles: `_buildPhaseExecutionDelegates`

- It consumes the owner's real builder (`src/bootstrap/bootstrap-service-seed-delegates.js:26-28,72`) instead of a
  hand-written map. That satisfies `test/guidelines/fixtures.md` "Test Doubles Consume the Owner" rule 1 far better
  than the base did, and it has precedent in three existing tests:
  - `seed-phase-continuation-fixture.js:17`;
  - `replica-lifecycle-durable-generation.test.js:1400`;
  - `managed-split-admission-reliability…:450`.
- It is still a reach-through.
  - The method is private by convention.
  - It takes **one bundle** (phase execution) and builds a *second* `SeedInfrastructurePhase` next to the one the
    service already owns. The service's own phases get the composed bundles
    (phase-execution + readiness + cleanup + runtime-wiring; `bootstrap-service.js:570-593`).
  - The witness's phase therefore runs with a delegate set production never builds.
- **Owner-shaped alternative (recommended, not required):**
  - Drive `service.seedInfrastructurePhase`, the owner's own instance with its composed delegates.
  - Supply the witness inputs at the service methods the delegates forward to (`getLogger → self.logger`,
    `getLeaderMessageGroupService → self.getLeaderMessageGroupService`,
    `resolveQueryTransportMessageGroupSelection → self.resolveQueryTransportMessageGroupSelection`).
  - `lifecycle-owner-replica-routing` and `founder-open-refusal` in this same commit already do this.
  - This would also let runtime-identity record identity through the owner without pre-seeding.
- **Related one-version finding (recommended).** `seed-release-failure-custody-fixture.js:225-246`
  (`restartRetainedSeed`) still hand-composes the retained-start authorities (`readSeedStartupStorageAdmission` +
  `resolveAutoRejoinStartupDecision` + `new BootstrapService`). This commit introduced
  `createRetainedSeedBootstrapService` for exactly that composition, so these are two versions of one shape
  (fixtures.md rule 4). The `membership.mode === 'seed'` assertion would need the outcome read back.

## (F) What I ran (all logs under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/seedharness/verify/logs/`)

- **Test runs.** 21 files, run serially. Each file was gated on `scripts/checks/wait-for-thermal-headroom.js`, run
  with the repo runner's node arguments (`--import=@tapjs/mock/import --enable-source-maps --no-compilation-cache
  --max-old-space-size=512`), at head and at base. Results are in `head2/summary.tsv` and `base2/summary.tsv`, with
  per-file `.tap` alongside.
  - A first pass without the mock loader is in `head/` and `base/`. It made `formation-sim-bootstrap-owner-entry`
    look red (2/9) because `t.mockImport` cannot apply without the loader. This is an artifact of my first pass,
    not a finding.
- **Mutations:** `mut-both/` (M1) and `mut-wsport-only/` (M2).
- **eslint and `node --check`** on all changed `.js` files: clean (`eslint.txt` is empty, rc 0).
- **`test:duplication`:** OK, 688/688 groups, 26126/26126 lines (`duplication.txt`).
- **`test:unused:ratchet`:** OK, 1413/1413 (`unused.txt`). No tighter hint at this commit; the "1412 later" is not
  measured at 73fa63298.
- **`audit:shards`:** current and OK, 2473 tests (`audit-shards.txt`).
- **`test:metadata:refresh`** at head: zero drift (clean `git status`).
- **Hook replay.**
  - Method: a scratch worktree at 73fa63298, `git reset --soft 5cfabc308` (all 21 files staged), then
    `.githooks/pre-commit`. Log: `pre-commit-replay.txt`.
  - Result: rc 0, after 3m38s.
  - It re-stamped only `solve/changes/global-owner-debt-inventory/inventory.json`, at three hashes: the logical
    digest of `jscpd-test` and the `inputDigest`. The clone and line counts are unchanged (688/26126). This is
    probably environment-dependent report content (another tree and path).
  - The hook printed "owner-debt refresh: ratchet exceeded in check-complexity.js". This comes from its full-tree
    inventory refresh. The scoped complexity ratchet was 0 violations, so I do not attribute it to this unit.

## Limits

- **The lab evidence names another head.** The implementer's `lab-1.log` (tv-dator, 256 files 203/53) was measured
  at `placement-head=ae90b7873`, not 73fa63298. Six files differ between them: phase-failure, founder-open comment,
  phase-one, five-node, inventory, seal. By R22 that claim names a different head.
  - My local runs at 73fa63298 cover every changed test file plus a sample of fixture consumers.
  - I did not re-run the other 34 DIR integration files. The lab log for them is from a head whose helper is
    byte-identical to 73fa63298's, and it has zero DIR hits.
- **Local runs on a shared, contended machine.** The thermal gate held several times. Durations are indicative only.
- **Out of scope (R17), for the owner:** `initializeOriginalSeedAttempt` dereferences a null `dataDirectoryManager`
  (`src/bootstrap/seed-original-allocation-startup.js:49`) and throws an untyped TypeError instead of a typed
  refusal (R07/R11). That TypeError is what the RC1 tests hit.
