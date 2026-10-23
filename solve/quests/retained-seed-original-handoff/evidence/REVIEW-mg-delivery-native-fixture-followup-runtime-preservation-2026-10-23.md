# Independent custody review: native fixture follow-up runtime preservation

Reviewer: `subagent:/root/retained_effects_review`.

Verdict: **APPROVE the exact 90-path manifest for non-main evidence-only
preservation.** No material custody or scope correction is required. This
decision preserves a failed measurement and its limitations; it supplies no
source, runtime, fixture-repair, Quest or merge acceptance.

## Exact preservation boundary

Worktree: `/mnt/data/peter/projects/.worktrees/mg-delivery-fixture-trace-20261023`.
Verified HEAD and executed source:
`036dc0019a5c4711c1ec9d9f6c591426fcb1e4b2`.

`MANIFEST-mg-delivery-native-fixture-followup-runtime-preservation-2026-10-23.json`
has SHA256 `869d5dd6ae60eae66588dae1e0ab87431cd39443a4a6163184d4fb606dddffa4`.
Its 90 unique paths total 1,434,222 bytes. I checked every declared byte count
and SHA256, and compared all 89 `sourcePath` copies with their original `/tmp`
bytes. The remaining entry is the unchanged independent lab review,
`LAB-REVIEW-mg-delivery-native-fixture-followup-2026-10-23.md`, SHA256
`c6ab55c2b97c61117e46aaa63dd7c0803d280d268313ab2b2133454d48d30e18`,
24,062 bytes. This review does not rewrite or newly approve that historical
review's prose; it verifies that its exact record is preserved.

The worktree's only changes at review are these new evidence artifacts.
The `src`, `test`, `package.json` and `package-lock.json` diffs from the executed
source are empty. No production, test, metadata, lock, budget or assertion
change is included. The manifest itself and this new review are separate
preservation records, not members silently added to its 90-file census.

## Request, receipts and complete worker stream

The one source execution remains lab issue **#1092**, normalized request/job
`890bbfaa50ff4ff7867c8defc512040d`, controller
`b4a2e06c193c44b09f1b67d02e8d80f4`, physical host `tv-dator`.
I decoded the saved one-part request and verified the literal envelope SHA256
`6cd4bbf4c0bfce4bec495380c09ae85f50abe5a0ac864614fbc3bb32faaf401a`
and reconstructed payload SHA256
`220373924b4a7d7b3745dfbf7015cefb9656503b7b8be55c996394fe1edbd955`.
They agree with the terminal receipt. The payload names the exact executed
source and exactly the saved two-file selection:

- `test/message-group/message-group-native-custody-handoff.test.js`
- `test/message-group/message-group-native-provisional-route.test.js`

The terminal result remains **COMPLETE / FAIL, exit 1**. Its worker records
execution, container and thermal scopes closed. The controller tail is not
substituted for the original worker stream. I independently decoded all 29
preserved successful evidence chunks again, checking each issue, job, host,
stream, offset, returned length, chunk and raw hash, original byte/hash
declaration, and `read_only:true` / `executed_source:false`. They form one
contiguous stream: offsets 0 through 224000 in 8000-byte steps, then 6186 bytes.

The reconstruction equals the saved `runtime-worker.log` byte-for-byte:
230,186 bytes, SHA256
`5a594842a01fe52637e50046cdaf56ea60d347af15017402af417d4ce94010d8`,
stream `797bf81ea51c39ff42545789c24c7855aca2c7a513f5bc34d5fcdddfd7627d33`.
Those values also match the worker terminal receipt. The original failed
read-only SSH-255 receipts #1098 and #1109 remain present. Successful #1124
and #1125 supplied their exact offsets 24000 and 112000 from this same
original stream; they are not source workload retries.

The pre-fleet #1091 and post-fleet #1095 saved JSON digests match their
receipts. The selected worker has the same boot identity in both, is free
before the source job and after its terminal closure, and post-fleet reports
all six physical machine locks free. This is the recorded observation at
that time, not a claim about current availability or a release of another
worker's ownership.

## Preserved failure boundaries and unavailable child output

The exact original lab review remains authoritative for the finite measured
assertions and source-history analysis. The final runner census remains two
files, zero pass, two fail, and three runner-reported top-level assertions.
The generic driver's last-file count of two is not substituted for this census.

RF1 reached the missing native afterCommit receipt assertion. RF3 observed
premature committed source acknowledgment while recipient CDC remained
uncommitted, but its subsequent leader-loss prerequisite did not engage:
both survivors were still term-1 followers after the unchanged 200 rounds.
S2 selected the source event and queued an immediate batch; it did not reach
the registered application return or intended F1/F2 provisional route. The
later suffix/rejoin/recovery and S2 progress assertions are not measured by
this run. Nothing in this preservation scope changes those classifications.

The complete original worker stream contains an internal child-output
omission: line 65 explicitly reports **72,546 bytes elided** from the S2 TAP.
The saved `partial.txt` is also only an incomplete intermediate transport
concatenation. Neither the partial file nor the derived diagnostics may be
used to reconstruct or replace the missing child TAP. The manifest correctly
separates `completeTransportStream:true` from this internal limitation.

Read-only artifact collector **#1126** remains a separate failed recovery
operation. Its decoded packet has `source:null`, driver `shell`, and only an
exact-host, exact-old-worktree Git identity check followed by an intended TAP
read and encoding. It contains no checkout, dependency installation or test
execution. Its original 707-byte log, SHA256
`60d3244c0533ccc21d8728f5ec67b44ca1db5d015eaea57b0995cd09c4bfc616`,
records failure at that Git check because the old `work/source` directory no
longer existed. It did not read the TAP or rerun #1092. The generic controller's
`source_execution_started:true` records that this shell collector started;
it is not evidence that source tests ran. The collector terminal receipt
records FAIL/exit 1 and closed execution/container/thermal scopes.

## Preservation conditions and final check

The two exact raw `runtime-worker.log` and `tap-collector-worker.log` paths
are ignored by the repository's normal ignore rules. They are nevertheless
declared members of this approved manifest. Root's preservation step must
stage these exact paths explicitly and verify every committed manifest blob;
an ordinary directory add that omits them would not preserve this scope.
Original logs, receipts, partial artifacts and the prior review retain their
bytes, including any archival whitespace. No cleanup or prose normalization
is part of this decision.

All 90 hashes and the manifest hash were checked again after the review.
No file from the reviewed scope changed. I wrote only this new custody review;
I ran no local runtime, lab query/submission, source workload, metadata refresh,
Quest mutation, commit or push. The root owner retains normal preservation
guards, exact committed-blob verification and remote-head verification.
