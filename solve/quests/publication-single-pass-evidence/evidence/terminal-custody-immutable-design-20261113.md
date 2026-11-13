# Publication custody: finite immutable transitions

Prepared 13 November 2026 by subagent:/root/custody_design. Proposed design for
independent review, not implementation or execution evidence. This is the
follow-on to terminal-custody-design.md; that document's unchanged-JSON lock
alternative remains rejected for complete recovery because dead locks block
progress and BUSY can strand a measured terminal result.

## Recommendation and necessary tradeoff

Use a finite immutable transition representation inside the existing
publish-local-corpus state owner and existing state directory. Do not introduce
a database, Git refs, persistent locks, another publisher, an independent
scheduler, or an old-format fallback reader. Each admitted obligation has one
immutable base and at most two immutable successors. One complete file is
published into a predecessor-specific slot by atomic no-replace hard-link.
That operation is the compare-and-set: competitors for the same predecessor
cannot both install a successor. No process can die holding the empty slot.

This deliberately changes the physical current-state representation. Keeping
the mutable JSON file as the only current-state authority while adding a safe
portable conditional replacement and crash recovery was not achieved with the
existing available primitives. The necessary cost is updating the one reader
owner and its direct-file test fixtures. Do not retain a mutable current-state
mirror alongside immutable authority: it would restore a second interpretation.

Candidate reviewed source is HEAD 81d5a83478550fe2f1be89e991a84f65e2aea2f3,
publish-local-corpus blob 883a743eed16a3ccbe6af86fd051da08a614883c, rules revision
5. Writer census, history and original witness rationale remain in the first
design note. The existing publication Quest remains the acceptance owner.

## Representation and one interpretation

- `<sha>.json` is the immutable base record, retaining the existing record
  fields. Existing intact STARTING, RUNNING, GREEN, RED and LOST records can all
  be bases for the identical algorithm. There is no version test that switches
  to a legacy writer or reader. No historical base is rewritten.
- Historical `superseded` bases also remain readable and reportable as inert
  terminal records with no outgoing edges. No current producer may create that
  state, cancel an older attempt, or reactivate supersession. Preserving a sealed
  historical outcome is not an active supersession path. Do not reject an entire
  directory merely because it contains this retained historical state.
- `<sha>.from-<predecessorSha256>.json` is the one possible successor slot for
  the exact predecessor file bytes. A successor envelope has one named schema,
  the predecessor SHA-256, and the resulting record. SHA is validated against
  the root identity. The next predecessor digest hashes the exact complete
  successor envelope bytes, not a separately normalized record.
- A private, exclusively acquired staging directory beneath stateDir holds a
  complete proposed successor and proposal metadata. It is evidence before
  linkage, not current-state authority. No reader adopts a staging file based
  on age, filename, process absence or a seemingly valid result.
- Legal transitions are STARTING -> RUNNING, STARTING -> LOST, and RUNNING ->
  GREEN/RED/LOST. Terminal records have no successors. A STARTING base therefore
  permits at most two links; RUNNING at most one; terminal at most zero. No
  generic graph traversal, arbitrary journal, cycle following or retry chain.
- Root admission is also staged complete and published by no-replace link,
  before any file list, cone copy, log acquisition or spawn. Existing same-head
  companion refusal remains. Known orphan successor files without a base are
  invalid retained evidence, not permission to start that SHA anew.

## Atomic publication and durability

1. Read the owner snapshot, including the exact predecessor path, immutable
   bytes/digest and semantic record. Validate the intended legal transition and
   the caller's authority before constructing it.
2. Create one private staging directory on the same filesystem beneath stateDir.
   Exclusively create and fully write its proposal metadata and successor file;
   fsync the files, close them, then fsync the staging directory. Never publish
   a partly written successor. No shared `.tmp` path is used.
3. Call `fs.linkSync(stagedFile, predecessorSlot)` once. EEXIST is CURRENT_CHANGED,
   not BUSY: a complete winner already occupies that slot. Read it through the
   same owner algorithm, preserve it, and return its actual state. Do not retry
   by rebasing the losing proposal onto the winner.
4. On link success, fsync the containing state directory before acknowledging
   DURABLE_APPLIED. The link is the concurrency linearization point; directory
   fsync is the durability acknowledgement. If directory fsync fails, return
   LINKED_DURABILITY_UNAVAILABLE with the slot identity and leave it intact.
   Do not unlink or roll back a visible successor.
