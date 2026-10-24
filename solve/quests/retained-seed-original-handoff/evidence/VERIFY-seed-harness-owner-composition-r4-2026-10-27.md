---
audience: development
documentClass: evidence
---

# VERIFY: seed-harness-owner-composition round 4 (bdd53ab33)

## Verdict: REQUIRED CHANGES (one exact, small; everything else may be kept as is)

Composing bdd53ab33 is otherwise sound: the fixture consumes the production owner in production
order, no src changed, every touched file I ran reports the truthful hold or is green, the mutation
discriminates, RC1/RC2 and (a)(b)(c) from round 3 are closed. The one required change is a residual
of exactly the class this unit exists to remove, that the lab's reason-string classification could
not see.

### RC-A. Two untouched `test/bootstrap/` characterizations still hand-compose `bootstrap()` and are red on the DATADIR harness defect, misreported as "red for non-O reasons"

- `test/bootstrap/join-lifecycle-sub-phase-parity-characterization.test.js:157,228` and
  `test/bootstrap/phase-event-ordering-characterization.test.js:102,173` (8 constructions, 10
  `bootstrap()` calls between them) build `new BootstrapService({bootIncarnation, nodeId, nodeAddress,
  wsPort})` with no data-directory manager and call `bootstrap()` under a `SILENT_LOGGER`.
- I probed the exact composition (`verify-r4/characterization-probe.mjs`, mirrors their stubs) at both
  commits: `{success:false, phase:'not_started', error:"Cannot read properties of null (reading
  'getDataDir')"}` from `initializeOriginalSeedAttempt` at `src/bootstrap/seed-original-allocation-startup.js:49`
  via `bootstrap-service-seed-workflow.js:490`, identically at 5cfabc308 and bdd53ab33
  (`verify-r4/logs/characterization-probe.out`).
- That is the DATADIR class RC1 removed from bootstrap-sequence in this round; it is not "non-O". The
  silent logger keeps the reason out of every TAP/lab log, so `classify-lab3.tsv` rows
  `before=RED/ lab3=` (empty) are a blind spot of file-level reason-string classification, and the
  commit message's implicit "no DATADIR remain" is a log fact, not a tree fact.
- **Fix (same shape as RC1):** `await createVirginSeedBootstrapService({...})` in place of
  `new BootstrapService({...})` at the 8 sites (the surrounding tests become `async (t)` where they
  are not), plus the two stubs the registration step needs since e29e46abf
  (`bootstrap.acquireReplicaHandler = () => {}`;
  `bootstrap.seedRuntimeBridgeOwner.acquireSqlQueryEngine = () => null`) wherever the pipeline runs,
  exactly as bootstrap-sequence.test.js:457-461 does. They then stop at O3 via
  `completeSuccessfulBootstrap` → `assertOriginalSeedContinuation`, the honest class. Alternatively,
  name them in the commit message and the classification as residual DATADIR harness reds left for
  the owner; the lab table must stop calling them "non-O".
- Related, recommended not required: `test/bootstrap/return-value-completeness.property.test.js:132,188,241`
  hand-composes 10 `bootstrap()` runs and skips `!result.success` (:154,:429); every run hits the
  same DATADIR TypeError today, so the property is vacuously green (R19). Not in the lab's 256 files.

## Identity

- **Subject:** `bdd53ab3361acd5c3b1cc803216ab229257ef111` (parent `5cfabc308`), branch
  `work/seed-harness-owner-composition-20261025`, pushed (`git ls-remote origin` = bdd53ab33).
  Round 3 was `73fa63298` (reflog `HEAD@{1}` of the implementer's worktree; amend chain
  ae90b7873 → e3263abdd → 73fa63298 → bdd53ab33). r3→r4 diff: 10 files, +156/−163.
- **No src change:** `git diff 5cfabc308 bdd53ab33 --stat -- src` is empty. 21 files changed
  (+710/−502): 17 test files, 2 ratchet scripts, 2 generated (inventory.json, subsystem-classes.json,
  impact-graph-seal.json).
