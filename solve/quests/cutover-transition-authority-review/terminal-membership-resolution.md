# Terminal membership resolution

Status: bounded response to review 5455292026, comments 4217881185 and
4217881271. This clarifies the existing FreshMG separation contract. It is
not independent acceptance, terminal C0 closure or planner/handler activation.
It takes precedence over an implication that ordinary terminality prevents
all membership reconciliation. Historical failed and incomplete claims remain.

## T0: terminal before any membership action was authorized

The existing ReplicaOperationRepository gains the subordinate operation
`settleMessageGroupMembershipNonAdmission`. It reads the exact operation
through OWNER_RPC_REQUIRED/REQUIRED, checks its own bound current canonical
node boot, and may monotonically settle an initial terminal operation. It
never acquires a new execution claim or dispatches anything.

Required row: exact REPLACE O/group/S/T/source-lifecycle tuple and retained
membership lane; canonical terminal status/step with a positive completed_at;
learner_requested / intent_recorded; NULL membership permit and learner/voter/
removal stamps. With NULL holder, no distributed work has been authorized and
no holder is required merely to record this definitive non-admission. Any
current repository owner instance reached by the existing membership-debt
reconciler may try this same conditional update. With an existing holder,
that exact holder must be local, current and live; otherwise the existing
claim takeover operation runs first. No caller chooses an owner, clock or
cleanup token through this method.

One UPDATE is the commit point: set membership_lane_key=NULL and
membership_obligation_state=definitive_non_admission, matching the complete
observed immutable identity, source lifecycle claim, holder, initial phase,
intent obligation, NULL action/stamps, ordinary terminal status/step and exact
completed_at. It changes no other field. Renewal or initial claim/action
competition defeats the stale predicate; terminality defeats any delayed
nonterminal admission CAS. Different successors may both observe the already
settled result, but the state changes at most once and no result is an
external execution grant.

A lost reply is resolved only by the exact terminal row with the same
identity/source claim, NULL lane, definitive_non_admission and still no action
or stamps. An old retained row is UNKNOWN, not a cancellation proof. An
unavailable or inconsistent observation gives no new permission. A stale boot
may not use the response to progress. This case requires no membership REMOVE:
there was no durable authorization to propose ADD/PROMOTE. NULL holder with
any action/stamp is inconsistent and remains a refusal, not T0.

The existing OperationWorkflowOwner's membership-debt reconciliation entry
owns retry/wakeup and calls T0 before generic orphan lease touching or active
operation dispatch. Ordinary terminal scheduling remains suppressed. Wiring
that entry remains required product work; a row-only test does not prove it.
No separate resolution lease, queue, store or cleanup authority is introduced.

## T1: terminal after learner commit, before either branch was selected

A current claimed holder must resolve the already admitted learner obligation
without reviving ordinary operation execution. The permitted next branch is
pre-promotion target abandonment: REMOVE exact T, preserving exact S.
PROMOTE remains forbidden from an ordinary terminal row. The existing
`selectMessageGroupMembershipBranch` operation will support this resolution
arm by matching the exact terminal status/step/completed_at in place of its
normal nonterminal guard, while retaining every learner-stamp, prior-permit,
identity, claim, no-voter/removal-stamp and boot predicate. It updates only
membership phase/permit/debt, never status, completed_at, reservations or
cleanup claims. This is an explicit missing implementation, not a claim that
the current method already accepts terminal reconciliation.

Promotion and terminal settlement remain serialized by the operation row:
if promotion authorization committed first, J1 retains forward recovery;
if terminal settlement committed first, delayed promotion selection against
the nonterminal basis loses and only the exact terminal abandonment arm may
win. Current-holder branch selection does not itself authorize physical
removal: the runtime still checks the exact action, term/configuration,
permanent identity and current execution holder. One absent configuration
observation does not cancel a possibly issued action.

## T2: terminal with an issued action or selected forward branch

Retain the immutable action context and lane; use existing holder takeover to
resume only that membership obligation. Do not run T0 or select the opposite
branch. Before learner commit, unknown ADD is reconciled by exact operation/
configuration context; after PROMOTE authorization, resolve forward under J1;
after source removal, preserve T and finish exact S cleanup. Runtime receipts
resolve membership debt and source-own absence separately. The pending driver
and stage-settlement methods must implement these already-classified facts.

## Required proofs and current ceiling

T0 tests use canonical schemas, actual repository SQL and file-backed SQLite:
terminal-first NULL holder; already claimed terminal with current vs stale
holder; exact replay/lost answer; competing settlers; issued action racing
settlement; unknown/stale identity; invalid terminal timestamp; and a later
same-group operation admitted only after the exact lane is released.
T1 tests require terminal-before-selection, promotion-before-terminal, stale
preterminal promotion racing exact terminal abandonment, holder takeover,
and unchanged ordinary state. Keep original FreshMG failure controls.

The first increment implements T0 only and leaves T1/T2 explicitly pending.
C0 replacement/snapshot/independent-review receipts remain false. The source
increment will have its own exact-head review; this document does not grant
any membership runtime or physical CREATE permission.
