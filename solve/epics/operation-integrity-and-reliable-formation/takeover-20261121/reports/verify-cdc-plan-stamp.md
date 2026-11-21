# Verification: CDC plan stamp (82295c47e)

Independent, read-only verification. No test was executed by the verifier; lab
outputs were read as files. All file:line references are at
`82295c47e5bc3825dcb301c20536decc8e1509c3` unless stated.

| Item | Value |
| --- | --- |
| Subject | `work/cdc-currentness-stamp-20261121`: 29f2fab7f, 8abec5e92, 82295c47e on base 23344cddc |
| Commit chain | VERIFIED linear: 82295c47e -> 8abec5e92 -> 29f2fab7f -> 23344cddc. 29f2fab7f and 8abec5e92 change no hand-written `src/` |
| Method | source read through `git show`/`git grep`; lab files under `lab/cdcstamp-*` |
| Labels | **VERIFIED** = read in source at the sha, or read in a lab output file. **INFERRED** = my reasoning, not executed or not fully traced |

## Verdict

**APPROVE-WITH-CONDITIONS** for merging 82295c47e into the integration line.

No stale-positive hole was found. Every input the plan build reads is covered
by a stamp component, every writer of each versioned input advances its
version, the build makes no call that can drive raft or apply into the cache,
and a missing version is represented as "unknown" and can never be compared as
a constant. The conditions concern a second path kept alive for test doubles,
one unpaired timeout classification, and proof gaps that leave parts of the
stamp undefended against a later edit.

### Conditions

| # | Condition | Blocking? |
| --- | --- | --- |
| C1 | The versions are read through optional calls (`config?.getRevision?.()`, `tree?.getRoutingGeneration?.()`, `cache?.getTableMutationVersion?.()`, `owner.propagationPlansAtStamp?.get/set`). This is a capability probe in another spelling and keeps the pre-repair always-rebuild path alive only for test doubles. Either make the versions required and validated at `initialize` with a typed refusal (finding 6), or the lead records an explicit decision to carry it as named debt. | Needs a lead/owner decision before merge |
| C2 | The `cdc-group-propagation-foreground-boundary` timeout is classified "load-dependent" without a paired run. Run the same 26-file selection on the same host at 8abec5e92 (its `src/` is identical to the base), or repeat the file under that selection at both shas. Until then the classification is INFERRED (finding 8). | Before the claim "no regression" is recorded |
| C3 | Record the proof gaps of finding 7 as follow-up work: the structural case does not tie the list to the code, and five stamp components have no discriminating negative. | Not blocking; must be recorded, not dropped |

## Findings

### 1. Stamp completeness: no uncovered input (VERIFIED)

Derived independently from `captureDurablePropagationPlan`
(`src/topology/cdc-group-propagation-durable-plan.js:32-49`) and everything it
calls in `src/topology/cdc-group-propagation-routing.js` (whole file read).

| Input the build reads | Where | Stamp component | Writer coverage |
| --- | --- | --- | --- |
| config `latency.propagationMode` | `cdc-group-propagation-service.js:224-245` via `owner.config.get` | config identity + `getRevision()` | VERIFIED: the store is written only by `applyOverrides` (`configuration-manager.js:330-334`), `setByPath` (:374-388) and `initialize`'s node id (:188-191). `git grep` over `src` finds no other assignment into the store; `dynamic-config-startup-wiring.js:225-237` uses `setByPath`. `deepMerge` copies scalars |
| `owner.propagationMode` | durable-plan.js:34 | plain value | written only by `refreshConfig` (service.js:228,240) |
| `owner.nodeId`, `owner.messageGroupReplicaSuffix`, `source.groupId` | durable-plan.js:35,43-47; routing.js:97-107,330,404,523,545,716 | plain values | compared with `Object.is` |
| rows of SERVICES, NODES, LATENCY_GROUPS, MESSAGE_GROUPS | routing.js:49,146,197,202,224,239,278,303,375-395,404,499,504,523,583,631-645,716 | four table versions + cache identity | see below |
| tree routing order | routing.js:419 -> `latency-tree-service.js:199-208` | tree identity + `getRoutingGeneration()` | VERIFIED: `sourceViews` is assigned only in the constructor (:41) and `recompute` (:170); the generation is advanced on the next line (:171) with no call between |
| `typeof messageRouter.deliver` (grouped mode) | routing.js:687-689 | router identity + `router.deliver` identity | n/a |

