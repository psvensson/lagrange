# Lagrange: adversarial architecture review

**Date:** 2026-10-20  
**Status:** design investigation, not independent implementation approval  
**Inspected product:** `be25caa5f0c3612feec662d4feaa9ba28f8f34df` (`work/u1-integration-candidate-20261020` when read)  
**Scope:** test proposed architectural ideas against existing authority contracts, inspect representative owner interactions, compare primary research, and execute small explicit-state counterexample models.

No production source or acceptance contract was changed. No Lagrange source suite, physical lab cluster, or GCP distributed scenario was executed for this review. The included Python models do not import or simulate Lagrange's complete implementation. Their counterexamples refute particular proposed rules under their stated premises; they are not evidence that the same interleavings are reachable in production.

## 1. Revised conclusion

The strongest direction is **to complete and simplify existing owner interactions**, not introduce a new control plane, universal workflow engine, metadata database, or epoch system.

The earlier proposal should be corrected in three respects:

1. Much of it is already explicit policy or implemented mechanism: restricted bootstrap, durable operation history, owner-key reconciliation, level-triggered REPLACE wakeups, and separate physical-generation fences.
2. Recording a decision is not sufficient to authorize a later effect. Admission, current resource identity, shared budgets, uncertain completion, and disposal all require their own existing authorities.
3. Not all decisions should be durable. The system should retain accepted obligations and safety-critical facts, while reconstructing disposable execution state. Persisting explanations of other ledgers creates competing authority and additional failure modes.

This is not a finding that every historical failure has one root cause. No claim here establishes the root cause of the observed `current_control_owner_fact` refusal.

## 2. Principles that constrain any solution

The inspected system model states: durable application and cluster state live in tables; partitions are the distribution/consensus unit; replicas have physical SQLite/Raft state; Cells are disposable computation without per-service consensus logs; normal routing uses CDC-fed local views; placement is continuous. There is no separate metadata database or request-time global topology lookup.

The authority contract adds: one semantic owner per fact; owner interactions are contracts; derived state cannot authorize irreversible work; fresh storage, intact restart, destructive loss and unavailable evidence differ; bootstrap is a smaller operating mode with an explicit handoff; events/timers/scans converge on one algorithm; failure closure retains acknowledged obligations; different completion lifetimes must not be conflated.

These yield the following evaluation criteria, not new runtime objects:

| Criterion | Required property |
|---|---|
| Authority | One producer and canonical interpretation of each fact; no consumer re-derives its owner's policy. |
| Ordering | An effect has an identifiable authoritative admission/commit point; prechecks cannot be substituted for effect-boundary enforcement. |
| Recovery | Discarding volatile state cannot widen permission, erase committed outcomes, lose obligations, or resurrect terminal work. |
| Locality | Ordinary reads/routing and partition work do not gain a global control-plane round trip. |
| Boundedness | Queues, admitted work, retained results and retry effort have named owners and explicit bounds without dropping accepted work. |
| Evidence | Present records, authoritative absence, temporary unavailability and known conflicts are different outcomes. |
| Proof | A small abstract safety check, a source-boundary witness, a reachable production interleaving and a real distributed run have different ceilings. |

## 3. Proposal dispositions

| Earlier idea | Disposition | Compatible refinement |
|---|---|---|
| Minimal bootstrap authority | **Retain objective; reject a new parallel authority.** | Existing owners recover from their validated minimal roots before external traffic admission; explicit one-way handoff ends bootstrap-only access. |
| Durable placement authorizations | **Already partly implemented; refine, do not duplicate.** | Existing operation-history authorization, canonical decode, current membership/target checks and one owner of capacity/concurrency. |
| Uniform reconciliation framework | **Reject a second engine.** | Existing OwnerKeyReconcileQueue and operation owners; verify input coverage, dirty retention, remote wake, restart census and fairness. |
| One physical/global generation | **Reject collapsed identity domains.** | Existing owner-defined generation dimensions remain distinct; enforce the relevant exact identity at each sink. |
| New transaction decision subsystem | **Not justified.** | Complete the existing TX1 decision/participant/application/result contracts, including topology handoff and garbage collection. |
| Monotonic observations and one CDC cursor | **Split the proposal.** | Accumulate scoped facts; reject a global maximum across independent streams and do not mistake monotonicity for freshness. |
| Deterministic simulation and small formal models | **Retain with proof boundaries.** | Reuse the existing harness/clock/owner seams; couple abstract properties to source-bound adversarial witnesses and distributed evidence. |