5. After success remove only the staging files this invocation acquired, then
   its own empty directory. Never sweep another invocation's directory. Cleanup
   failure reports APPLIED_CLEANUP_UNAVAILABLE and retains the committed identity.
   Failed/conflicting proposals remain evidence with exact paths and diagnostics.

Every operation is a fixed number of synchronous filesystem operations with
no polling or lock waits. This is an operation-count bound, not a claim that
an arbitrary blocked filesystem syscall has a wall-clock deadline. The existing
execution scope owns process deadlines. Hard-link/fsync unavailability is explicit;
there is no copy, rename-overwrite, SQLite or platform fallback.

Linux link(2) specifies that an existing destination is not overwritten:
https://man7.org/linux/man-pages/man2/link.2.html . The file and directory flush
are distinct obligations: https://man7.org/linux/man-pages/man2/fsync.2.html .
Node exposes linkSync/fsyncSync in its filesystem API:
https://nodejs.org/docs/latest-v22.x/api/fs.html . These references support the
algorithm, not a claim of power-failure or native Darwin measurement. Supported
physical filesystem behavior and actual installed Node must be proved on the
selected hosts; unsupported storage returns typed unavailability.

## Reading, consistency and malformed evidence

The existing readLocalCorpusRecords owner discovers base names, reads complete
base bytes, then queries the exact digest-derived successor slot. ENOENT for
that precise next slot means no successor was committed as of that lookup.
An existing slot is read and validated, then the same operation is repeated
within the fixed state-dependent depth. A terminal successor stops the semantic
walk; an existing further successor is invalid rather than silently followed.
An unreadable/malformed base or linked successor yields RECORD_UNAVAILABLE. It
does not mean the prior state is current or authorize a replacement.

Because valid producers only append immutable nodes and never delete them, a
reader can linearize at its last absent-successor lookup, or at reading the
terminal winner. A concurrent newer successor may appear just afterward; any
action based on the older snapshot still competes for the already filled exact
predecessor slot and loses safely. A reader need not lock or recursively retry.

Orphan, mismatched-predecessor, illegal-state and excessive-depth linked records
are invalid state evidence. Discovery must distinguish recognized successor
names from ordinary execution reports and validate their base/reachability;
concurrently appended legal nodes cannot be labeled corruption from a stale
directory listing. Validate a recognized unexpected node against fresh direct
reads of the fixed maximum chain, not by assuming readdir is a snapshot. The
maximum chain remains two links, so this validation is bounded. Private staging
is explicitly identified as uncommitted evidence; partial staging is reported as
such and cannot permanently block an unrelated legal slot publication.

Envelope validation conserves the complete predecessor record except explicitly
owned transition fields. In particular sha, startedAt, files, log, coneOwed and
all other attempt-identity fields retain both value and presence/absence. Only
STARTING -> RUNNING may replace pid, with the actual positive safe-integer PID
of the claimant; RUNNING successors preserve that acquired PID. Terminal
transitions may change state and add their owned status/reason/finishedAt/receipt
results, according to the existing producer semantics. They cannot change a
different attempt's identity, silently add another file list, or rewrite the
recorded process. An envelope with the wrong predecessor digest, cross-attempt
fields, unknown mutation fields or illegal phase transition is RECORD_UNAVAILABLE,
not a winner the loser can adopt. Root records remain historical inputs; this
does not invent new arbitrary restrictions on already retained terminal payloads.

A reader reports a visible immutable snapshot. It does not attest that the
writer received a successful directory-fsync acknowledgement. That distinction
is retained in operation results; no persistent acknowledgement flag is added
as a competing state source. A new mutation fsyncs the common directory before
its own durable acknowledgement, which also flushes the linked ancestors there.
Readers and reporting alone do not upgrade an earlier durability failure into
an executed or accepted proof.

The state directory must have one admitted producer version. Existing old
processes can overwrite the base because they do not know this contract; a new
lock scheme has the same deployment problem. Establish actual closure of old
writers before candidate use of a shared directory. Never mutate or fence an
uncertain original through this repair. A detected base mutation is explicit
record unavailability, not a transition-chain reset or a fallback to the new
base. Historical records and original execution directories remain preserved.

## Writers, contention and terminal policy

