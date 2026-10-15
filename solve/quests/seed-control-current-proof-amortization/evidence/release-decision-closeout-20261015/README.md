# Release-fencing decision closeout, 2026-10-15

Evidence checkpoint only. Production implementation remains HOLD pending
content-bound review of the decisions and named owner dependencies below.
Do not merge this branch wholesale: its inherited predecessor specification
and model remain rejected.

Accepted baseline: `108282c80318fbc9e7094f2e7a99ba37430374fd`.
Test checkpoint: `8a4986dd82e4f26436945dc139727024d9b70b41`.
Preservation branch: `review/release-fencing-decision-closeout-20261015`.
The final evidence commit and uploaded archive are identified separately by
`PUBLICATION.json` and the remote branch; neither changes the test identity.

## Result and scope

The complete prepared-settlement native test passed on its first locked
`lenovo-laptop` run, exit 0, classified duration 7,551 ms. The real QueryEngine
discharged the recorded ROLLBACK, release reopened all three application
replicas, and retained terminal outcomes stayed unchanged at position 6.
This is local-PAUSE ROLLBACK evidence. It does not prove COMMIT, committed HOLD,
delayed sealed bytes across later authorization, or native snapshot recovery.
See [NATIVE-RESULT.md](NATIVE-RESULT.md), exact inputs in `source-inputs.json`,
and complete raw artifacts in `native/`.

The test commit changes three test/fixture files and their existing impact
registration. Normal generators update the impact seal, subsystem classes and
owner-debt inventory. No production `src/` bytes change. This packet adds docs,
evidence and independent reviews; publication appends one evidence finding to
the existing Quest log without changing its statement, seal or terminal state.
The prior failed N2 test and all prior evidence remain unchanged at the accepted
baseline. The accepted full archive was independently rehashed locally: all
133 payload entries match its manifest; see `custody/` and the
[preserved accepted archive](https://github.com/psvensson/lagrange/releases/download/solve-evidence/seed-control-current-proof-amortization--LAGRANGE_NATIVE_RELEASE_FENCING_OWNER_PACKET_20261015T104241Z.tar.gz).

## Exact decisions presented for owner review

| Decision | Selection | Concrete remaining implementation blocker |
| --- | --- | --- |
| Command and binding | Existing partition application owns INIT/HOLD/APPROVE and exact expected-state CAS; query delivery captures one immutable admission token; TX1 keeps volatile staging and owns replay/settlement. | Exact-prefix membership facts, owner-fed application provenance, durable query discharge encoding/custody, and the fresh/retained INIT activation matrix are new contracts requiring agreement. |
| Result and capacity | Extend the existing committed-result owner with a typed canonical release result and separate history-retirement generation. Proposed release-only logical envelope is 5,388,288 bytes with explicit count/encoding ceilings. | No finite native pending-suffix accounting contract exists; critical refusal saturation can block reauthorization; TX1/query settlement and manifest encodings remain unbounded. The proposed numbers are not adopted production limits. |
| Snapshot and restore | Continue the existing v2 application-image and coupled native Ready/import work; restore one exact applied boundary and reconstruct receiver-local runtime custody. | Provenance, creator/validator wiring, intact-receiver native acceptance, atomic import and install/crash/suffix-replay witnesses remain absent. The peer-only scrub cannot provide this proof. |

[DECISIONS.md](DECISIONS.md) specifies canonical fields, transitions, result
matching, proposed bounds and the complete acceptance matrix. Its reviewed
SHA256 is `62de8c65beb30bdc51bd34c41c7087208f7d3ec1018094bf2b19217177ce6ad4`.
[SNAPSHOT-DECISION.md](SNAPSHOT-DECISION.md) maps preserved snapshot work and
the required recovery contract; reviewed SHA256
`998be9039a942a8a4d0d03938991130d8e1250dab8b3befbbb3ee660bfa92329`.

Each subsystem and communication has one semantic owner. Query chooses global
COMMIT/ROLLBACK; TX1 owns participant obligations; committed partition apply
owns release transitions; the existing result owner owns exact outcomes and
retirement; native runtime owns ordered positions and suffix custody; snapshot
and application owners own the coupled image/import. D3 alone owns local serving
eligibility. Digests, routing caches and local waiters gain no authority.

The earlier comparative research remains in the accepted packet's
`COMPARATIVE-PRECEDENTS.md`: primary-source etcd CAS, Raft/LogCabin exact response
retention and acknowledged frontiers, and FoundationDB intent custody through
unknown outcomes informed these choices. They do not replace Lagrange's missing
owner contracts or introduce replicated BEGIN.

## Complete future unit and stop point

The future unit is one partition's release/HOLD -> ordinary write/first PREPARE
-> durable outcome/replay, including query delivery and recovery custody,
D3/D4, finite capacity, retirement, activation and supported snapshot recovery.
The matrix in DECISIONS.md requires the paired negative schedules and positive
ROLLBACK and COMMIT controls. Components may be developed in reviewed increments
after approval; no isolated fragment is a working release protocol or may land
on focused greens alone.

Independent reviewers approved preservation of these exact documents and
reviewed the test source and raw result. Their bounded reports are in `reviews/`;
they do not approve production implementation. Inherited lint/complexity and
RC1/RC2 F-MIR failures remain separate integration obligations. No full campaign
or repeat of the four earlier native investigations was performed.

Successor stays unsealed/unactivated; shared-control-wave HELD; Runner/TAP PARKED;
PR #122 and `bde70cec...` rejected. Stop here for independent content-bound owner
review before production work, successor changes or merge.

## Payload representation

`MANIFEST.sha256` covers every archive payload file except itself. The archive
and Git mirror contain the same payload. `PUBLICATION.json` is added to Git
after the upload/download/hash check, so is deliberately outside that manifest
and archive. The final Git commit is the enclosing preservation identity.

Source/controller copies end in `.js.txt` or `.mjs.txt` and are byte-exact,
not reformatted or newly executable repository entries. The native command
runs the ordinary repository test from the exact pinned test commit. Full
foreign staged patches and process command lines stay local; only their hashes
and scoped custody findings are published.