- **Verifier:** independent; I did not write the unit. Nothing in `/mnt/data/peter/projects/lagrange`
  or the implementer's worktree was touched. I ran in detached scratch worktrees under the scratchpad
  (`wt/r4` = bdd53ab33, `wt/base` = 5cfabc308, `wt/mut` = bdd53ab33 + one reverted mutation,
  `wt/lineage` = origin's lineage head), `node_modules` symlinked from the primary checkout; all four
  removed at the end. Heavy runs gated on `scripts/checks/wait-for-thermal-headroom.js`, one at a
  time.

## Per-claim table

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| RC1 | bootstrap-sequence :418/:513 use `await createVirginSeedBootstrapService` | holds | r4 `test/bootstrap/bootstrap-sequence.test.js:423,523`; every `.bootstrap()` call in the file (:369,:498,:576,:624,:653,:690) is on a fixture-built service; the 11 remaining `new BootstrapService` sites never call `bootstrap()` |
| RC1 | the two added stubs are needed because `seed-startup-plan.js:41-43` calls them directly since e29e46abf | holds | `src/bootstrap/pipeline/seed-startup-plan.js:42-43`; `git log -S` names e29e46abf as the only commit adding both. Probe without the `acquireReplicaHandler` stub: `error:"System table cache not available"` from `acquireReplicaHandler` (replica-registration-methods.js:137) at plan.js:43 — a harness artifact, so the stub is what keeps the test on the hold |
| RC1 | stubs owner-shaped vs hand-copies | judged acceptable | They are no-op method replacements that record order (`order.push('replica-handler')`) / return a value nothing consumes (`() => null`, since `registration()` and the cohort release are themselves stubbed). They restate no owner answer shape (fixtures.md rule 1 is about owner-shaped values); they match the pre-existing all-stubbed style of these two tests. Not a builder consumption, but nothing here is a second version of owner logic |
| RC1 | they now stop at O3 via completeSuccessfulBootstrap | holds (probed) | `verify-r4/logs/rc1-probe.out`: both `{phase:'cache_hydration', error:'original-handoff-continuation-unavailable', code:'ORIGINAL_ALLOCATION_HOLD'}`, stack `startup.js:111 ← runtime-methods.js:63 ← bootstrap-service-seed-workflow.js:217 (completeSuccessfulBootstrap)`; owner held before `bootstrap()`, released after `shutdown()` |
| RC1 | file 31/42, 17 × CONT, no DATADIR | holds with a correction | my run: `# { total: 42, pass: 31, fail: 11 }`, 17 not-ok leaf lines, CONT string hits 9 (same 9 in the lab block: most of these tests silence the logger, so "17" is the not-ok leaf count, not CONT hits); DIR 0, AUTH 0, DATADIR 0, O4 0. Every red top-level subtest's first failing leaf is "bootstrap should succeed" (or the "without wsPort" error-text leaf, which shows CONT) |
| RC2+(a) | `acquireSeedStartupAuthority` reads in production order and returns the full decision | holds, with divergences stated below | r4 `cluster-test-helpers.js:288-317`: owner (:289-290) → `resolveAutoRejoinStartupDecision` (:293-298) → `readSeedStartupStorageAdmission` (:299-302); production: `lagrange-runtime-startup.js:719` → `resolveStartupJoinDecision` :743 (→ `entrypoint-runtime-join-decision.js:400` `resolveAutoRejoinStartupDecision`) → `startSeedNode` :413 admission → :422 `new BootstrapService` → :437 ledger defers shutdown → :438 `prepareOriginalSeedAttempt`. `startupDecision` is the auto-rejoin owner's full decision object (`rejoin-hints.js:501-509` attaches `membershipOwnerOutcome`), null only when the caller supplied the outcome |
| (a) | `bindVirginSeedStartupCustody` releases/removes only after successful shutdown | holds | :257-267: no try/finally any more; `release()` and `rmSync` run only after `await shutdown()` resolves, so a failed shutdown retains both (matches `bindDataDirectoryProcessOwner` :76-86 and `requiresSuccessfulCleanup: true` at startup.js:721-723). r3→r4 diff shows the `finally { rmSync }` removed |
| (a) | `seedStartupAuthorityOf` WeakMap read-back | holds | :270 `new WeakMap()`, :366 `set(bootstrap, authority)`, :376-378 getter; consumers: `seed-release-failure-custody-fixture.js` (`host.retained` from the read-back) |
| (a) | de-exports/deletion; no remaining importer | holds | `createVirginSeedDataDirectoryManager`, `bindVirginSeedStartupCustody` module-local (:230,:257); `acquireVirginSeedStartupAuthority` deleted (r3→r4 diff); tree-wide grep (js/mjs/json/md, no node_modules) finds no importer; only two evidence .md files mention the old names as history. eslint clean |
| (b) | `_buildPhaseExecutionDelegates` removed from every touched file | holds (touched files) | grep: remaining consumers are three untouched files (`seed-phase-continuation-fixture.js:17`, `replica-lifecycle-durable-generation.test.js:1400`, `managed-split-admission-reliability…:450`) — recorded as a finding, out of scope |
| (b) | seed-infrastructure-phase drives `ownedSeedInfrastructurePhase(service, {...})` | holds | r4 :76-85 returns `service.seedInfrastructurePhase` (the owner's own instance with composed delegates); inputs supplied at the service methods the delegates forward to (`logger`, `getLeaderMessageGroupService`, `resolveQueryTransportMessageGroupSelection` = `bootstrap-service-seed-delegates.js:87,112,116`); the fake `MessageRouterSetup.create` calls `options.retainRouter(router)` (the setup owner's seam). Green 2/2 |
| (b) | runtime-identity records through the owner's setNodeId/setNodeAddress delegates | holds | r4 :39-66 wraps `phase.delegates.setNodeId/setNodeAddress` and forwards each call; green 3/3 |
| (b) | mutation: drop the phase's setter calls → A1c and MUTATION red | **reproduced** | `wt/mut`: `seed-infrastructure-phase.js:165,177,178` replaced by `void` expressions; run: `not ok 1 - A1c … phase A ends with runtime A's identity expected 'node-A' actual: ~`, `not ok 2 - MUTATION …` likewise, test 3 ok (`verify-r4/logs/MUT-seed-infrastructure-runtime-identity.tap`); restored with `git checkout -- src`, tree clean |
| (c) | custody fixture `restartRetainedSeed` consumes `createRetainedSeedBootstrapService`; hand composition and imports removed | holds | diff: `BootstrapService`, `resolveAutoRejoinStartupDecision`, `readSeedStartupStorageAdmission` imports removed; `restartRetainedSeed` :226-240 builds the replacement through the fixture with `dataDirectoryProcessOwner: host.directoryOwner`, reads `host.retained` back from `seedStartupAuthorityOf`; `closeFixture` releases the owner only after a failure-free close (:279-283) and removes the directory last (:291) |
| sim host | built by `createVirginSeedBootstrapService`; constructor throw releases the owner | holds | `formation-sim-production-seed-host.js:338-345` (no hand-written admission; the `DURABLE_EVIDENCE_STATE` import is gone); the only `new BootstrapService` on this path is the fixture's, wrapped in try/catch that releases `authority.acquiredOwner` (`cluster-test-helpers.js:347-363`); `prepareOriginalSeedAttempt` awaited before phase one (:549); teardown `bootstrap.shutdown()` :515 triggers the fixture's release, the host removes its own `dataDir` :526 afterwards (supplied dir ⇒ `ownsDataDir` false) |
| founder-open | restores `reopened.messageGroupServices.has(REPLICA_ID) === false`; reachable today? | holds; **unreachable today** | :106 is after `assert.rejects(laterSeedStart(...).then(...))`; `laterSeedStart` throws the CLASS hold inside `prepareOriginalSeedAttempt` before `.then` sets `reopened`, and the validator's `error.consensus?.reason === RESEED_REQUIRED` fails first: my run `error: refused at open, not ORIGINAL_ALLOCATION_HOLD: original-retained-history-classification-unavailable`. When the classification hold lifts and the phase refuses at open, `reopened` is set, so the assertion becomes measurable; until then it is unmeasured by construction, as the comment says |
| checks | eslint / node --check | holds | 18 changed .js files: `node --check` all pass; `npx eslint` rc 0, no output (`verify-r4/logs/eslint.txt`) |
| checks | duplication src 46/1439, test 688/26126 | holds | `npm run -s test:duplication` at bdd53ab33: `[src+scripts] OK: 46/46 clone group(s), 1439/1439 duplicated line(s)`; `[test] OK: 688/688, 26126/26126` (`duplication.txt`); no tightening hint printed |
| checks | unused exports 1413 | holds | `npm run -s test:unused:ratchet` at bdd53ab33: `Unused-export ratchet OK: 1413/1413 unused export(s) across 334 file(s)` (`unused.txt`); no tightening hint. Note the lineage head carries 1411 (Finding 5) |
| checks | cycles 0 | holds | `npm run -s test:cycles` at bdd53ab33: `Circular dependency ratchet OK: 0/0 cycle group(s)` (`cycles.txt`) |
| checks | metadata zero drift | holds | `npm run -s test:metadata:refresh` at bdd53ab33 (2473 tests; `snapshotDigest f03f34b1…` = the committed `impact-graph-seal.json`), then `git status --short`: 0 tracked changes (`metadata-drift.txt`) |
| checks | hook replay reproduces the tree | holds (one environment re-stamp) | `wt/mut`: `git reset --soft 5cfabc308` (21 staged files) then `.githooks/pre-commit`: rc 0 in 201 s; scoped complexity ratchet 0 violations; `git diff --cached --stat bdd53ab33` afterwards shows only `solve/changes/global-owner-debt-inventory/inventory.json | 8 ++++----` (4 lines; the full-tree owner-debt refresh's report digests, the same shape round 1 saw; its "ratchet exceeded in check-complexity.js" line is that full-tree refresh, not this unit). Every other file byte-identical. Restored with `git reset --hard bdd53ab33` (`pre-commit-replay.txt`) |
| lab | tv-dator at bdd53ab33, base 5cfabc308, 256 files 205/51 | holds | `lab-3.log:3,11` `placement-head=bdd53ab33…`, `base:5cfabc308…`; last line `total=256 pass=205 fail=51` |
| lab | classification audit | see Findings 1-3 | 51 red files parsed (`verify-r4-lab-audit.tsv`): 47 first-reason CONT, 1 CLASS (founder-open), 2 no reason (the characterizations: DATADIR hidden), 1 no reason (replica-handler-metadata-propagation: non-O, confirmed at base), three-node: lab block elided (307,490 bytes) — CONT at head by my run; DIR/AUTH/O4/DATADIR/IDENT string hits in red files: 0 |
| merge | dry-run onto the lineage head | 2 conflicts, both ratchet constants | see Findings 5 |

## Findings

1. **Classification is file-level and log-bound; three rows are wrong, none in the unit's favour except one.**
   The implementer admits file-level classification. I parsed each red file's output block and took
   the first reason string: 47/51 CONT, and in every sampled CONT file (13: epoch-manager-lifecycle,
   bootstrap-sequence, websocket-server-reentry, current-epoch-propagation, admin-cdc-propagation,
   control-plane-rebalance, critical-partition-learner-safety, membership-consistency,
   preflight-critical-path-hops, seed-release-failure-custody, failure-scenarios, production-handoff,
   node-join-replica-activation) the two CONT log lines ("Bootstrap phase failed" at
   `seed-partitions-phase.js:388`, "Bootstrap failed") precede the first `not ok` leaf
   ("bootstrap should succeed"), and every later reason in the file is a null read of a service the
   failed bootstrap never built (`cdcIntegrationService.bootstrapMode`, `messageGroupServices.size`,
   `values`, `insertSystemTableRow`, `getRegisteredAddresses`, `storageAccountingService`). The three
   wrong rows: (i) the two characterizations are DATADIR, not "non-O" (RC-A); (ii) three-node-seed-
   rebalance is CONT at head (my run: `not ok 1 - seed bootstrap should succeed`, CONT ×2, DIR 0; at
   base DIR ×1), its lab block lost the reason to the runner's 64 KiB head/tail excerpt
   (`run-test-files.js:66`, marker at block line 155). `replica-handler-metadata-propagation` is
   confirmed non-O at both commits ("Fresh replica release authority unavailable", a replica-handler
   path with no seed bootstrap).
2. **seed-node-bootstrap's `cdcService` null error is a consequence of the hold, owned by the test file.**
   Each subtest's `t.equal(result.success, true, 'bootstrap should succeed')` fails at O3 (log at
   `seed-partitions-phase.js:388`, the PARTITIONS step), the test keeps going, and :122-127 reads
   `bootstrapService.cdcIntegrationService` which the REGISTRATION step would have built
   (`seed-startup-plan.js:39 ensureBootstrapCdcIntegrationService`, after PARTITIONS). Not a harness
   composition defect, not a src defect: the test does not stop at its first failure. Same shape in the
   other CONT files' later leaves.
3. **No DIR/AUTH/O4/DATADIR/IDENT by reason string in any of the 51 red files** (`verify-r4-lab-audit.tsv`),
   and in my 15 local runs at bdd53ab33 (summary.txt): DIR 0, AUTH 0, O4 0, IDENT 0, DATADIR 0 by
   string. The DATADIR class survives only where a silent logger hides it (RC-A), which is why I probed.
4. **Divergences of `acquireSeedStartupAuthority` from production** (to state, not to fix here):
   production's `resolveStartupJoinDecision` passes `probePeerAddress`, `expectedClusterId`
   (`readPersistedLocalClusterId(dataDir)`) and `forceNewCluster` into the auto-rejoin owner
   (`entrypoint-runtime-join-decision.js:400-408`) and throws on `mode === FAIL` (:443-445); the fixture
   passes only `{dataDir, nodeId, nodeAddress}` and never inspects `mode`. On a virgin directory these
   coincide (expectedClusterId null, forceNewCluster false, no peers); on a retained directory
   (`createRetainedSeedBootstrapService`) the persisted cluster-id check is skipped and a FAIL decision
   would flow into `membershipOwnerOutcome` unrefused. Also pre-existing and unchanged: no
   `reserveBootIncarnation` (fixture takes `bootIncarnation ?? 1`), no `resolveLocalClusterIncarnationFence`,
   no `logBootProvenance`. The three reads the unit claims are in production order.
5. **Dry-run merge onto the lineage** (fetched `work/mg-delivery-resume-r2-20261023` = `1cb0e13eb`, 58
   commits past the merge-base 5cfabc308; c70285ce7 is behind it): two content conflicts, both ratchet
   constants — `scripts/check-duplication.js` (lineage 658/24752 vs unit 688/26126) and
   `scripts/check-unused-exports.js` (lineage 1411 vs unit 1413). Resolution is to keep the lineage's
   tighter values and re-measure on the merged tree (one-way ratchets). Everything else auto-merged:
   none of the 17 touched test files changed on the lineage since the merge-base (`git log
   5cfabc308..1cb0e13eb -- <files>` empty), nor did `seed-original-allocation-startup.js`,
   `lagrange-runtime-startup.js`, the seed workflow or the plan; the O3 throw at `startup.js:111` is
   still unconditional on the lineage. Merge aborted; worktree left clean.
6. **One-version check with the fresh-seed Quest witness on the lineage.** `test/bootstrap/
   fresh-seed-activation.integration.test.js` composes its engaged negatives through
   `createVirginSeedBootstrapService` (:261-263) with an explicitly acquired `dataDirectoryProcessOwner`
   (:259) and its own `t.after` release (:264-269); `test/test-helpers/fresh-seed-activation-public-child.js`
   uses `startLagrangeRuntime` (:162), i.e. production. With bdd53ab33's fixture an explicitly supplied
   owner is honoured (`Object.hasOwn`, :289), not re-acquired, and a supplied `dataDir` is not removed
   (`ownsDataDir` false), so the witness keeps one owner and its own release. No second composition of
   BootstrapService is introduced on the merged tree; the witness's exports (`cleanupTestEnvironment`,
   `createVirginSeedBootstrapService`, `initializeTestEnvironment`) all still exist at bdd53ab33. Neither
   file exists on the unit branch (lineage-only), so the merge adds them without overlap.
7. **Minor, not required.** (i) founder-open-refusal registers `t.after(rmSync(dataDir))` (:82) before
   `laterSeedStart` registers `t.after(service.shutdown())`; node:test runs after-hooks in registration
   order (checked, `verify-r4/after-order.test.mjs`), so the directory is removed while the retained
   seed's owner still holds its lock file; harmless on Linux, but production never deletes under a held
   owner. (ii) `BootstrapService.bootstrapOrExit` is correctly kept: caller
   `join-resume-replica-lifecycle-owner.test.js:861`, reference `architecture/bootstrap.md:51`.
   (iii) The `_buildPhaseExecutionDelegates` reach-through survives in three untouched files (above).

## What I ran (logs under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/seedharness/verify-r4/logs/`)

