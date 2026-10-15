# Pre-vet choice: retirement with one durable recovery handoff

Baseline c425ef42e18236ff1187e1112a971588bb02b496. Design only; no production
changes. This draft is preserved even if independent vetting corrects it.
The former fixed-cell RETIRE(G) proposal and its failures remain unchanged.

Choose a generation handoff inside the existing result owner's single
retirement cell. RETIRE_FOR_APPROVE carries one complete immutable APPROVE
for G+1, prepared by the existing release continuation. At ordered application,
retirement advances G, retires eligible old result history, reserves one A
result entitlement and one future command occurrence for that exact K, and
persists the handoff bytes in the same transaction. That commit establishes
the designated recovery opportunity. It does not approve release.

The cell contains (a) the last immutable retirement receipt and (b) the current
handoff, either NONE or exact pending K/bytes/G/charges. They are different
facts. Completing the handoff does not rewrite the original retirement result.
This is one explicitly new durable recovery obligation under an existing owner,
not an unbounded queue or independent permit service. Its extra bytes must be
charged explicitly; the prior 4 KiB receipt-only proposal cannot hold a complete
16 KiB request plus metadata. No old numeric bound is declared adopted.

While that handoff remains pending, ordinary APPROVE requests may use only
unreserved A capacity, and routine RETIRE is NOT_ADMITTED with a pending-handoff
reason before core creation. The same current-leader gate covers local and
forwarded proposals, after inbound drain and applied-prefix reconciliation.
Only the recorded K may use the handoff's reserved command/result entitlement.
An already admitted K delayed before core acceptance cannot lose its generation
to routine retirement. All service of K uses its original bytes. Repeated calls
join; no extra semantic result allocation occurs. Duplicate physical occurrences
remain charged independently until their actual discard or application.

K applies using every ordinary D2 predicate at its actual committed position.
Whether APPROVED or an exact deterministic refusal, one SQLite commit writes
its result, any release-state transition and applied position, and clears the
pending handoff. Environmental apply failure rolls all of that back and retains
the debt. Lost response changes no durable fact. A legitimately refused K is
finished; later valid intent requires a new request and a new ordered handoff.

Necessary HOLD, authoritative settlement, replication, consensus no-ops and
configuration progression do not wait for this handoff. Genuine origin/state/
membership/prerequisite changes may therefore make K fail legitimately. No
serving-open or query-discharge predicate gates delivery of K itself: the
application checks discharge and may refuse it. D3 cannot supply replicated
effects. The existing recovery continuation must read pending handoff FIRST,
before its present build/census/OPEN early exits, and redrive the exact K.

Sources: createParticipantReleaseRecovery/reconcile in
src/node/replica-handler-release-recovery.js:95,189-224; enqueue/dispatch and
service/consensus wakes at :141,:226,:251; runCutoverAttempt in
replica-handler-participant-cutover.js:247; runtime serialized execution,
inbound drain and proposal at raft-rs-runtime-owner.js:956,:1650,:1691,:1727;
Ready :1191; durable suffix replacement raft-rs-durable-store.js:404,:422;
atomic apply raft-rs-application-transaction-owner.js:51; exact result adapter
partition-committed-statement-outcome.js:109,:137,:288. Those are current
functions. Handoff read/apply/event and complete custody interfaces are NEW.

Recovery is level-triggered by the durable pending handoff, through the existing
release continuation's bounded per-partition work. Applied-progress/service/
consensus wakes and existing recovery cadence trigger the same read/drive path;
restart scans current hosted partitions without requiring client retry. A caller
deadline detaches its waiter; it cannot erase the handoff or consensus debt.
No new timer duration or second workflow algorithm is proposed.

On leader loss before the retirement is ordered, no durable designated
opportunity has yet been established; its original request remains unknown
until the runtime proves its custody/discard. The maintenance lane has one
pending identity across core/Ready/suffix, reconstructed before admitting a
different candidate. A live process-map miss proves nothing. On loss after
retirement commitment, a successor must apply the retained prefix and rebuild
the handoff and all occurrences before new admission. It redrives exact K if
not already ordered, joins if pending, or observes its exact result if applied.
Even authoritative discard of a K log occurrence does not discard the already
durable handoff: release that occurrence's charge, retain the handoff obligation,
and re-propose the same K under the existing owner. This explicitly preserves
an acknowledged recovery operation rather than treating discard as approval.

One bounded service opportunity must be allocated in the existing runtime
scheduler for the handoff's exact K, independently of normal ingress. The
durable cell determines eligibility, not a caller priority flag. A bounded
round-robin between already-owned recovery/closure/settlement and ordinary work
can provide service without blocking those other lanes. It remains an explicit
new scheduler interaction, not a claim that today's Promise tail is bounded.

Progress measure after the handoff commit: K moves through not-yet-ordered,
core/Ready/suffix, committed, applied disposition. Routine retirement cannot
reset G while pending, and competitors cannot acquire its entitlement. Under
eventual stable leadership/quorum, writable storage, bounded scheduler service
and eventual native replication/application, finite predecessor work completes
and K receives its exact result. Stable valid D2 prerequisites make that result
APPROVED; a real predicate change may produce a refusal. Arbitrarily repeated
leader failures or permanently stuck I/O are outside that conditional claim.

Initial attack questions for vetting: competing retirement candidates and exact
conflict outcomes; legitimate stale maintenance already in consensus; protected
entitlement reconstruction after crash; recovery service fairness vs merely
admission priority; orphan handoff before core; repeated suffix discard; normal
APPROVE competition; receipt replacement and old-request uncertainty; fixed
encoding/accounting; native follower backlog and snapshot dependency. Enumerate
all defects, not just the first. A new persistent field is not unchanged behavior.
