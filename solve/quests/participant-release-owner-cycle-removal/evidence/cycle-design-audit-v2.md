# Participant release cycle cleanup audit

## Binding and current graph

Reviewed at `77e091f64fb711fbc5ca40a7915ae85f01a5cf4e`; committed and dirty
`src/**` are identical to production source
`ffe35e77d51cbd4ba35fb30518de1307eaaa2eec`.

The existing dependency evidence records exactly these two cycles:

1. release facts -> transaction pause -> release facts;
2. release contract -> release facts -> transaction pause -> release contract.

The edge that creates both cycles is
`partition-participant-release-facts.js:13-14`: facts imports the current
admission-state readers from the transaction-pause module. That module combines
two different responsibilities:

- lines 13-56 own the WeakMap, monotonic admission generation, CLOSED/OPEN
  state, synchronous status-proof invalidation, pause raise, and pause read;
- lines 58-105 perform the lifecycle-fenced asynchronous RESUME transition,
  which necessarily consumes `readParticipantReleaseFacts`,
  `replicaGenerationOf`, `releaseCensusDefect`, and `sameReplicaGeneration`.

The facts owner legitimately consumes the first responsibility to report the
admission generation and current paused state
(`partition-participant-release-facts.js:68-74,100-109`). The second
responsibility legitimately consumes facts and the release contract. Keeping
both in one module makes those valid directions circular.

No tracked production, test, script, or metadata reference uses a dynamic
import, `require`, or alias path for these modules. The live references are
static imports plus generated shard/impact metadata.

## Smallest ownership-preserving subtraction

Create one canonical state owner, proposed as
`src/partition/partition-participant-release-admission-state.js`, by moving
unchanged:

- `ADMISSIONS`, `nextAdmissionGeneration`, and private `newPause`;
- `participantReleaseAdmissionOf` and `raiseParticipantCutoverPause`;
- private `admissionProofMatchesStatus`;
- `invalidateParticipantReleaseAdmission` and `participantCutoverPauseOf`.

This owner imports only the existing release-admission state constants. It
continues to lazy-create CLOSED state, increment one process-wide generation,
freeze every state record, read the service's semantic Raft status, and close
an OPEN proof when term, leader, configuration, membership generation, runtime
generation, or lifecycle incarnation changes. There is one WeakMap and one
generation counter after the move.

Keep `partition-participant-transaction-pause.js` as the RESUME transition and
write-refusal boundary. It directly imports the new state owner and retains
`resumeLifecycleIsCurrent`, `refuseStaleResume`, `finalResumeFactsMatch`,
`resumeParticipantCutoverAdmission`, and `pausedWriteAnswerOf`. It continues to
consume facts and the release contract. It must not re-export any moved symbol.

Update every caller to import from its semantic owner:

- facts, participant cutover, participant release, release recovery, local
  mutation admission, and participant request import state reads/mutations
  directly from the new state owner;
- participant release imports `resumeParticipantCutoverAdmission` separately
  from transaction-pause;
- Raft write commit keeps importing `pausedWriteAnswerOf` from
  transaction-pause;
- tests that observe or raise state import the new state owner; fixture/tests
  that execute RESUME keep importing transaction-pause. The recovery test's
  mixed import becomes two explicit imports.

Do not move or copy `isReleaseDrained`. Its sole definition remains in release
facts and its current consumers continue to ask that owner. Moving that
predicate alone would not remove the facts/pause cycle. Do not use callback
injection, dynamic import, a compatibility barrel, or a re-export from the old
module; each would hide the ownership defect or preserve a competing path.

The resulting source direction is acyclic:

```
admission-state <- release-facts <- release-contract
       ^                ^                 ^
       +---------- transaction-pause/resume --------+
```

More precisely, transaction-pause depends on all three modules; none depends
on transaction-pause. The release contract may continue to consume the one
canonical `isReleaseDrained` predicate from facts.

## Isolation from the application-barrier repair

