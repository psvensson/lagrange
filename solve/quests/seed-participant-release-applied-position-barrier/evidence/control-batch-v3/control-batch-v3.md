# Applied-position controls V3 custody report

Status: **TEST-ONLY CONTENT FROZEN; behavioral, production-composition, and C5 receipts remain HOLD.**

This batch is based on `ad23d75d58e320ca2fe58f8baa9b0a941a8158e2` and addresses the remaining C3 finding in independent review `d126da2ef9f5618ad8b2e3a6af2e7fb66fd010bdd0bca70008587fafcffeb5b2`. It changes only the two selected tests and their already shared participant fixture. It does not change production, the native witness, the final-query case, a Quest, registry or generated metadata. No behavioral test or lab was run.

The V2 report and manifest remain byte-identical: `control-batch-v2.md` SHA256 `10373536e11b6ab99fc1265632474349b7c49d7f727c0a18d44b8c8f2329b557`; `frozen-control-batch-v2-hashes.json` SHA256 `6a05c25d4e3353c1ba3a031e089f6b582f96a52de5759b128ea6638a520bedf0`.

## C3 custody closure

`participant-transaction-fixture.js:544-622` is the one membership-gate custody seam used by both selected tests. It keeps the exact prior committed-membership method, fails loudly when a different owner replaced its wrapper, and provides these ordered retirement obligations:

1. release the held membership continuation;
2. observe every registered release/resume/observation settlement through a rejection handler installed at registration time;
3. retain every distinct rejected settlement with its owner label;
4. when a read engaged, await completion of the deferred membership method;
5. restore only the exact wrapper it installed and retain an ownership/restoration failure;
6. return the retained primary or aggregate instead of throwing from an intermediate `finally`.

The helper does not commit pending application work, alter owner facts, wait by polling, expose a production map, or decide an outcome. A successful body may release or restore early for an assertion; `retire` remains idempotent for those operations and still observes every registered settlement.

All held-membership operations now register with that seam:

- `participant-release-protocol.test.js:459-597` uses it for the real blocked-drain starter and joiner. The ambient-intrinsic restoration is independently retained by `retireMembershipAndIntrinsic` at lines 81-91 before the gate retirement result is returned. The later pending write remains owned by the service shutdown settlement; cleanup does not force its proposal to commit.
- The RPC/overall deadline loop, safe maximum boundary, queue-delay case, duplicate/join/conflict case with a separate held successor, and fresh-first-read case at lines 774-1184 all register their operation before awaiting `started` and call the same `retire` seam from their guarded cleanup.
- `replica-handler-release-recovery.test.js:229-304,306-401,403-510,893-925` registers every held resume/observation. Handler shutdown, service shutdown, replacement service retirement and artifact removal remain independent cleanup operations whose errors are retained after gate retirement.
- The nested old-attempt/successor case has two independent gate records. Each gate owns only its corresponding operation and restoration, so failure of one retirement cannot skip the other.

Fixture setup and general cleanup were made consistent with the now-loud shutdown owner. `participant-transaction-fixture.js:407-451` retires a replica acquired before initialization/leader setup fails; lines 733-760 aggregate every owned service shutdown and preserve a measurement failure; lines 894-906,939-957,974-993 cover staged, partial two-replica and pending-prepare acquisition paths. In the protocol test, `cleanOwnedFixture` retains every handler/service/settlement/artifact failure and retains the directory when owner retirement fails. These changes do not claim that unrelated fixtures share this custody contract.

The remaining simple `finally` blocks were reviewed. Database close at fixture lines 191-203 and restoration of the preexisting propose handler at lines 503-515 predate this control batch. Protocol hostile-prototype restoration now retains each reverse-order restoration failure. Invalid-clock tests restore own plain fixture fields, and the post-ENABLE transport gate resolves its own `Promise.withResolvers` continuation; neither is a held committed-membership owner. Every new held-membership `finally` delegates to the shared seam.

## C4 exact-source qualification

Production V1 is bound by `applied-position-production-v1/freeze-manifest.json` SHA256 `e2c04f65667bc2aaeaf650a18811e9617e72d40b9294d8ab0dc74807244bbb28`. Its observation file is SHA256 `b4344c59bbf6563dfb601fcba18187ac174dd6f88439a61b5b6859298583c800`; its client is `f6768741937ae8ad34c708426462a2c61eedaadc8155b30665d62f2da00c8baa`.

The old-callback assertion deliberately claims only that the deferred membership method returned. In the bound observation owner, `observeOnce` awaits facts at line 103 and immediately returns when `record.active` is false at line 104. `discharge` first makes the record inactive and removes the map entry only when the exact identity is still current at lines 54-76. This source ordering is the safety reason an expired old callback cannot detach the separately held successor. The test does not claim `gate.finished` proves completion of every later promise continuation and adds no guessed microtask barrier.

The numeric control uses a valid nonnegative safe start value `MAX_SAFE_INTEGER - REQUEST_TIMEOUT_MS + 1`. In the bound client, line 48 adds the fixed request timeout and line 50 rejects the resulting unsafe cap. The exact safe boundary one millisecond lower remains positive. The removed negative-clock case is classified only as an invalid sample; no impossible independent arithmetic-overflow claim remains.

## Deliberate proof ceiling

C5 remains open exactly as before: the real native stale-N/fresh-K dirty-wake schedule, the older-origin/later-work combination, and the final-query proof remain separately reviewed work. The final-query readiness correction is recorded separately; the reusable hold is the protocol test's actual OBS delivery gate, because native V8 holds Raft carriers and membership answers and has no reusable OBS-delivery gate. No extraction or final-query edit is part of V3.

The source review reports V1 REVISE for other groups. This batch does not approve source, waive those findings, certify native topology/startup, or turn static checks into behavioral proof.

## Frozen bytes and static checks

Exactly three tracked paths differ from HEAD:

- `test/test-helpers/participant-transaction-fixture.js`: 46,187 bytes, SHA256 `cc2d81aa264ef98b8a464214d63903cd71853b35dc2e113b76e794ee7872ff2e`;
- `test/partition/participant-release-protocol.test.js`: 59,518 bytes, SHA256 `b2e5777ef68f935f3b762b4bbfae233922c00bf7e19f3fa4469b23fd6ff156ca`;
- `test/node/replica-handler-release-recovery.test.js`: 39,682 bytes, SHA256 `c0da5f8df69d23e846138ba56c3095a307cb6de18e3bddb59c7e4efbbcb9bf73`.

The binary diff against HEAD over those exact paths is SHA256 `c5066c68c3b079e56c6a4340516ed391aaf8ffc6e3d3c18225962005d1454b4b` (1,160 insertions, 156 deletions). Syntax for all three files, exact ESLint, `git diff --check`, and strict scoped cyclomatic 12/cognitive 20 checks exited zero. Exact command logs are under `control-batch-v3/`. No behavioral command was run.