### 3.1 Bootstrap: remove circular admission prerequisites, not legitimate feedback

A blanket requirement that the entire architecture be a DAG is wrong. Placement, publication and observation naturally form feedback loops. The graph that must be examined is the graph of **blocking prerequisites** for recovery actions.

A hypothetical cycle is: minimum control fact needs traffic readiness; traffic readiness needs configured spread; spread needs participant release; participant release needs that control fact. The included model deadlocks from its initial state. Adding another polling timer changes no enabling condition.

The revised abstraction permits recovery of the existing metadata owner from validated durable roots and a usable quorum, then the existing participant release and spread operations, and only finally traffic readiness. Its success does not waive the configured spread requirement. The three-host requirement in the model is an explicit example, not a new universal product minimum.

For Lagrange this means inspecting the first refusal's actual producer and constructor/handoff path. Separate administrative progress from external traffic permission without adding an independent readiness truth. Fresh initialization must use genuine fresh-storage authorization; a timeout reading an existing group is not permission to found another one. An intact cold restart must not require a serving leader before the group may recover/elect one.

FoundationDB demonstrates ordered recovery and recruitment, but its singleton cluster controller and unbundled transaction roles are not a blueprint to copy wholesale into Lagrange [P1]. Reuse the lesson about recovery dependencies, not an additional permanent metadata service.

**Required production evidence:** fresh startup, intact all-node restart, one unavailable metadata owner, destructive storage loss, interrupted bootstrap handoff, and loss of a wake. The original authorization/quorum/readiness invariants must hold in every scenario. A concrete dependency cycle must be traced before changing an owner contract.

### 3.2 Placement: the durable carrier already exists

At the inspected source, `spread-cure-transition-authorization.js` carries an exact transition in the existing operation's first `steps_history` metadata record. It distinguishes ABSENT, PRESENT and MALFORMED. It also explicitly documents a bounded carry stage in which the membership fence was not read/evaluated, yielding `MEMBERSHIP_FENCE_NOT_EVALUATED` rather than HONOURED. This is not proof that any downstream unsafe promotion is reachable; it is a clear boundary that must not be silently promoted into a stronger guarantee.

Consequently, do not introduce the earlier illustrative authorization object as a second stored record. Determine which existing authority supplies the relevant membership version, and whether that version means policy publication, committed Raft configuration, or a physical lifetime. Those domains must not be equated merely because each is called an epoch.

A complete refinement needs three distinct decisions: placement policy sanctions the intent; the existing membership owner validates the safe consensus transition; the physical owner admits the exact target. The interaction must make it impossible to spend one shared overflow allowance twice. Two separately valid operations can each read one free slot and together exceed the cap. One owner must serialize/reserve that capacity, or an independently designed allocation protocol must partition credits. Merely serializing each operation ID independently is not sufficient for a shared partition-level bound.

The invariant-confluence research gives the general criterion: individually valid concurrent states need not remain invariant-valid when combined [P2]. Learners and verified promotion in etcd illustrate separating catch-up from voting-membership changes [P3]. Neither authorizes bypassing Lagrange's own membership owner.

REMOVE-first is not the default repair. It conflicts with the current successful-replacement ordering unless explicitly superseded and proven. In a three-voter group, removing one healthy voter before establishing its successor leaves no tolerance for another voter failure.

**Required evidence:** two concurrent ADDs sharing one allowance; stale policy versus current membership; conflicting request with same ID; lost admission reply; restart after reservation; exact-target replacement; and source retirement only after the sealed target/handoff prerequisites.

### 3.3 Reconciliation: complete the existing mechanism

`OwnerKeyReconcileQueue` is already the documented progression entry. The REPLACE wake module already captures the waited-on level before reads, registers/rechecks, retains dirty work while a turn is held, forwards remote-owner wakeups and limits reruns before returning to its existing timer. Its source deliberately excludes the owner's own output from the observed input level to avoid self-waking loops.

The included lost-wake model reproduces the ordinary read/register race and removes it with register-and-recheck. That validates the necessary pattern, not Lagrange's entire implementation. Its premise is reliable delivery to installed subscribers. Lost notifications or a crash require reconstruction from the existing durable operation plus a fair recovery trigger. A timer can be one legitimate trigger of the same algorithm; a timer must not become a second authority or infer completion from elapsed time.

