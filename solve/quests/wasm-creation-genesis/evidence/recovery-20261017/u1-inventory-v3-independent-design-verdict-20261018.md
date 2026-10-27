# U1 inventory v3: independent contract and oracle review

Verdict: **APPROVE the bounded U1 F2–F6 correction design and its required
oracles, with the v3 addendum taking precedence. Implementation and execution
evidence are not approved by this verdict.**

Reviewer: `subagent:/root`, 2026-10-18. The reviewer did not author the proposed
contract, addendum, implementation or witnesses. The implementing owner is
`subagent:/root/u1_inventory_lifecycle`. This review follows the complete
original U1 rejection and preserves that record unchanged.

## Content binding and scope

| Reviewed input | SHA256 / source identity |
| --- | --- |
| `u1-inventory-continuation-contract-v3.md` | `6f010cc376fd3ff6bd0d7d07892636967eb3ad343915364f4c80a35c5450c048` |
| `u1-inventory-continuation-contract-v3-addendum.md` | `401f90a5f09a3056573ee1d8ab8b57cee6135c721355295e0e1506ceb93303ae` |
| Original U1 source | `a251ce4fd9c980a78c0fd33d8a5f873161f90870`; preserved unchanged in `f5717e6f53a3ae18c2f470a507a180c3eca2cc17` |
| Original independent rejection | `verifier-recovery-u1-cloud/verdict.md`, SHA256 `aa5ec206809b76613f55b7547b318a3d4994757d7379d71dbd83fcc5c9b2f168` |

The review covers the full v3 contract, complete transition ledger, source
seams, witness matrix, six additional binary-oracle groups, and both addendum
corrections. It covers the nine applicable verification categories together;
the verdict is not limited to the most recently found issue. The original
55-item implementation checklist remains required at the corrected frozen
source. This design approval does not reuse its old implementation outcome.

F1 reservation finality retains its separate bounded approval. U2 production
changes remain dependent on independent approval of corrected U1. Production
recovery-reader wiring, applied publication, activation selection policy,
non-RETIRED historical-resource retirement policy, and full release or
certification claims remain outside this correction.

## Decisions and explicit supersessions

1. **One journal observation and one applied startup task.** The existing
   operation SQL owner supplies one recoverable-state SELECT. Readiness opens
   only after the complete journal/local observation has been applied. One
   failed, unapplied observation can be retried explicitly; a successful task
   is retained and cannot rescan over later live state. A closed handler never
   applies a late result or reopens readiness. This resolves both F2 lifetime
   directions without assigning authority to scan timing.
2. **Every original operation retains an exact plan.** A canonical replica
   memo cannot stand in for several journal obligations. The collision-only
   `CREATION_CONTINUATION_PENDING` projection is approved as the stated narrow
   amendment to R1-A/R1-B/R1-H. It claims no current physical creation. Every
   original intent, token or token absence, and journal debt survives the
   collision independently. No version, row order or local phase chooses a
   winner.
3. **Exact retained-plan routing has lifetime-wide precedence.** The stated
   RV6.2/RV7.3 amendment is approved for known inventoried origins, including
   after another origin owns ACTIVE, HELD or REMOVING. Incoming operation,
   service, replica and retained node identity must agree; any later supplied
   immutable body must agree through its existing capture owner. A wake is
   only a matching hint and never installs its payload token. Unknown origins
   keep the existing routing contract. Revision 5's unavailable-grant
   suppression and record-only resource-close wake remain intact.
4. **One existing canonical execution gate.** Bound CREATE, startup retirement
   and coordinator REMOVE share the handler's installed entry. REMOVE captures
   its exact target on admission. Settlement is conditional on the same entry
   object and live handler; it releases the slot before considering already
   marked plans. The addendum's one coordinator observer is the complete join
   contract. Repeated equal requests coalesce without listeners; different
   requests are refused with typed retry custody. A CREATE result cannot
   settle retirement. This addresses F3 while keeping request/result identity.
5. **One physical currentness observation, consumed immediately.** The
   lifecycle's ordered addendum table is authoritative. ABSENT means no active
   registered object; an exact stopped-but-registered object is UNAVAILABLE,
   and any different registered origin is DIFFERENT even when fenced. Manager,
   driver, runtime and handler consume that same synchronous observation.
   They do not reconstruct it from a token map, previous READY answer or memo.
   Service-keyed driver admission and post-await writes must also use it.
6. **Physical finality and original-journal completion are distinct.** FINAL
   comes from acknowledged CLOSED, or exact local RETIRED/ALREADY plus the
   authoritative HISTORY_UNAVAILABLE answer. STORAGE_MISSING does not qualify
   for the latter rule. Raw evidence remains visible and the history case does
   not fabricate `closed: true`. Runtime projects the old physical STOPPED
   state, then the original journal completion is confirmed, then the handler
   settles. An unavailable completion CAS/reread retains the exact debt. No
   new generic STOP journal is introduced. This resolves F5's missing last
   durable step without making a physical boolean prove a journal write.
