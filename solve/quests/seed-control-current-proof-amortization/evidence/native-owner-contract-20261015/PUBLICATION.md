# Evidence publication receipt

[Download the verified owner packet](https://github.com/psvensson/lagrange/releases/download/solve-evidence/seed-control-current-proof-amortization--LAGRANGE_NATIVE_RELEASE_FENCING_OWNER_PACKET_20261015T104241Z.tar.gz).

- SHA256: `550f0e0a7fbb5ded309206d60474567bd428ddfde808c99f0b8b4a2691783bf1`
- Bytes: 229948
- Manifested payload files: 133 (plus the manifest itself)
- Payload manifest SHA256: `6ff0509cd9b0ad645d1b77e5f595ca98324e29095a9e7dfe58169feedcc87f7b`
- Native test head: `897ccebeb4cda14bb98bfb21102ebbc5bb181f52`
- Production baseline: `bde70cec74b8eb8e8db17d0d50a432102947d6d4`

The existing `solve evidence add --id seed-control-current-proof-amortization`
route uploaded this unique asset, downloaded it again, verified the hash,
and only then appended the evidence finding. No asset was overwritten.
`publication-result.json` is the returned receipt; `publication-command.json`
records the exact command arguments. The Quest declaration and previous log
bytes remain unchanged; only one evidence finding was appended.

The downloadable archive freezes the reviewed payload, including the original
selected review files, all new raw evidence, exact native test/fixture copies,
source-to-contract map and comparative primary-source research. The publication
receipts and this file are added afterward and are outside that archive and
its payload manifest. The containing Git commit binds both payload and receipts.

Independent verdict: **APPROVE non-main evidence preservation only;
implementation HOLD**. The rejected specification remains rejected. No main
publication, merge, successor sealing/activation or production repair occurred.

The Git mirror omits the seven `.mjs` evidence executables listed in
`publication-archive-only-executables.json`; their exact bytes remain in the
verified downloadable archive. The normal commit guard rejected their
historical formatting (`publication-first-commit-failure.log`). No historical
source was rewritten and no hook was bypassed. Extract the complete archive
before checking its payload manifest or running those probes/controllers.
The actual native test files remain committed at their normal repository paths.