The open questions are precise: are all inputs that can unblock the operation included; does a remote change reach the owner; can a held queue lose its dirty indication; can shutdown leave a post-lifetime continuation; does recovery rediscover every unfinished admitted obligation; does overload leave critical progress runnable?

**Required evidence:** prerequisites change before subscription, during registration, while execution is held, after response loss, and across restart. Duplicate/coalesced events must not duplicate effects. Dropped callbacks must not erase work. Test stable prerequisites and a genuinely fair execution path, not a magic count of `setImmediate` turns.

### 3.4 Physical currentness: fence the actual effect

A caller checking that generation 1 is current, followed by a delayed `STOP(logical-name)`, is unsafe if generation 2 takes over before the sink resolves the name. Checking again after STOP cannot undo destruction. The effect model supplies exactly this counterexample.

The correction is an atomic relationship between exact-generation validation, admission to the physical effect and custody of its resources. This may be implemented by a serialized owner or a captured exact resource handle with replacement correctly joining outstanding work. It must not be an unbounded lock held across unrelated network calls. Pending native effects remain owned after a caller deadline; cancellation does not prove they stopped.

The generic runtime REMOVE caller at the inspected source checks its installed entry and admitted memo before and after `stopReplica`. That is valuable, but it does not by itself prove how the lower adapter selects a physical object after asynchronous suspension. The current review ceiling remains: a real lower-owner test must establish that the abstract race is excluded or reachable.

Chubby's sequencer design makes the recipient validate authority rather than relying on the sender's previous possession of a lock [P4]. Borrow that boundary principle, not a new lock service.

The participant-release code already distinguishes owner, lifecycle, runtime, SQLite connection and admission generations. Keep them separate. Raft term changes leadership within a group; it is not proof a particular file or service object was replaced. A cluster-wide epoch would unnecessarily invalidate unrelated groups and still would not automatically protect the final effect.

### 3.5 Transactions: separate immutable decisions from live actor permissions

The existing authority contract explicitly states that lease expiration does not erase committed facts. The model demonstrates why: commit is durably decided by coordinator generation 1; coordinator generation 2 recovers; rejecting the old durable COMMIT solely because its issuing coordinator is stale loses a recoverable decision. This counterexample is a recovery-obligation error; the model does not fabricate a contradictory ABORT.

The logical transaction identity and its prepared participant/statement manifest must survive coordinator replacement. Participants may be accumulated before the appropriate prepare/freeze point; no proposal here freezes an incomplete manifest at BEGIN. A new coordinator's permission to drive recovery is independently fenced. Recognizing an old valid decision does not reactivate the old actor.

Replicated decision recovery does not imply progress through permanent quorum loss. Gray and Lamport's comparison of transaction commit protocols identifies fault tolerance and blocking conditions that must be stated, not hidden behind retries [P5]. CockroachDB's STAGING state is backed by a specific distributed recovery rule over the exact in-flight writes; copying the label without that protocol is not a shortcut [P6]. Preserve Lagrange's stated snapshot-isolation/first-committer-wins semantics; no review here establishes serializability.

A stronger invariant is needed across split/merge and migration: current owners must recover both the data and the evidence that prevents replaying an already applied logical operation. The migration model shows data-only handoff followed by a lost-response retry applying the mutation twice. A reference to an authoritative surviving receipt owner can be valid; physically copying everything everywhere is not required. Routing/cutover must not expose a successor unable to resolve the receipt.

RIFL identifies durable completion records, atomic mutation/result recording, retry rendezvous after migration and safe metadata reclamation as separate requirements [P7]. Apply these requirements to the current native apply/SQLite/TX1 owners rather than introducing an independent wrapper ledger.

Bounded result storage creates another obligation. Deleting a result at a local TTL while continuing to accept the old request identity lets a delayed retry execute again. The model confirms it. Safe GC must be tied to an authoritative acknowledgement/identity-retirement protocol or equivalent guarantee. After evidence is legitimately retired, returning typed expiry/ambiguity can be correct; silently executing the old identity as new work cannot.

**Required evidence:** crash after durable decision before client reply; crash after local apply; takeover during uncertain prepare; exact body/manifest mismatch; split/merge while prepared; result receipt transfer; old retry after GC; and transient authority unavailability. Terminal decision, client knowledge, local apply and cleanup completion remain different facts.

### 3.6 CDC: scoped progress, not a global maximum

Independent streams can have positions A:100 and B:1. A single global maximum of 100 wrongly suppresses B:1. The included model demonstrates the omission and the per-stream correction.