7. **Admission precedes reentrant work; shutdown joins physical custody.**
   Exact full-origin retirement tasks are installed before any collaborator
   invocation. Shutdown closes admission, then joins admitted by-path tasks
   and exact replica cleanup before directory ownership transfer. A failed
   cleanup retains custody and remains visible; it does not reopen admission.
   A settled unresolved metadata answer leaves journal debt rather than an
   endlessly held physical task. This addresses F4 at the physical owner.
8. **Retries use named existing triggers.** Each inventory obligation receives
   at most one attempt per initial pass. An unresolved result releases the
   gate and waits for the stated exact redelivery, applicable wake, REMOVE
   redrive or process restart. Future PENDING work has no invented native wake
   source. The addendum's RETIRED-plan CREATE response is explicitly a typed
   retryable refusal; it may nudge one silent housekeeping attempt but admits
   no CREATE and promises no later CREATE executor result. This closes the
   draft's retry-reachability and silent-acknowledgment defects.

## Independent findings and their resolution

| Finding | Resolution in approved content | Discriminating evidence required |
| --- | --- | --- |
| D1: v2 retained a future plan but ordinary ACTIVE/HELD routing could make its exact retry unreachable or reenter the current origin instead | v3 section 4a makes the exact retained-plan lookup precede every ordinary memo route for the full handler lifetime | Real future F plus J, both scan orders, ACTIVE/HELD/REMOVING; the original F request reaches only F's journal/owner and preserves J |
| D2: “no registered live creation” could make a stopped-but-still-held object look ABSENT and permit premature driver deletion | Addendum replaces the phrase with an ordered total observation; fenced exact objects remain UNAVAILABLE, registered different objects remain DIFFERENT | All five table rows, real retained cleanup, closed lifecycle; mutation `!live => ABSENT` and omission of full intent comparison must be detected |
| D3: coordinator joining had an unbounded-observer interpretation, and RETIRED-plan CREATE could acknowledge an execution that never produced its promised result | Addendum admits one coordinator identity per installed execution, refuses excess distinct requests before admission, and gives RETIRED-plan CREATE a typed retryable refusal | Many duplicate and distinct requests with constant retained state, both admission orders, REMOVE during CREATE, and silent completion-only retry without a CREATE executor result |

## Category-complete contract review

This table is the design-level disposition of every applicable category. Each
row binds the obligations in the cited sections and their negative controls;
it is not a claim that the proposed source or new witnesses have executed.

| Category | Reviewed contract / oracle coverage | Result |
| --- | --- | --- |
| Owner interaction (10 original items) | Sections 1–2, 7–8 and transition ledger distinguish journal, resource, opening, physical custody and volatile projection owners; immediate currentness has one implementation owner; original completion requires its own acknowledgment | APPROVE design |
| Admission gating (7) | Sections 4a, 6, 7a, 10 and addendum require exact request matching, pre-effect installed entry, start-target currentness, irreversible close and typed pre-admission refusals | APPROVE design |
| Concurrency serialization (5) | Single applied inventory, canonical CREATE/REMOVE gate, captured REMOVE target, exact entry settlement, bounded observer, late-answer protection across driver/manager/handler | APPROVE design |
| Recovery replay (5) | Every original journal row retained; no new operation identity; terminal reread has no physical effect; physical completion with unknown journal completion remains replayable debt | APPROVE design |
| Transport delivery (5) | Lost answers remain explicit unresolved obligations; duplicate requests coalesce; excess requests retain caller retry custody; startup housekeeping is silent and coordinator outcomes retain their own request ID | APPROVE design |
| Harness fidelity (6) | Real SQLite single-observation witness, real opening/resource/physical owners, unchanged original failures, actual process directory-custody transfer, both enumeration/admission orders and mutation controls; component proof is not production wiring | APPROVE oracle design |
| Formation circularity (5) | No selected-version or memo winner authorizes a physical effect; no recovery metadata discovery loop; retained old admissions remain obligations; two legitimately admitted origins require their existing owner action | APPROVE design |
| Retry loops (7) | Exact-plan-first reachability, one initial attempt, bounded marker/wake state, gate release after unresolved work, existing named triggers, no spontaneous future-binding wake, unchanged unavailable-grant suppression | APPROVE design |
| Sweep/timer (5) | No new timer, polling loop or durable scheduler; shared in-flight task is applied once; failure clears only the unapplied observation; stopped callbacks/waiters cannot restart work | APPROVE design |

## Implementation acceptance still required

Preserve a test-only checkpoint before production changes. Retain the original
independent failures and explain any fixture adaptation needed by the newly
approved contract; a changed setup must not be described as a newly executed
red witness. The implementation review must cover all affected writers and
both admission orders, not only the newly added helper functions.

The full approved witness matrix and addendum additions are required, including
the shared-scan test, constant coordinator-observer bound, driver late-return
fences, reentrant task-registration order, physical-final/journal-unconfirmed
retry, and actual directory-custody join. Meaningful targeted mutations must
demonstrate these oracles fail when the owning guarantee is removed.

After source integration, independently review F1 with F2–F6 at one exact
candidate and run the required focused corpus and static gates. Do not infer
U1 approval, U2 readiness, activation correctness or release closure from this
contract-only verdict.