All writers from the first design's census use this operation. Only a successful
STARTING -> RUNNING link authorizes gate execution. Two detached callers reading
the same STARTING base compete for one slot; the loser cannot execute. A parent's
late STARTING -> LOST proposal competes for that same slot and cannot replace a
child's RUNNING or terminal node.

A worker holding the successful RUNNING claim is the sole producer of measured
terminal results. It publishes the resulting terminal from its exact RUNNING
snapshot. Reconciliation can propose LOST only for that exact RUNNING snapshot
after the existing native observer returns ABSENT; UNAVAILABLE never mutates.
The approved observer's limitations, including no stronger process-incarnation
claim, remain explicit.

Two reconcilers compete for one terminal slot and adopt the winner. There is no
BUSY state and no lock holder, so a live worker never loses a valid terminal
merely because another process paused inside an exclusive critical section.
In the normal public detached execution, the worker's command has the local
corpus marker while alive. After it has committed terminal and exited, a stale
reconciler loses to that exact terminal slot. If a valid terminal nevertheless
loses to another terminal, retain the losing complete proposal and return
CURRENT_CHANGED with both identities; do not report the proposed result as the
authoritative state or overwrite the winner.

If the worker dies after preparing but before linking a terminal, the private
proposal was never committed. A later native ABSENT observation can publish
LOST. The original measured output and complete proposal remain evidence; the
LOST reason must accurately say there was no committed terminal state, not claim
that the workload never produced a result. No staging file is silently replayed
or converted into a canonical proof. This is the same boundary as dying after
an actual command result but before durable terminal publication, with stronger
retained bytes and no permanent lock obstruction.

## Receipt effects and lifecycle ceilings

Corpus execution and recordProof remain outside any state critical section;
there is no lock. Only the successful RUNNING claimant executes them. Preserve
the existing exact report producer, native proof validation and recording
timeout. A successful recordProof may be followed by process death before GREEN
is linked. Its real proof object is not undone and must remain attributable to
the execution. Reconciliation can record LOST for missing terminal state but
cannot delete the proof, call it green from a file's presence, or rerun recordProof.
Existing receipt lookup remains the sole proof applicability authority.

If terminal linkage conflicts or storage fails after proof recording, return
non-success bookkeeping with both the actual receipt outcome and state outcome.
No atomic transaction across proof refs and corpus state is claimed. A proof
timeout retains uncertainty about the effect and output closure; it never
authorizes a duplicate invocation.

Crash before initial admission link leaves no admitted obligation or reserved
slot. Crash after STARTING but before worker acquisition retains STARTING as
the current owner already does. This design makes legal state transitions
possible after crashes; it does not invent restart/re-execution authority for
an abandoned STARTING record. If automatic abandoned-start closure is included
in acceptance, its missing launcher identity must be a separately explicit
owned lifecycle requirement. It is not repaired by pretending STARTING is RUNNING.

## Crash and concurrency outcomes

| Point | Authority | Next ordinary action |
| --- | --- | --- |
| Crash while staging | Prior node unchanged; staging inert | Another authorized writer may publish the still-empty slot |
| Crash after file fsync, before link | Prior node unchanged | Same as above; complete proposal remains evidence |
| Crash after link, before directory fsync | Complete node may be visible; durability unacknowledged | Reader validates visible chain; no overwrite/retry; physical power-loss claim withheld |
| Crash after directory fsync | Committed node durable under filesystem contract | Readers consume winner; no lock recovery |
| Cleanup fails after commit | Winner stays authoritative | Report secondary failure; only own staging remains |
| Two same-predecessor writers | Exactly one slot winner | Loser adopts winner, retains losing proposal, no rebased retry |
| Worker terminal then stale ABSENT | Terminal slot already filled | Reconciler returns winner unchanged |
| Worker dies before terminal link | RUNNING has no terminal | ABSENT may commit LOST; output/proposal remain retained |
| Malformed linked successor | Explicit unavailable | No older-state substitution or overwrite |
| Storage lacks link or required fsync | Explicit unavailable | No alternate persistence algorithm |
| Old mutable producer still active | Unsupported mixed-writer custody | Do not admit candidate to that shared directory |