This cleanup is structurally independent of a later post-ENABLE application
barrier. It changes no accepted-work field, drain predicate, census precedence,
release identity, Raft observation, wait, or recipient action. Its only
behavioral source edits are a byte-for-byte move of synchronous admission
state and import rewiring.

The barrier unit may need to change the accepted-work observation in release
facts, its classification in the release contract, or the participant release
recipient. It should not import those owners into admission-state or put a
barrier/wait in the synchronous pause reader. Landing this extraction first as
its own reviewed unit gives the barrier a one-way dependency on current
admission state. Textual overlap is limited to facts/pause import sections and
the moved block; there is no semantic dependency on the barrier design.

The new state owner must be added beside facts/contract/pause in the existing
`raft-rs-runtime-application-transaction` contract and its
`application-and-progress-transaction` endpoint
(`test/shards/impact-contracts.json:599-650,1526-1585`). Canonical shard
generation should carry the new path; no new contract or endpoint is needed.

## Existing invariant witnesses

No mirror test is needed for the extraction. The existing real-owner tests
already bind the moved and retained semantics:

- `partition-participant-release-admission.test.js:30-62` proves CLOSED refuses
  new participant/local mutation while reads, admitted participant work, and
  committed apply continue; lines 64-90 prove clean connection generation does
  not grant OPEN.
- `participant-release-protocol.test.js:238-261` proves the real route starts
  closed, installs origin, resumes, reconstructs closed, and reopens only after
  the production re-census. Lines 264-300 prove missing authority/control fact
  and build mismatch remain closed.
- `replica-handler-release-recovery.test.js:179-213` proves idempotent OPEN,
  wrong release ID returns STALE without revoking a valid proof, and a shutdown
  reentered during the status read closes it.
- `replica-handler-release-recovery.test.js:215-285,668-683` proves handler
  shutdown, service shutdown, and registry replacement during awaited facts
  cannot perform the final OPEN mutation.
- `participant-release-protocol.test.js:430-473` binds the one canonical facts
  and drain predicate projection used by release refusals.

Static acceptance for the eventual mechanical unit should require the exact
dependency checker to lose both named cycles, strict cycle audit with no new
cycle, exact lint/syntax/scoped metrics, impact/shard audit, and the focused
tests above. A remaining unrelated static violation would remain separately
attributed; no baseline may be raised.

## Correction: preserve the sole guarded OPEN mutation

The extraction proposed above is **rejected and superseded**. It missed the
load-bearing lexical boundary at transaction-pause lines 75-104:
`resumeParticipantCutoverAdmission` owns the only
`ADMISSIONS.set(service, ... state: OPEN ...)`. Moving the WeakMap to a new
module while leaving RESUME behind would require an exported OPEN setter or a
new capability/token protocol. A generally callable setter would let a caller
bypass the facts, census, generation, lifecycle, and final synchronous status
checks. Naming such a setter narrowly would not make it safe. A new capability
protocol would be a new owner boundary and is larger than the cycle cleanup.

### Corrected smallest unit: consolidate observation into the existing owner

Keep the WeakMap, the monotonic generation, every CLOSED transition, and the
sole guarded OPEN mutation in the existing
`partition-participant-transaction-pause.js` lexical module. Move into that
same module, unchanged, from `partition-participant-release-facts.js`:

- private `FACT`, `ROWID_KIND`, `unavailable`, `readRowidCensus`,
  `readAcceptedWork`, and `generationAvailable`;
- `replicaGenerationOf` and `readParticipantReleaseFacts`;
- the facts reader's direct imports of build provenance, committed membership,
  semantic Raft status, connection/session/store/topology/rowid/query-census
  owners, and `deepFreeze`.

Move only the pure `isReleaseDrained(work)` predicate into the existing pure
`partition-participant-release-contract.js`. That module already owns the
ordered validation which consumes the predicate. Its other production
consumers import the same single function from the contract. Delete
`partition-participant-release-facts.js`; do not retain a barrel, re-export, or
compatibility path.

The resulting ownership is coherent:

- transaction-pause is the stateful admission owner and the sole reader that
  assembles the current facts needed to guard its OPEN mutation;
