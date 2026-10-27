# U1 v3 addendum: total physical observation and bounded coordinator admission

Status: **PROPOSED for independent review, not implementation approval.**

Author: `subagent:/root/u1_inventory_lifecycle`, 2026-10-18.

This append-only correction addresses root review D2/D3 of v3, SHA256
`6f010cc376fd3ff6bd0d7d07892636967eb3ad343915364f4c80a35c5450c048`.
It supersedes only the conflicting sentences identified below; v3 and all
earlier review records remain unchanged. Approval binds v3 plus this addendum.

## D2. One total synchronous physical-current observation

Replace v3 section 7a's ambiguous “ABSENT (no registered live creation)” with
the following ordered table, owned and evaluated synchronously by
`WasmServiceLifecycle`:

| Observation | Canonical result | Meaning for consumers |
| --- | --- | --- |
| Lifecycle admission is closed, dependency unavailable, or requested origin cannot be captured/validated | UNAVAILABLE, with the owner's typed reason | No current projection claim or bookkeeping deletion. Physical shutdown remains the owner of admitted work. |
| No object is registered in `activeReplicas` for the requested service | ABSENT | The active entry was surrendered; this says nothing by itself about journal/resource finality or retained cleanup debt. |
| An object is registered but its full original intent/token differs | DIFFERENT | The requested creation owns no canonical projection. The registered successor is protected even if its own lifetime is already fenced. |
| The exact origin is registered and the physical owner's live predicate is true | CURRENT | An immediate projection of this exact creation may be written, without an intervening await. This is no future-effect permit. |
| The exact origin is registered but is not live | UNAVAILABLE, with the existing retired/stopping reason | Its active entry has not been surrendered. A consumer cannot infer absence or delete bookkeeping from its fenced state. |

Manager, driver, runtime and handler consume this same result. None broadens
ABSENT to include a stopped-but-registered object. Exact by-path retirement
can proceed when it owns neither canonical entry; its physical and journal
finality remain separate results. On orderly shutdown the closed lifecycle
may answer UNAVAILABLE even after its map has emptied; the driver's existing
successful full shutdown clears its own maps only after joining physical
custody, independently of this per-creation projection observation.

Retirement cleanup may delete service-keyed driver bookkeeping only when its
stored prepared full origin still matches and the immediate result is
ABSENT. A matching token alone is insufficient when the retained intent is
different. Completion of an old journal never authorizes deleting another
origin's bookkeeping.

Binary additions: observe each row of this table using real lifecycle
objects, including exact STOPPING/CLEANUP_REQUIRED still registered,
different stopped entry, and a closed lifecycle. A mutant treating `!live`
as ABSENT must fail; omission of the full intent comparison must fail.

## D3. Bounded coordinator observer and exact admission semantics

Replace the unbounded implication of v3 section 6's coordinator-joins clause
with these limits on the existing installed canonical gate entry:

1. A startup plan holds at most one queued admission marker and one applicable
   pending-wake bit. Repeated calls mutate those fields; they attach no new
   `.then` listener, callback, promise resolver, or queue node.
2. Every admitted retirement has exactly one physical execution entry. A
   coordinator-owned entry already has its one request operation ID. A
   startup-owned entry may additionally accept **one** coordinator observer,
   stored directly on that same entry with its request operation ID, captured
   original creation ID and canonical request fields.
3. The first exact same-origin coordinator REMOVE to a silent startup
   retirement may occupy this one observer field and receives IN_PROGRESS.
   Settlement emits one result under that admitted coordinator request ID;
   the startup remains silent. The same immutable coordinator request
   coalesces and receives IN_PROGRESS without adding state.
4. A different coordinator request while that observer is occupied is not
   admitted. It receives the existing typed ERROR response shape with
   `RETIREMENT_IN_PROGRESS` and `deferRetry: true`, no executor outcome and no
   retained observer. Its caller owns retry after the busy gate can settle.
   The same rule applies to another coordinator request while a
   coordinator-owned retirement is in progress. Equal request IDs with
   conflicting canonical content receive CONTENT_CONFLICT instead of
   joining.
5. A coordinator REMOVE finding an admitted CREATE cannot consume its result
   as retirement. It receives a typed retryable busy refusal before any
   removal admission, memo change or executor obligation. The response names
   the existing operation-in-progress reason; the original caller's next
   explicit retry is the trigger. Startup plans which were already retained
   continue to wait for that exact gate's single settlement through their
   bounded plan marker.
6. The gate's one settlement function applies physical/journal result to its
   own plan and at most one coordinator request, checks live handler and
   exact installed entry identity, then releases the slot and considers
   already-marked plans. No admission promise is held for future retries of
   an unresolved collaborator. Thrown-error settlement follows the same
   release discipline.

This retains the existing handler gate and its ordinary one-admitted-request
semantics, with one explicitly bounded observer for the startup-first race.
The bound is independent of request count: for N inventoried obligations and
G admitted canonical executions there are at most N pending plan markers,
N wake bits, G execution entries and G coordinator request identities. There
is no request-sized observer array, new queue owner or durable store.

Binary additions: repeat a matching coordinator request many times, then
submit distinct request IDs while its observer is occupied. Observe exactly
one admitted coordinator result and no state growth; verify all refusals are
typed and their IDs are not later emitted. Then release the gate and show a
previously refused request can be admitted normally. Exercise coordinator
and startup admission in both orders, plus REMOVE during CREATE.

## D3. Direct CREATE naming an inventoried RETIRED plan

Replace the corresponding v3 section 4a IN_PROGRESS response with a typed
ERROR response carrying `RETIREMENT_IN_PROGRESS` and `deferRetry: true`.
The same request is allowed to trigger one silent retry of the already owed
RETIRED plan, but it does not admit a CREATE execution and never reopens
storage. There is no promised later CREATE executor result for that refused
request. The response explicitly leaves any coordinator retry with its
caller; the original journal and retained plan continue to own retirement
completion. If its journal has already been confirmed terminal, the ordinary
journal terminal answer is returned through the existing CREATE route with
zero physical effect.

This is an explicit narrow amendment of the retained-plan table, not a
silent acknowledgment followed by indefinite missing completion. The
original startup continuation remains silent. A coordinator which intends
retirement uses canonical REMOVE and the bounded observer admission above.

Binary addition: redeliver the original CREATE while its RETIRED plan is
waiting for journal completion. Assert the synchronous typed refusal,
exactly one permitted housekeeping attempt, no new CREATE physical call,
no CREATE executor result, and eventual original journal completion after
the declared prerequisite returns.