No other input exists: the build reads no other table, no clock (the only
`now()` is the diagnostics timestamp in `setPublicationMode`, service.js:300),
no environment, no module-level mutable state, no router liveness, quarantine
or pressure (pressure is read per delivery, `durable-delivery.js:134`), no
message-group registry and no raft state. `localeCompare` (routing.js:72,336,
341,456,471) depends on the process locale, constant for the process.

Cache writers (VERIFIED, `git grep` for every write of the row store in
`src/cache`):

- `applySystemTableChange`: every branch that writes the table sets
  `recordForNotification`, and `recordTableMutation` runs for it
  (`system-table-cache.js:356-357, 367/393, 399-450, 486-496, 509-511`). The
  stale-backfill branches write only when `applied` is true
  (`system-table-cache-row-merge.js:365-377, 449-462`) and then set it too.
  Authoritative reconciliation and lifecycle upserts are modes of this one
  method (:403-447).
- Authoritative-absence sweep: delete at
  `system-table-cache-authoritative-absence-sweep.js:139`, version at :152.
- `clear()`: advances every table (:572-578).
- Row previews write a separate copy (`system-table-cache-row-preview.js:37-39`).
- Between each table write and its version bump there is only a
  `logger.debug` and a clock read; no listener runs before the bump.

In-place mutation without a bump: **the author's stated reason is wrong, the
conclusion holds.** The record (5.3) says "Readers get clones, so they cannot
mutate rows in place". In fact `filter`, `getAll` and `getShared` return the
stored row itself, deep-frozen in place
(`system-table-cache-observation-methods.js:452-489`, `readView` :469-472);
only `get` and `find` clone. A row the plan has read is therefore frozen, and
an in-place write would throw. Residual (INFERRED, no instance found): `find`
and `filter` hand the live, possibly not yet frozen row to the caller's
predicate (:461, :478); a predicate that mutated a row would change content
without a version. The plan's own predicates do not mutate.

Identity components mutated in place: the cache's content is versioned; the
tree's views are generation-covered; the config store is revision-covered;
`ReadOnlySystemTableCache._cache` is assigned once
(`read-only-system-table-cache.js:30`). No in-place hole found.

### 2. Stamp taken after the build: no drive can occur inside it (VERIFIED), but the property is not self-enforcing

`propagationPlanAtStamp` (durable-plan.js:84-90) reads the stamp, builds, then
`holdPlan` (:76-82) reads the stamp again and stores it. The build is
synchronous. Its only calls outside the routing module are `config.get`,
`setPublicationMode` (no emit, service.js:293-330), the cache's `get`,
`filter`, `getAll`, the tree's `getRoutingOrder`, and `deepFreeze`. None
reaches the selection, the raft port, or a listener. The selection runs
*after* the plan in `topologyBindingCurrent`
(`partition-cdc-obligation-progress.js:35` then :39-40), as on the base.

Latent hazard, not reachable today: if a later edit adds any foreign call to
the builder, the interleaving is: build reads SERVICES at version N; the
callback applies a row (N+1); the build returns the pre-apply targets;
`holdPlan` stamps N+1; every later check compares N+1 with N+1 and keeps the
stale plan until an unrelated bump. A before/after comparison (hold only when
the stamp read after `refreshConfig` equals the stamp read after the build)
costs fifteen `Object.is` and makes the premise self-enforcing. Recommended,
not blocking.

### 3. One shared frozen plan (VERIFIED)

- Deep freeze: `deepFreeze` (`src/utils/deep-freeze.js`) recurses over own
  keys; the plan is `{targets: [plain objects of scalars], fallbackReason,
  useGrouped, sourceMismatch}`. No map or nested mutable structure.
- No consumer mutates it: `createCdcPropagationProgress` and
  `refreshCdcPropagationRoutes` copy fields into new frozen routes
  (`cdc-propagation-progress.js:17-22,123,135`); `propagationResult` and
  `publicationModeOf` only read (`durable-delivery.js:235-260`).
- No pre-existing consumer used plan identity as a change signal; the plan was
  a local variable. The only identity use is the new `observePlan`.
- The post-success capture never protected debt release. It only updates the
  publication-mode diagnostics when a safe plan has become grouped
  (`durable-delivery.js:287-292`). Release is fenced by `assertCurrent` (:286,
  and inside `progress.result`), which goes through the stamped plan and the
  refresh. Sharing changes nothing there.