A cursor must identify its stream/group and lineage, with an owner-proven snapshot/replay boundary. Split/merge needs explicit coverage transfer from old lineage to new lineages. A high-water mark or HLC conflict order alone cannot prove no update was missed. Gaps or compacted history must route to the owning resynchronization path; absence in an incomplete cache is not an absence certificate.

Kubernetes provides a versioned list/watch model and explicit handling of expired history [P8]. Lagrange can use that handoff principle without assuming its independent Raft groups share Kubernetes's resource-version domain.

CALM concerns confluence of monotonic computations in its model [P9]. It does not prove current permissions, linearizable reads, global capacity constraints, bounded GC or a fresh complete snapshot. Accumulating generation-qualified evidence is helpful; declaring absence or revoking resource ownership still needs the relevant coordination contract.

## 4. Executed model results and exact ceilings

The included script uses exhaustive breadth-first enumeration. The names “defective” and “repaired” describe authored abstractions, **not repository revisions**. Each revised abstraction engages a positive outcome; none of the repairs merely disables all actions.

| Model | Defective reachable states | Defective violation states | Revised reachable states | Revised violation states |
|---|---:|---:|---:|---:|
| bootstrap circular prerequisites | 1 | 1 | 7 | 0 |
| effect-boundary physical fencing | 7 | 1 | 7 | 0 |
| shared overflow budget | 13 | 1 | 13 | 0 |
| read/register lost-wake interval | 12 | 1 | 11 | 0 |
| historical decision vs current permission | 5 | 1 | 5 | 0 |
| replay evidence through topology handoff | 4 | 1 | 4 | 0 |
| incomparable CDC positions | 5 | 1 | 4 | 0 |
| bounded replay metadata | 4 | 1 | 4 | 0 |

These are deliberately small necessary-condition models, not estimates of production state-space coverage. They prove neither unbounded liveness nor production reachability. The runtime/IO atomicity, authoritative roots, correct identity capture, fairness and notification assumptions are premises to be verified in real-owner tests.

### Shortest counterexamples

**M1: bootstrap circular prerequisites**

initial

Assumptions: Four state variables; safe intact root storage and quorum already available; three required hosts. The bad model requires traffic-ready to recover metadata. The repair changes only that dependency.

**M2: effect-boundary physical fencing**

initial → caller checks grant for generation 1 → resource owner installs generation 2 → late STOP resolves logical name to current generation

Assumptions: Two generations, one delayed effect, one replacement. Repair serializes exact-generation validation with the sink effect; a separate pre-check would not satisfy this model. Positive coverage requires an actual effect on generation 1, not merely a safe refusal.

**M3: shared overflow budget**

initial → operation 0: read unreserved spare credit → operation 1: read unreserved spare credit → operation 0: consume captured allowance → operation 1: consume captured allowance

Assumptions: Two distinct operations, one spare slot, no release/restart. Repaired reservation is atomic, stored by the existing budget owner, and uniquely keyed by operation.

**M4: read/register lost-wake interval**

initial → read authoritative prerequisite → authoritative prerequisite becomes ready; notify current subscribers → register waiter → sleep without post-registration recheck

Assumptions: One readiness transition, reliable callbacks to registered listeners, one dirty bit. Crash or dropped notifications require an additional fair rescan; this model does not certify those.

**M5: historical decision vs current permission**

initial → commit decision becomes durable under coordinator epoch 1 → coordinator replacement advances scheduling epoch to 2 → replacement rejects known commit because its issuing epoch is old

Assumptions: One immutable transaction identity/manifest, two coordinator epochs, one known durable COMMIT. The repair preserves the commit fact, not the old coordinator's permission to initiate new effects.

**M6: replay evidence through topology handoff**

initial → parent atomically commits write and result receipt; reply lost → publish child with rows but without replay receipt → retry identical logical request at new owner

Assumptions: One request, one split/migration, one lost reply. Initial apply/result storage is atomic. Repair retains replay evidence with data before ownership publication; GC is a separate obligation.

**M7: incomparable CDC positions**

initial → deliver stream A sequence 100 → deliver stream B sequence 1

Assumptions: Two independent ordered streams with one valid unseen event each, positions A:100 and B:1. No global total-order owner exists. Stream incarnation/lineage changes are not modeled.

**M8: bounded replay metadata**

initial → apply write and retain replay result; reply lost → collect result after local timeout; leave identity usable → retry missing record as new work

