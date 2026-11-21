# Re-check: CDC plan stamp corrective round (873570c54)

Independent, read-only re-check. No test was executed by the verifier; lab
outputs were read as files. File:line references are at
`873570c54b7a32c779a061a50ca4f3fd52b853ff` unless stated.

| Item | Value |
| --- | --- |
| Subject | `work/cdc-currentness-stamp-20261121` = 873570c54 (VERIFIED by `rev-parse`): f150ae13f (witnesses, no `src/` change) then 873570c54 (repair), on 82295c47e |
| Predecessor | `reports/verify-cdc-plan-stamp.md` (APPROVE-WITH-CONDITIONS at 82295c47e) |
| Method | `git show` / `git diff` / `git grep` at the sha; lab files under `lab/cdcstamp-*` |
| Labels | **VERIFIED** = read in source at the sha or in a lab file. **INFERRED** = reasoning, not executed or not fully traced |

## Verdict

**APPROVE-WITH-CONDITIONS** for merging 873570c54 into the integration line.
None of the conditions blocks the merge.

No stale-positive hole was found. Each of the four removed stamp components is
confirmed immovable independently of a component that remains. The
before/after comparison is correct, and the predecessor's conditions C1
(required versions) and C2 (paired timeout run) are met.

| # | Condition | Blocking? |
| --- | --- | --- |
| K1 | Wiring validates that each version method exists, not what it returns. The `isOwnerVersion` guard was removed, so a non-version answer is compared as an equal constant (finding 5). Add a value check or record it as named debt. | No; not reachable in production |
| K2 | The structural table-list case has no red evidence: the mutant `0dcbc4d36` was never executed (finding 8). Run it. | No |
| K3 | `cdc-group-propagation-foreground-boundary` case 1 is red at both commits under this selection on adam-laptop. It is pre-existing, but it is a standing red that needs an owner; "load-dependent" is still INFERRED (finding 9). | No |

## Findings

### 1. Removed: configuration identity. No hole (VERIFIED)

- `this.config` is assigned once, `cdc-group-propagation-service.js:51`. A grep
  of `src/` for any write of `.config` on the service finds no other.
- `initialize` builds its wiring from `config: this.config` (:114-116) and
  accepts no `options.config`. A second `initialize` cannot change it.
- `ConfigurationManager.resetInstance` (`configuration-manager.js:141-143`)
  makes a new singleton that the service never adopts; the instance it holds
  keeps its own monotonic revision (:115, :190, :332, :387). The tree is
  assigned only at :108, so no reset path repeats a revision.
- Test-only: `partition-cdc-currentness-stamp-witness.test.js:892` replaces
  `service.config` before `initialize`, for the refusal case.

### 2. Removed: `router.deliver`. No hole (VERIFIED)

- The build reads only `typeof messageRouter.deliver === 'function'`
  (`cdc-group-propagation-routing.js:688-693`). Replacing `deliver` with
  another function would not change the plan at all.
- `deliver` is a prototype method installed at module load
  (`message-router-delivery-delegation.js:61, 338-349`; `message-router.js:349`).
- `src/`-wide grep for `.deliver =`, `Object.assign(router…)`,
  `router[name] =` and wrap/instrument/patch calls on a router: the only hit is
  `wasm-service/wasm-writer-client.js:64`, which is not a router.
- INFERRED: both production callers pass a `MessageRouter` instance
  (`node-joining-publication-activation.js:686`,
  `seed-runtime-bridge-owner.js:166`); the getters were not traced.

### 3. Removed: `propagationMode`. No hole (VERIFIED)

- Writers: the constructor (service.js:52) and `refreshConfig` (:234, :246).
  No other in `src/`.
- The build overwrites the field on entry (`durable-plan.js:32-33`) from
  `config.get` (service.js:231). The plan is therefore a function of the
  configuration tree, never of the field's earlier value.
- The premise "the stamp is taken after the build" no longer describes the
  code. The stamp is taken before the build (`durable-plan.js:63`), re-read
  after it (:71), and the entry stamp is what is stored (:72). The build is
  synchronous and `refreshConfig` only reads the configuration, so the mode
  the build used is the mode the stored revision implies.

### 4. Removed: `source.groupId`. No hole (VERIFIED)

- Plans are held in a `WeakMap` keyed by the source object (service.js:68;
  `durable-plan.js:64, 72`).
- The source is the `MessageGroupService` in both production callers
  (`node-joining-publication-activation.js:721`,
  `seed-runtime-bridge-owner.js:214`), and reaches the plan only as
  `wave.source` (`durable-delivery.js:275`).
- `groupId` is assigned only in the constructor
  (`message-group-service-state.js:209`).

### 5. Version values are not validated (finding for K1)

- `requireCapabilities` checks `typeof value?.[capability] === 'function'`
  (`cdc-group-propagation-collaborators.js:42-46`).
- `sameStamp` compares with `Object.is` (`durable-plan.js:57-60`). A wired
  collaborator whose version method answers `undefined`, `NaN` or a constant
  gives a permanently equal stamp: the held plan survives every change.
- At 82295c47e, `isOwnerVersion` made such a stamp unknown and always rebuilt.
  That guard was removed in this round.
- Not reachable in production (VERIFIED): the cache answers an integer
  (`system-table-cache-observation-methods.js:172-175`; the read-only wrapper
  delegates, `read-only-system-table-cache.js:116-117`), as do the tree
  (`latency-tree-service.js:44, 171, 216-218`) and the configuration
  (`configuration-manager.js:115-125`).
