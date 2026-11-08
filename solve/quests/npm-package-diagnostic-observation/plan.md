# Package diagnostic observation

Base: PR199 checkpoint `4260e562b8ae9fafdb51d504c3532dede9f75bbf`.
OE work owner: `lagrange-object-environment-bj0`. The diagnostic explicitly
depends on that frozen unmerged checkpoint because it is the failing source.
Rules revision: `docs/steering/rules.md` SHA-256
`ff82e2e1318f964871a3655e39755f0410f11c8bdd5edc89e7ed1f0a16fdd08b`.

## Problem and evidence

The retained five-host run selected 85 files, passed 84, and timed out the
installed-package subtest on tv-dator. Both npm pack logs report success;
available original evidence does not identify the later stage. Original
temporary install/cache directories are gone. The frozen test uses a 180-second
test deadline and the package owner uses 120-second synchronous command bounds.
The classified runner discards successful output, and lab placement relays only
result rows then removes its worktree. Logging alone would lose evidence.
The raw extra nested ledger row is separate OE `uxa`, not part of this repair.

## Owners and invariants

`scripts/release-npm-package.js` remains the sole packaging/installed verification
owner, including command sequencing, arguments, error mapping and cleanup.
Its small observation helper owns record mechanics only. The existing package
integration witness owns its opt-in sink, outer assertions, inspection and
cleanup. `scripts/lab/probe.js` remains the placement/lifetime owner; a delegated
artifact helper implements its explicit collection protocol. This is the named
interaction owner for test artifact -> bounded placement relay -> controller
retention. It owns no package or test-result verdict. Register the affected
interaction and proof paths in the current impact-contract registry.

R01-R04, R08-R09, R13, R15-R23 and the current test regression/harness policies
apply. No product semantics or historical sealed acceptance changes. Keep the
existing try/finally scopes: in particular a cleanup error currently can replace
a body error. Do not silently repair that behavior in an observer.

## Slice A: optional package observation

Add detached, frozen scalar records with monotonic sequence, wall timestamp,
monotonic elapsed time, nested stage identity, begin/end, duration, and explicit
success/error outcome. Record raw spawn status, signal and error code at the
existing `run` boundary before `runChecked` maps errors; distinguish that from
parse/assertion failure. Separate sync and async helpers: synchronous commands
remain synchronous and receive no extra await. Preserve returned object and
thrown error identity and do not freeze or expose operation arguments, env,
results or error objects to the sink. The absent-observer path calls original
operations directly. Sink exceptions/unsupported async sinks are explicit
observation failures; they never replace the original operation outcome.

Observe enclosing build/install spans and their setup/manifest/head/path checks,
preliminary pack, extraction, staged manifest, final pack, pack cleanup, install,
API import, bin-path checks, both version commands, dry run, service init/generate/
build, installed cleanup, outer tarball inspection, assertions and test cleanup.
Nested command records carry raw execution outcomes; containing stage records
cover validation and otherwise unclassified gaps. Preserve arguments, env,
ordering, synchronous execution, return/error construction, 120-second commands,
180-second test deadline, and all package assertions.

The witness opts into a synchronous bounded file sink under its own isolated
checkout's `test-output/npm-package-diagnostic/`. Four declared files: trace
NDJSON (256 KiB cap), packed identity JSON, installed package.json and optional
installed hidden lockfile (each at most 1 MiB, aggregate at most 4 MiB). Capture
the installed files within the install owner before its existing cleanup, also
on failure where they exist. Packed identity includes existing integrity/gitHead;
no timed tarball/tree hash or network probe. Missing root/lock data is explicit;
the hidden lockfile is optional, and these files are not complete closure proof.
Observation failures appear in a bounded terminal record/warning. Record measured
sink overhead separately; malformed, truncated, duplicate/out-of-order or missing
terminal records make observation incomplete.

Proof: exact return/error identity, sync execution, detached frozen records,
raw timeout/signal versus mapped exception, async failure and cleanup ordering,
no observer behavior, throwing/async sink handling, bounded writes/snapshots,
missing optional files and partial/error records. Exercise actual packaging
command boundaries with local fake executables or existing seams without npm
network execution; assert unchanged args/env/timeouts and real paths through
build/verify, not only helper tests. Mutation controls remove end/command records
and alter outcomes so the intended assertions fail.

## Slice B: explicit placement artifact custody

Add an optional artifact request to `runLabTest`, threaded through startLabShare
and startRemoteShard. Declare exact relative file paths and required/optional
status, bounded by fixed owner ceilings (at most four files, 1 MiB/file except
trace's lower bound, 4 MiB aggregate). No broad env forwarding or arbitrary tree
enumeration. Default calls have no collector and keep existing shell behavior.

For an opted-in shard, collect once in EXIT cleanup after runner wait/stop and
before deletion. Capture original `$?` first. The collector has its own short
bound within the existing stop grace and does not replace runner/cleanup exit
status. Reject absolute/traversal paths and symlinks in any component; check
sizes before allocation/encoding. Relay separate bounded base64 artifact frames
with file bytes/SHA-256 plus a terminal custody envelope naming declared files,
candidate/base/run and complete/incomplete reasons. Never use results rows.
Controller validates identities, counts, ordering, duplicate frames, bounds and
hashes, retains files in a fresh per-run/per-host directory, and records missing,
oversize, collector error/timeout and transport truncation as incomplete. Raw
placement logs retain the frames; UI verdict lines need not print payloads.
Artifact incompleteness never changes a test verdict into success; diagnostic
classification separately requires complete custody. No controller fallback
for the explicitly named measured attempt.

Proof: real existing local placement shell fixture through canonical
startRemoteShard, successful/failed/signalled runner, collection before cleanup,
unchanged original exit, exact bytes and hash, missing/optional/oversize files,
path traversal, intermediate symlink, collector timeout, duplicate/truncated
relay and stale destination refusal. Existing placement lifecycle/regressions
remain required. A collector-after-delete mutant must fail custody assertions.

## First measured attempt and evidence ceiling

After both independent implementation reviews and narrow proofs, freeze a
diagnostic commit with normal preservation hooks, retain base/candidate, patch
hash and package/test source identities. Use canonical runLabTest once on
locked tv-dator, retry 0, same workload and owner deadlines; record actual runner
configuration/thermal/lock/host facts without arbitrary env dumps. Retain raw
result rows separately from artifacts, verify bytes and cleanup, independently
review the collected result, then stop measured execution.

A Node test timer cannot interrupt spawnSync: full ended stages may exceed the
180-second timer while its callback cannot run. An open stage or test timeout
alone is not first causal divergence. A complete repeated timeout may identify
the current owning stage; a pass only measures the instrumented attempt.
Missing records, changed outcomes, excessive observer overhead or unexplained
gaps falsify classification. Do not start another attempt or baseline comparison
automatically. PR199 landing, PR198 integration, PR200 final proof/publication
and native PR95 acceptance retain their separate gates.

## Alternatives and completion

Rejected: retry for green; new waits/deadlines; source-checkout package substitute;
preload interception (unsupported forwarding/incomplete cleanup); process
sampling as exact stage evidence; log-only observation; trace records disguised
as test receipts; remote work outside canonical locks. No premise changed.

The substrate Quest closes only on its named transparent-observer/custody proofs,
independent review and required exact-candidate gates. OE bj0 stays open until
the historical failure is causally classified and any required repair proved.