Assumptions: One request, one retention expiry, one delayed retry. Demonstrates that receipt GC must be coupled to identity retirement or an equivalent authoritative retention protocol; cannot promise unlimited replay with finite evidence.

## 5. What the research does not settle

A valid algorithm in another system is not evidence that Lagrange implements it. Likewise, source comments may describe a deliberately bounded stage, not final acceptance. This review rejects certain general rules, but does not prove that the current `current_control_owner_fact` failure is a bootstrap cycle, that the generic STOP race is reachable, or that receipt migration is broken in the current TX1 code.

Safety, recovery progress and performance need separate verdicts. Progress requires eventually available authoritative dependencies/quorums, stable enough topology, and a fair scheduler with resources reserved for convergence. An immutable obligation can remain safely blocked indefinitely during permanent failure; silently dropping it to satisfy a resource bound is not acceptable. Bounds should refuse new work before acceptance, coalesce duplicate wakeups and preserve admitted work through its proper durable owner.

Scalability is not measured here. The compatible target is partition/owner-scoped work and affected-waiter wakeups, with bounded fair scans of outstanding debt. Do not introduce a global admission RPC on every SQL request, scan every operation on every event, or claim a 1,000-node throughput result from these abstractions.

## 6. Proposed next bounded verification unit

The highest-value next unit is the **existing participant-release/control-authority interaction**, not a new bootstrap service.

Its review record should enumerate: the first unavailable fact; its actual producer and durable origin; the existing recovery path that can establish it; each blocking prerequisite; currentness checks before effects; the owner of every rejection/unknown result; and the trigger that makes the outstanding debt discoverable after restart.

Accept the design only when an existing-owner composition demonstrates: recovery from intact roots without traffic-readiness circularity; no authority created from missing/unavailable data; exact-generation and committed-membership checks; retained continuation across dropped notifications and restart; external traffic still barred until the configured prerequisites; and deterministic rejection by a deliberate source regression. Then repeat on the exact integrated source with the existing distributed harness. That ladder is separate from the full U1 55-item and release gates.

For each later interaction, use the existing contract-first format:

`trigger -> authoritative facts -> authorized action -> actual durable commit -> lost-answer/restart behavior -> remaining obligation/release owner`

Do not turn that documentation schema into a new universal runtime state machine. Named owners continue to own their different policies and lifetimes.

## 7. Source manifest

`source-manifest.json` lists the exact inspected source blobs and line ranges. Repository rules/contracts, not this note or remembered history, remain authoritative. The analysis is pinned to the U1 source above, not a claim about every branch or the current release.

## 8. Primary references

[P1] FoundationDB Architecture (official documentation): https://apple.github.io/foundationdb/kv-architecture.html

[P2] Bailis et al., Coordination Avoidance in Database Systems (Extended Version), 2014: https://arxiv.org/abs/1402.2237

[P3] etcd learner design (versioned official design documentation): https://etcd.io/docs/v3.5/learning/design-learner/

[P4] Burrows, The Chubby lock service for loosely-coupled distributed systems, OSDI 2006, especially section 2.4: https://www.usenix.org/legacy/events/osdi06/tech/full_papers/burrows/burrows.pdf

[P5] Gray and Lamport, Consensus on Transaction Commit, ACM TODS 2006 / MSR report: https://www.microsoft.com/en-us/research/publication/consensus-on-transaction-commit/

[P6] CockroachDB Transaction Layer, official documentation (Parallel Commits and transaction records): https://docs.cockroachlabs.com/docs/stable/architecture/transaction-layer

[P7] Lee et al., Implementing Linearizability at Large Scale and Low Latency, SOSP 2015, especially section 3: https://web.stanford.edu/~ouster/cgi-bin/papers/rifl.pdf

[P8] Kubernetes API Concepts, official documentation (list/watch, resource versions, expired history): https://kubernetes.io/docs/reference/using-api/api-concepts/

[P9] Hellerstein and Alvaro, Keeping CALM: When Distributed Consistency is Easy, 2019: https://arxiv.org/abs/1901.01930

[P10] Ongaro and Ousterhout, In Search of an Understandable Consensus Algorithm (extended version), especially sections 5.6 and 6: https://raft.github.io/raft.pdf

[P11] FoundationDB Testing, official documentation: https://apple.github.io/foundationdb/testing.html

References were consulted on 2026-10-20. They motivate specific protocol properties; none certifies Lagrange or permits overriding its sealed contracts.
