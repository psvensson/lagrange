# Local corpus process observation: bounded transition

## Scope and source

Base: `43e217c014017831cd3485b2e3c117451560a29e` (tree
`b0879cc404cef96a5f90869d0364afa24a16cc87`). Rules blob:
`0e63cfe4e528a7c8b8a1a7892efba6c6d4fc3019`. Current workflow guidance was also
read from `origin/main` at `348796bca` (PR207 changes guidance, not these source
owners).

The writable owner boundary is `scripts/publish-local-corpus.js` observation and
reconciliation, its actual `publishExactHead` consumer in
`scripts/publish-head.js`, and `test/scripts/local-corpus.test.js`. The existing
runbook may describe the resulting observation contract. No new execution or
state-store owner is introduced. The integration owner records this finding in
`reviewed-foundation-integration`; it does not reopen the terminal
`local-corpus-canary` Quest. Original source, refs, evidence and the broader
formation WIP remain immutable. Canonical metadata generation and all project
execution belong to the physical lab coordinator.

History `b0ceb702474bab7e1e7a8de489c908830b2781ec` introduced the predicate when
newer publications could supersede older processes. The current candidate has
removed that supersession, but retains the catch-driven `/proc` to `ps` switch
and a misleading comment about signalling. This is a source finding, not a
measured failure. Existing live, absent, reused-PID and zombie controls do not
measure inspection failure or the alternate observer.

## Producer, consumer and transition

`reconcileLocalCorpus` reads current state records and asks the existing owner
to observe each RUNNING record's positive integer PID. The owner returns one of
PRESENT, ABSENT or UNAVAILABLE. The observation is not a new durable authority.

Platform selection precedes observation: Linux reads only its proc command;
Darwin uses only `ps` with untruncated command output and finite execution/output
bounds. A platform without a defined observer reports UNAVAILABLE explicitly;
this does not revoke general native-runner support or introduce a Linux-only
project policy.

Signal zero establishes whether the PID is available for inspection. ESRCH
establishes absence; EPERM and all other errors are unavailable. After signal
zero succeeds, any command-read failure, including ENOENT in a disappearance
race, is unavailable. There is no second observer after a read failure. A fresh
reconciliation can resolve a later ESRCH or readable command.

Successful Linux command reads preserve the existing marker classification:
an empty zombie command or an unrelated command means the recorded local
corpus is absent. This preserves the current evidence ceiling; it does not
claim an exact process incarnation or distinguish PID reuse by another corpus
that also carries the marker. Darwin requires complete nonempty command output;
spawn errors, signals, nonzero exits and empty output are unavailable.

ABSENT may change the running record to LOST through its existing atomic
temporary-file/rename owner. PRESENT leaves the record unchanged. UNAVAILABLE
also leaves it byte-for-byte unchanged and emits a named unavailable message
with SHA, PID and cause. `publishExactHead` and `proveMergedHead` pass their
existing writer into reconciliation. One unavailable record does not prevent
the remaining records from being observed. The unavailable result is not
persisted as a permanent veto or promoted into a receipt, final verdict,
replacement attempt, cleanup permission or process signal.

## Controls and evidence ceiling

Add original-compatible controls to the existing local-corpus root before
production edits. Native children acknowledge readiness, records use real
filesystem bytes, and teardown must observe child closure. A finite substitute
at the exact OS-read seam forces EACCES, ENOENT or signal-zero EPERM. A `ps`
witness executable records any actual alternate command invocation. Controls
retain the first observation, restore the seam, and reconcile the same record
again. A second running record with a confirmed absent PID proves that
unavailability does not stop iteration.

The intended original failures are alternate observer use and conversion of
unavailable inspection into LOST. A setup/import error is not that evidence.
Darwin branch substitutions on Linux prove branch and consumer handling only;
they are not native macOS execution. Existing live, dead, reused-PID and zombie
controls remain relevant to their original claims.

Independent review of this design approves the transition in principle and
requires the recovery, later-record and bounded Darwin controls above before
source approval. Source implementation follows review of the controls; physical
original measurement and candidate proof remain owed. No local project test,
parser, generator, probe or lint is run in the cloud workspace.