- Skipped `refreshConfig` side effect: the only writers of the publication
  mode are `refreshConfig` and the wave (:283, :290). In safe mode both write
  the same value; in grouped mode `refreshConfig` writes only on a transition.
  The author's 15.4 holds.

### 4. Progress revision and the skipped refresh (VERIFIED)

Every write of `progress.targets`, `leaf.route`, `leaf.coverage` and
`progress.sourceCoverage` in `src/cdc`, `src/partition`, `src/topology` and
`src/message-group` is in `cdc-propagation-progress.js`, and each advances the
revision:

| Write | Line | Revision |
| --- | --- | --- |
| provisional discard | :38-48 | :47, unconditional |
| latency transfer replaces `targets` | :112 | returns `changed` -> :140 -> :47 |
| new leaf | :123-125 | `requirementsChanged` -> :140 -> :47 |
| route replaced, provisional leaf reset | :132-136 | `routeReplaced` -> :141, or :140 |
| `observe` source / leaf | :224, :232 | :225, :233 |

`progress.nextLeaf` (:189) is not marked and is not read by the refresh. The
lane's direct `refreshCdcPropagationRoutes` call
(`partition-cdc-obligation-progress.js:104`) marks through the same function.
`branch.coverage` (:37, :122) is a different object.

The skip is sound: the same plan object is returned only while the current
stamp equals that plan's stamp, so the cache, `nodeId` and suffix the latency
transfer reads (:55-69) are unchanged; with an equal revision the leaves are
unchanged; the refresh is idempotent under those (a leaf dropped by the
transfer is never in the targets built from the same cache).

"A moved stamp never restarts progress" in code: the refresh body is the
base's plus the marks. It adds leaves, replaces routes, resets provisional
coverage; no line clears COMMITTED coverage. The repaired code runs a subset
of the base's refreshes with the same function.

### 5. Cache `clear()` (VERIFIED for the listed consumers)

Every consumer of `getTableMutationVersion` in `src` (grep, 12 sites) compares
for equality within one process or concatenates into a key. None treats 0 as
"empty", none persists the value, none compares it across processes.
`readiness-planning-semantic-generation.js:203-256` rejects only non-integers
and negative values. The cross-instance case is unchanged by this diff: a
consumer that does not also key on cache identity had that exposure before;
the plan stamp keys on identity.

Tests that call `clear()` on a system table cache but were not in the
regression set (`cache-hydration-correctness.property`,
`hydrate-system-cache-from-bootstrap`, `system-table-cache-cdc-provenance`,
`replica-local-only-row-convergence`) do not read the version (grep). INFERRED
unaffected; not executed.

### 6. Optional version reads are a silent second path (finding for C1)

How a missing version is represented (VERIFIED, durable-plan.js:51-82): a
missing method yields `undefined`; `isOwnerVersion` rejects it; the stamp is
`null`; `heldPlanOf` returns null for a null stamp; `holdPlan` stores nothing.
A missing component is never compared as a constant. A stale entry left from
an earlier known stamp is harmless, since versions are monotonic.

But:

- The form is a capability probe. `docs/development/code-style.md:150-154`
  prescribes the replacement for `owner_port_feature_detection`: "a named
  collaborator validated at its owned wiring point ... Reads before wiring
  return typed unavailable", and adds "renaming an alternate authority does
  not remove it". The record's claim (15.2) that optional call "is the repo's
  navigability rule" misreads it; the optional call only escapes the syntax
  detector.
- The always-rebuild algorithm survives as a second path, used by every
  topology test double (stub trees at `cdc-group-propagation-service-harness.js:285`,
  `cdc-topology-progress-fixture.js:85,263`). Most existing topology tests
  therefore never run the stamped path.
- In production the three owners expose their versions (VERIFIED by wiring:
  `latency-topology-setup.js:87-109`, `node-runtime-local-authorities.js:92`,
  service.js:50). No executed assertion in a production composition proves the
  stamp is known, so a future versionless wrapper would make the optimisation
  silently absent (safe direction, invisible).

Stricter form: `CDCGroupPropagationService.initialize` validates
`getTableMutationVersion`, `getRoutingGeneration` and `getRevision` and
refuses construction with a typed error; `planStampOf` calls them directly;
`propagationPlansAtStamp` is read without `?.`. Cost: about three shared
fixtures (the harness, the progress fixture, `cdc-source-occurrence-helpers`)
plus inline stubs across roughly fifteen test files, less than the record's
"every existing topology test double" suggests.

### 7. The negatives (VERIFIED by reading the test)