- The test double `createStatedRoutingTree` answers a constant 0 over a frozen
  order (`cdc-group-propagation-service-harness.js:72-80`), which is sound.

### 6. Wiring validation and re-wiring (VERIFIED)

- Complete for the three version sources and each read surface
  (collaborators.js:21-27): cache `get`, `getAll`, `filter`,
  `getTableMutationVersion`; tree `getRoutingOrder`, `getRoutingGeneration`;
  configuration `get`, `getRevision`. These match the routing module's reads.
- Validated before anything is taken (service.js:114-139). A refused wiring
  leaves the service as it was.
- Held plans are not dropped on re-wiring: `initialize` does not clear the
  map. This is safe because every field `initialize` can change (cache, tree,
  router, nodeId) is in the stamp (`durable-plan.js:52`). There is one entry
  per source, so an A/B/A re-wiring cannot resurrect a plan.
- Use before `initialize`: `propagateCDCEvent` refuses in CREATED
  (service.js:181, 360-365), and both plan entry points sit behind it
  (`durable-delivery.js:281, 288`; `cdc-propagation-progress.js:174`).
- Gap, safe direction: `stop()` (service.js:167-171) moves CREATED to STOPPED,
  after which `start()` passes `ensureInitialized` and runs with the
  constructor's unvalidated collaborators. The outcome is an untyped
  `TypeError` in `planStampOf`, not a stale positive. Production always calls
  `initialize` right after construction (`latency-topology-setup.js:97-109`).

### 7. The before/after comparison (VERIFIED)

- Correct (`durable-plan.js:62-77`): every versioned component is monotonic,
  so equal entry and exit stamps prove no write landed during the build.
- The not-held plan is safe to return. `observePlan` pins by object identity
  (`cdc-propagation-progress.js:158-163`); the next call builds a new object,
  so the refresh runs again. The wave uses the plan once, as the base did
  (`durable-delivery.js:281-292`).
- The `else` branch is unreachable today: the build makes no foreign call.

### 8. One table list (VERIFIED, with limits)

- `routing.js` no longer imports `TABLES` (:1) and every table read names
  `PLAN_TABLE.*`; the stamp iterates the same object (`durable-plan.js:24`).
- The structural case (test :1093-1132) wraps a real `SystemTableCache` in a
  recording proxy, wires a real tree, and runs a real `propagationPlanAtStamp`
  in SAFE and in GROUPED mode.
- Limits: it sees only the branches its fixture rows reach (INFERRED: the
  fallbacks at routing.js:629-646 may not run). It has no red run.
- Optional probes remain in `routing.js` (:47, :147, :198, :237, :420), so
  "never probed" (`durable-plan.js:14-15`) holds for the stamp only.

### 9. Lab evidence (VERIFIED from files)

| Run | Sha in `selection.json` | Result |
| --- | --- | --- |
| `cdcstamp-c1-red` | f150ae13f | witness file, 67 tests, 62 pass, 5 fail: selection bounds 2 and 4; 59 cache refusal and 60 tree refusal ("Missing expected exception"); 62 moved-during-build (expected 2, actual 1) |
| `cdcstamp-c2` | 873570c54 | 28 files, 26 pass. Witness 69 tests, fails are exactly 2 and 4. Foreground-boundary case 1: `testTimeoutFailure`, 6101 ms against 6000 |
| `cdcstamp-mutant-tree-generation` | 24e8185e5 (parent 873570c54, drops `getRoutingGeneration()` from the stamp) | 66 of 69; killed by case 64, the tree routing generation (order `[a, b]` kept) |
| `cdcstamp-mutant-router-identity` | 1fddbf46b (parent 873570c54, drops `owner.messageRouter`) | 66 of 69; killed by case 67, the router identity (`held_by_subscriber`, not `drained`) |
| `cdcstamp-pair-base` | 8abec5e92 | 24 files, 20 pass. Foreground-boundary case 1: timeout, 6454 ms against 6000 |
| `cdcstamp-pair-head` | 873570c54 | 24 files, 22 pass. Foreground-boundary case 1: timeout, 6981 ms against 6300 |

- The two pair selections differ only in the sha (`diff` of the two files).
  The budget is `scaleByMachineFactor(3000)`, which explains 6000 and 6300.
- The three C1 red cases are textually unchanged between f150ae13f and
  873570c54.
- Base-only failure: `message-group-native-provisional-route` case 1 at
  8abec5e92 (assertion `held_by_subscriber`, 17.6 s). It is green at head in
  both head runs. Unexplained; it does not weigh against the head.

### 10. Proof gaps that remain

- Not red-first: the configuration refusal and the structural case were added
  in 873570c54 (the author's record 20.1 and 20.4 say so).
- Only two stamp components have an executed mutant. For cache identity, tree
  identity, nodeId, the replica suffix, the configuration revision and the
  table versions, a case exists and its discrimination is INFERRED from
  reading.

## Author claims checked

| Claim (record section 20) | Result |
| --- | --- |
| The four removal arguments (20.3) | Confirmed, findings 1-4 |
| "No optional call remains in the stamp" (20.1) | Confirmed for `durable-plan.js`; `routing.js` still probes |
| C1 reds and C2 counts (20.1, 20.5) | Confirmed |
| Both mutants killed only by their named case (20.8) | Confirmed |
| Timeout pre-existing (20.6) | Confirmed. "Load-dependent" is INFERRED |
| Third mutant not executed (20.8) | Confirmed as stated; see K2 |