- Runner-equivalent single-file runs (`run.sh`: `--import=@tapjs/mock/import --enable-source-maps
  --no-compilation-cache --max-old-space-size=512`, one at a time, thermal-gated), `summary.txt`:
  - at bdd53ab33: bootstrap-sequence (31/42, 17 not-ok leaves, CONT 9, DATADIR 0);
    seed-infrastructure-phase 2/2; seed-infrastructure-runtime-identity 3/3; founder-open-refusal 0/1
    CLASS; formation-sim phase-one 8/8; five-node 3/3; core-system-logic-runtime-witness 2/3 (test 3 CONT);
    seed-release-failure-custody 0/1 CONT (O3 at tap:2-3 precedes the leaf's "ENABLE was delivered"
    message at :12); join-lifecycle characterization 74/81; phase-event-ordering characterization
    141/163; replica-handler-metadata-propagation 8/11; three-node-seed-rebalance 2/10 CONT.
  - at 5cfabc308: seed-release-failure-custody DIR; three-node-seed-rebalance DIR; the two
    characterizations identical leaf counts (74/81, 141/163) with no reason string;
    replica-handler-metadata-propagation identical (non-O).
  - mutation (`wt/mut`): runtime-identity 1/3 (A1c, MUTATION red); restored.
- Probes: `rc1-probe.mjs` (result.error for :418/:513 and the no-stub discriminator);
  `characterization-probe.mjs` at both commits.
- Lab audit: `verify-r4-lab-audit.awk` → `verify-r4-lab-audit.tsv` (per red file, ordered
  leaf/reason tokens); extracted blocks `verify-r4-lab-*.txt`.
- Static: eslint + node --check (`eslint.txt`); duplication (`duplication.txt`); unused exports
  (`unused.txt`); cycles (`cycles.txt`); metadata refresh + `git status` (`metadata-drift.txt`);
  hook replay (`pre-commit-replay.txt`).
- Merge: `verify-r4-merge.log` (in `seedharness/`), then `git merge --abort`.

## Limits

- Of the 51 lab reds I re-ran 7 locally plus 2 probes; the other 44 CONT classifications rest on the
  lab log's reason strings and my ordered-token audit, not on my own runs. Three lab blocks were
  elided by the runner's excerpt cap; two of them still show CONT in the surviving head, the third
  (three-node) I re-ran.
- Local runs are on a shared, contended machine; durations are indicative only. The lab head and
  base SHAs are as the log states; I did not re-run on tv-dator.
- The merged tree (lineage + unit) was not test-run; conflicts were inspected and the merge aborted.
- The fresh-seed witness on the lineage was read, not run (it is the Quest's own red-by-design witness).