For a link error other than the specified EEXIST conflict, return
LINK_EFFECT_UNAVAILABLE with the exact proposed bytes, destination and error;
the effect may be uncertain. Preserve the staging and any destination, never
assert no link was created merely from the error, and never delete a potentially
published node. A bounded direct read can report which bytes are currently
visible, but cannot manufacture the missing commit acknowledgement. The next
ordinary reader consumes a valid visible node or reports malformed/unavailable
evidence through the one algorithm. Linux documents a create-then-lost-reply
example for NFS in link(2); this is an error-model limit, not a claim that the
selected labs use that filesystem.

## Consumer and test compatibility

Source census found state interpretation in publish-local-corpus only:
readLocalCorpusRecords feeds detached execution, reconciliation, reporting,
post-push bookkeeping and post-merge admission. Route all those through the
one revised reader. Publish-head imports functions, not file representation.

test/scripts/local-corpus.test.js:41 reads `<sha>.json` directly in stateOf and
many fixtures rewrite it. Candidate tests must use the canonical reader for
logical-current-state assertions and use the actual transition owner for
concurrent producer actions. Raw-byte assertions must identify the immutable
base and committed successor(s), or the canonical terminal snapshot bytes;
they cannot assert that the admission base was rewritten. Expose only the
small state-reader surface needed by actual consumers/tests, without a second
test implementation of chain interpretation.

The direct-file test census also includes
test/scripts/publish-head.test.js:595 and :641, which inspect RED/GREEN after
real proof-authority integration; the intervening retained-byte checks inspect
the same base file. Adapt those candidate assertions to the canonical terminal
snapshot and immutable-node bytes while retaining their real receipt effects,
no-second-attempt checks, checkout cleanliness and untouched remote assertions.
Retain the historical `superseded` cases in local-corpus.test.js as inert-history
preservation/refusal controls, never as permission to regenerate that behavior.

Preserve original controls on their original source lineage. A candidate-only
fixture adaptation is explicitly recorded, independently reviewed, and cannot
be credited to the original measurement. The original race witness establishes
the old mutable-file failure first. Its candidate equivalent must retain the
same causal schedule and terminal-preservation assertion through the canonical
reader; changing the representation is not permission to drop that witness.

No generic output pruner currently owns this Git-common state directory. New
nodes and private evidence remain inside it; never add an automatic sweep.
Documentation must name the base/current distinction and exact retained paths.
No generated metadata is edited by hand; selectors/source-owner indexes are
regenerated and checked on physical labs through the coordinator when applicable.

## Required discriminating proof

Before implementation: independent review of this whole representation and
the original race witness. Then test on qualified physical hosts, preserving
the first failure without retry:

- Existing original stale-RUNNING/RED/real-ESRCH schedule and candidate equivalent.
- Two real same-predecessor writers; one terminal node, intact losing proposal.
- Duplicate STARTING consumers; exactly one gate invocation.
- Late parent loss after worker RUNNING/terminal; committed chain unchanged.
- Process death before link and after link; later valid transition makes progress
  without lock reclamation, deletion, timeout or retry of the workload.
- Injection of file-fsync and directory-fsync failures; exact typed results,
  retained stage/linked bytes and no rollback.
- Readers paused at each edge while another writer links the next; linearizable
  returned state and safe lost-CAS behavior.
- Malformed/mismatched/excessive successors and orphan recognized edges refuse;
  incomplete private staging never becomes state or vetoes an unrelated slot.
- Real receipt creation followed by terminal-link failure; proof retained,
  state not falsely green, no second receipt invocation.
- Native Linux and Darwin filesystem publication/closure behavior, separately
  from simulated observer branches; no claimed Windows qualification.

## Why not SQLite for this cut

better-sqlite3 is already a production dependency. A single conditional UPDATE
inside a transaction would simplify compare-and-set and dead-owner recovery.
However, publication currently owns JSON and has no existing SQLite table or
database lifecycle. A new table needs one-time historical import, atomic
admission, schema ownership, dependency/bootstrap behavior, backup/evidence
custody and all-reader conversion. Maintaining JSON as a live fallback would
violate the requested single path. The existing dependency alone does not make
that change free or authorized by the held broader SQLite migration.

The finite representation changes storage shape inside the existing owner
without adding a new database substrate. That is the smaller proposed tradeoff,
subject to independent review and physical evidence. If its bounded graph/reader
cost proves materially greater than an explicitly scoped SQLite conversion,
the integration owner should state that scope decision before implementation,
not silently rebrand it as this file-race repair.