- 49 cases, counted: 12 + 15 + 10 + 4 + 8. Generated from one list.
- The list is hand-enumerated. The structural case (test :692-709) checks only
  unique ids and well-formed entries. The record's "an input added without a
  case fails" (section 12) is **not confirmed**: a fifth table read added to
  `routing.js` would be absent from `PLAN_TABLES` (hand-written,
  durable-plan.js:22-24) and from the list, and nothing would fail. Mitigation:
  the list was written at 29f2fab7f from the check's reads, before the stamp
  existed, and my derivation in finding 1 agrees with it.
- Row cases go through the real owner (`applySystemTableChange`, test :134-144),
  the config case through `setByPath` on the real singleton (:491), on the real
  cache, config, tree and router. The witness file is identical at 8abec5e92
  and 82295c47e.
- Stamp components with no discriminating case (removing each from the stamp
  leaves every test green): the tree generation (its only case uses the stub
  tree, which makes the stamp unknown, :493-500); cache, tree and router
  identity (masked by the progress's own identity checks,
  `cdc-propagation-progress.js:167-169`); config identity; `router.deliver`;
  `owner.propagationMode`.
- No plan-level case for: `clear()`, a DELETE, the authoritative-absence sweep,
  a config write through `applyOverrides`, a tree recompute with no table
  change, an in-place row mutation. The first four are covered by reading
  (finding 1) and by the owner unit tests; the tree and config owner tests were
  added in the repair commit, not red-first.

### 8. Lab evidence (VERIFIED from files)

| Run | Sha in `selection.json` and log | Result |
| --- | --- | --- |
| `cdcstamp-r2` | 29f2fab7f | 54 tests, 52 pass, 2 fail |
| `cdcstamp-2b-red` | 8abec5e92 | witness 59: 54 pass, 5 fail (plan bounds x2 at 251 and 697, selection bounds x2, reuse); cache witness red "before 1, after clear and one apply 1" |
| `cdcstamp-2b-fix` | 82295c47e | 26 files, 24 ok, 2 not ok. Witness 59: 57 pass, fails are exactly the two selection bounds; measured 1 plan rebuild with 243 and 685 selection evaluations |
| `cdcstamp-2b-fix-fgb` | 82295c47e | foreground-boundary alone: ok, 4929 ms |

The timeout: test 1 of `cdc-group-propagation-foreground-boundary` took
6799 ms against 6300 ms in the 26-file run. Supporting the author's
classification: its fixture's tree is a stub, so the stamp is unknown and the
repaired code adds only two stamp reads and one `deepFreeze` per evaluation
(VERIFIED, fixture :85,:263); the single-file rerun began with a 75 C thermal
hold; the witness file took 12.6 s in that run against 7.6 s in the two-file
run. That is consistent with load, not proof of it. "Passes alone" plus no
paired base run is not a sufficient classification (R19): see C2.

### 9. The raft status read drives the group (VERIFIED)

`readStatusObserved` (`src/raft/raft-rs-runtime-owner.js:1560-1575`): with
undrained inbound it enqueues and may synchronously perform READ_STATUS
(:1565-1570). `perform` (:1983-2004) drains all pending inbound (:1999-2003);
`drainInbound` (:1930-1960) steps each envelope; `finishReady` (:1227-1245)
sends and applies committed entries. The record's line numbers are off by a
few lines; the claim holds.

For this change:

- A drive during a build: impossible, the builder never reads raft (finding 2).
- A drive between the two stamp reads of one `propagationPlanAtStamp`:
  impossible for the same reason.
- A drive inside evaluation k (after its plan observation, as on the base)
  moves a table version, so evaluation k+1 rebuilds. Concretely, the final
  aggregation (`partition-cdc-obligation-delivery.js:365`) follows the scope
  check at :358 with no await between: a drive at :358 is re-observed at :365.
  The repair preserves the base's behaviour here.

## Author claims not confirmed

1. "A structural case so that an input added without a case fails": the test
   does not do this (finding 7).
2. "Readers get clones": false for `filter`/`getAll`/`getShared` (finding 1).
3. Optional call "is the repo's navigability rule": misreading (finding 6).
4. The foreground-boundary timeout is load-dependent: plausible, unpaired
   (finding 8).
5. "In production every owner exposes its version": confirmed by wiring only;
   no executed production-composition assertion that the stamp is known.
6. The profile shares in record section 17 (8.8 %, 2.7 %): not examined.