- release-contract remains the stateless identity/census/work-shape validator;
- recipient/cutover callers consume observations from the stateful owner and
  drain classification from the pure contract.

Facts assembly is observation, not an independent state authority: it already
reads the admission WeakMap to mint `admissionGeneration` and calls the
synchronous pause invalidator to report `paused`. Consolidating it with that
state preserves those reads and removes the false module boundary without
changing any decision.

### Exact rewiring

Production imports become:

- `replica-handler-participant-cutover.js`: `readParticipantReleaseFacts` and
  `raiseParticipantCutoverPause` from transaction-pause; add
  `isReleaseDrained` to its existing release-contract import.
- `replica-handler-participant-release.js`: `readParticipantReleaseFacts`,
  `raiseParticipantCutoverPause`, and `resumeParticipantCutoverAdmission` from
  transaction-pause; add `isReleaseDrained` to its existing release-contract
  import.
- release-contract removes its facts import because `isReleaseDrained` becomes
  local and exported there.
- transaction-pause removes its facts import because the reader and generation
  assembler become local. All existing callers of
  `participantCutoverPauseOf`, `participantReleaseAdmissionOf`, invalidation,
  raise, RESUME, and `pausedWriteAnswerOf` remain on this module.

Test/helper imports become:

- `participant-release-protocol.test.js`: `participantCutoverPauseOf` and
  `readParticipantReleaseFacts` from transaction-pause; `isReleaseDrained`
  from release-contract.
- `participant-transaction-fixture.js`: merge
  `readParticipantReleaseFacts` into its existing transaction-pause import.
- `replica-handler-release-recovery.test.js`: merge
  `readParticipantReleaseFacts` into its existing transaction-pause import.

The tracked reference census finds no other external consumer of
`replicaGenerationOf`, and no other source/test consumer of the three facts
exports. Generated shard metadata must lose the deleted facts path. The
existing `raft-rs-runtime-application-transaction` contract and
`application-and-progress-transaction` endpoint retain transaction-pause and
release-contract; they remove facts rather than add another owner.

### Graph and size verification

Current exact sizes/functions are:

| Module | Lines | Top-level functions/arrow helpers |
| --- | ---: | ---: |
| release-facts | 118 | 7 |
| release-contract | 184 | 13 |
| transaction-pause | 119 | 11 |

A syntax-checked `/tmp` construction made only the moves above. It produced a
189-line contract with 14 functions and a 222-line pause owner with 17
functions: 411 total lines instead of 421 and one fewer production module.
Both remain far below the 800-line owner limit; no function body or decision
boundary grows.

For transitive verification, dependency-cruiser described 1,914 current
`src/**` modules. I simulated the exact graph subtraction: delete facts,
remove every edge to it, add all of its non-pause dependencies to pause, and
keep contract as a pause dependency while making the drain predicate local to
contract. Tarjan SCC analysis over the resulting 1,913-module graph found zero
cycles. The corrected target direction is:

```
release-contract  <-  transaction-pause/admission/facts
                               ^
                               |
                 recipients, cutover, recovery and writes
```

The contract does not import pause. None of the moved observation dependencies
imports pause transitively in the current graph. This specifically removes
both recorded cycles rather than suppressing the checker.

### Barrier isolation and alternatives

The consolidation can still be its own unit before the application-barrier
repair. It changes the facts file boundary and import sites, while preserving
every facts field, read order, await, release outcome, pause transition, and
OPEN check. A later barrier may extend accepted-work observation or contract
validation in the consolidated modules, but it need not change admission state
or acquire a state mutation API. Sequencing the mechanical consolidation first
avoids two branches editing a file that is deleted by this unit.

No smaller equally safe extraction was found. Moving the WeakMap plus RESUME
into a new module still leaves facts needing the state reader and recreates the
cycle unless facts is consolidated too. Exporting an OPEN mutation, passing
admission snapshots/callbacks into facts, or moving the pure contract into the
state owner adds a new authority boundary or mixes state with validation. The
two-file consolidation deletes a false owner surface and preserves the only
guarded OPEN path without such a protocol.
