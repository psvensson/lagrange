# Release linearization: transition-model addendum to revision 2

Status: PROPOSAL, addendum to
[revision 2](release-linearization-rev2-20261015.md) (preserved byte-for-byte at
`3db821fa7c12bbf05f1d878b9da6af5147417b64`). This document answers the
independent review's transition-closeout instruction: verification model and
design corrections only. **No production change, no Quest activation or
sealing, no merge, no timeout change, and no lab campaign accompanies it.**
Revision 2's text, the sealed Quest record, and the three historical witnesses
(`e15166a62`, `1994870bb`, `6a9a522d9`) are untouched. The design publication
and the D0-D4 separation remain accepted; full design approval and production
implementation remain HOLD; the prior claim that only a retention addendum
remains is **withdrawn** - items B through F each had a real defect in the
published T rows, retained below as red traces before this addendum changes
anything.

## 1. The review rejects, answered in order

| Review point | Outcome here |
| --- | --- |
| Spec preserved; counterexamples first | Section 2: rev2 rules are executable as published; the counterexamples fire as red traces against them. Nothing was silently corrected in place. |
| A-G corrected invariants | Section 4: one corrected transition table; Section 3 maps each counterexample to the row that repairs it. |
| Specification, not just the model | This addendum changes the T rows, the ingress rules (Section 5) and the successor-draft constraints (Section 6) together and consistently. |
| Liferaft references stale | Section 6: successor-draft witness and owner language now maps to the raft-rs owners and the native `raft-rs-backend` fixtures. |
| Verification and publication | Section 8: exact commands, retained evidence, finite bounds stated; no unrestricted proof claimed; no failure schedule suppressed. |

## 2. The executable verification model

Files (review branch only; nothing else changed):

- `test/model/participant-release-disposition/model.js` - the abstract
  transition system. It contains **two rule sets executable from the same
  transitions**: `rev2-published` implements revision 2 section 10 rows T1-T7
  literally (plus the D3 and D4 prose those rows cite), and
  `rev3-corrected` implements the corrected rows of Section 4.
- `scripts/checks/participant-release-committed-disposition-transition-model.js`
  - the runner. Per scenario it asserts: under `rev2-published` the required
  counterexamples MUST fire; under `rev3-corrected` every modeled invariant
  and named positive claim MUST hold.

Run:

```sh
node scripts/checks/participant-release-committed-disposition-transition-model.js \
  --evidence-dir solve/quests/seed-control-current-proof-amortization/evidence/transition-model-20261015
```

Exit 0 iff every rev2 counterexample and every rev3 expectation holds.

**Mapping to the T rows.** Every apply branch is labelled with the row it
implements (`t: 'T1'`..`'T7'`) in the model trace; command kinds map as
`RELEASE_DECISION` -> T1/T2/T3/T4/T5, `RELEASE_HOLD` -> T6, `WRITE`/`BEGIN`/
`PREPARE`/`DECISION` -> T7. D3 is a derived, never-persisted gate per replica;
D4 answers are coordinator reads at a named observed prefix.

**Abstractions** (stated, not production behavior): one shared committed log
(D1) that replicas apply in strict log order (D2); canonical command bytes are
the deterministic JSON of the command record; a census is a digest over the
replicated release state at the coordinator's observed prefix; a restart keeps
the durable replicated state and changes only the local incarnation and the
process-local gate; retention is a same-transaction sweep under a fixed
bound of 4 live rows.

**Excluded behavior**: live term/leaderId effects, transport loss inside Raft
commit, timeout machinery, wall clocks, snapshot transfer mechanics, SQL
semantics, membership changes. No `src/` import: these rows have no production
implementation to stay honest against, and this work must not create one.

**Bounds and limitations.** The exploration is a fixed set of seven finite
schedules (A-G), applied entry by entry: committed entries per scenario are
A=2, B=5, C=5 (rev2) / 7 (rev3), D=5, E=8, F=1, G=8, on two replicas, with
apply events equal to committed entries per scenario. Exactly the properties
named in Section 3 were explored; no exhaustive interleaving, no unbounded
model checking, and no liveness/timing property was claimed. One violation
record per invariant is retained per run. These results are bounded-model
evidence for the named properties, not unrestricted proof.

## 3. Retained counterexamples (red against the published rules)

Each row: the review item, the invariant that fires under `rev2-published`,
and the mechanism. All of these are reproducible today by the command above;
the traces and full violations are committed under
`evidence/transition-model-20261015/rev2-counterevidence.json`.

| Item | Fires (invariant) | Mechanism in the published rows |
| --- | --- | --- |
| A | `A-deterministic-effects` | T7 executes a committed protected write only when the applying replica's local D3 gate is OPEN. Two replicas that restarted differently applied the same committed prefix and persisted different applied effects. Deterministic effects of committed commands must not depend on D3 at all. |
| B | `B-census-binding` + `B-stale-reopen-observed` | T1's precondition is `releaseIdentityValid(I) AND E > L`; the census digest is recorded but never compared to the replicated state at the application prefix. A coordinator that captured a census before a committed HOLD and later submits a numerically larger epoch reopens straight past the HOLD. (Same-epoch reallocation is already contained by rev2's T3; the hole is the larger epoch.) |
| C(1,4) | `C1-l-monotone`, `C4-refusal-no-replace` | T5 records `REFUSED_APPLY` and sets `L <- E` even when `E < L`: one invalid lower-epoch command reduces `lastAppliedReleaseEpoch`, after which further stale commands overwrite settled disposition rows. |
| C(2) | `C2-gate-supersession` | T2's D3 cell says "re-derive D3 as T1"; T1's D3 cell has no supersession clause. An exact replay of a historical APPROVED decision re-opens the local gate after a later HOLD - the old authority is restored by replay. |
| C(3) | `C3-conflict-names-winner` | T3's `EPOCH_CONFLICT` annotation names neither the winning epoch nor the winning disposition, so the outcome of the conflicting request is not distinguishable from the outcome of the request that won the epoch. |
| D | `D-no-silent-adoption` | T7 consults only the current local gate. Work bound to epoch 1 (carrying its committed admission epoch in its own bytes) executes after HOLD 2 and a later APPROVED 3, silently adopting the new epoch; on a replica whose gate is CLOSED the same command refuses - both the adoption and the nondeterminism. |
| E | `E-prepare-classification` | T7 settles "PREPARE/DECISION ... regardless of HELD", while the ingress table says a PREPARE ordered after the fence cannot admit. Read literally, a fresh, never-staged PREPARE proposed after a HOLD is admitted while HELD - contradicting the ingress half of revision 2 (and section 4's recovery semantics) instead of resolving it. |
| F(1) | `F1-uncertainty-nonterminal` | Section 8 defines `NOT_COMMITTED` from "entryId absence at the decision instant". A request that is submitted and simply not yet committed answers as the terminal aborted class with the full fallback, then commits later - the intermediate answer was already treated as terminal. |
| F(2) | (`F2-row-absence-not-proof` as an unmet claim) | An epoch-row read back is typed `UNKNOWN_EPOCH` - the never-committed typing - for an epoch whose commit status at the observed prefix is simply unknown. A missing row answered as proof of "never committed". |
| G | (`G-retention-policy-ran` as an unmet claim) | There is no retention or resource policy anywhere in revision 2: rows accumulate unbounded, and no answer vocabulary distinguishes retained historical outcomes from unavailable or retired history. |

Under `rev3-corrected` the same seven schedules produce zero violations and
every positive claim holds (retained in
`rev3-correction-evidence.json`), including the legitimate behaviors that
must survive: a restarted replica's committed effects stay identical while its
D3 legitimately differs; legitimate re-release after a HOLD works through a
new committed epoch with a fresh census; a PREPARE settling pre-fence staged
work still applies while HELD; an authoritative DECISION applies; fencing and
new epochs remain possible at capacity.

## 4. The corrected transition table

Per-replica deterministic apply. Inputs are exactly revision 2 section 2.2's:
command bytes C and replicated state at that log position
(`L = lastAppliedReleaseEpoch`; per-epoch disposition rows and apply
annotations; `W = retiredBelow` watermark; the replicated transaction
obligation rows). D2 effects are byte-identical on every replica applying the
same prefix; only D3 may differ and is never persisted into D2.

Notation: `censusOK(C, k)` holds iff the command's `census.stateDigest` equals
the digest of the replicated release state at the prefix before this entry -
i.e. authorization consumes the exact expected HELD state (epoch, current
row, outstanding obligations) it claimed. `spent(E)` holds iff `E <= L` (an
epoch is consumed by whatever committed at it, whether or not a row survives).

| # | Applied entry | Deterministic precondition (command stream and replicated state at this prefix only) | D2 effect | D3 gate action |
| --- | --- | --- | --- | --- |
| T1 | `RELEASE_DECISION(E, disposition, identity I, census, entryId i)`, fresh | `identityValid(I)` AND `E = L + 1` AND `censusOK(C, prefix)` | Disposition row{E, disposition, i, census-bound}; `L <- E` | Re-derive: OPEN iff row{L} is APPROVED AND binding matches current committed identity AND local generation observations match; else CLOSED + typed HELD reason (`INCARNATION_CHANGED`, `IDENTITY_STALE`) |
| T2 | Same entry re-applied (restart, catch-up, reroute/entryId replay) | Same canonical bytes AND same entryId AND `E`'s row exists with those bytes | `REPLAYED`; rows, `L`, `W` unchanged | Re-derive **against the current epoch only**: gate resolves from row{L}; a superseded epoch can never re-open the gate (`SUPERSEDED`). Re-derivation changes no durable fact. |
| T3 | `RELEASE_DECISION`/`RELEASE_HOLD` at a spent or conflicting epoch | `spent(E)` AND this entry is not a byte-and-entryId replay of E's row | `EPOCH_CONFLICT` annotation naming `E` and the **current winner** (epoch, kind, disposition or typed absence); no row, `L` unchanged | Re-derive (unchanged); stays CLOSED unless row{L} is a legitimately APPROVED later epoch |
| T4 | `RELEASE_DECISION(E, REFUSED(r), I, census, i)`, fresh | As T1 with disposition `REFUSED(r)` | REFUSED row{E}; `L <- E` | CLOSED (stays) |
| T5 | `RELEASE_DECISION(E, *)` with invalid identity | Hash mismatch | Typed `REFUSED_APPLY(identity_invalid)` annotation **only**; no row; `L` unchanged; `E` is nonetheless spent (T3 applies to any later claim of it) | CLOSED (stays) |
| T6 | `RELEASE_HOLD(E, supersedes S)` | `S <= L` AND `E = L + 1` AND replica-release state consistent (the HOLD itself carries a census bound like T1) | HOLD row{E, supersedes S, i}; `L <- E`; the log-order fence closes admission for every command ordered after this index | CLOSED on every replica that applies it |
| T7 | `PARTICIPANT_PREPARE` / `PARTICIPANT_DECISION` / `GENERATION_ORIGIN` / protected write or staging, at index k, carrying its committed `admissionEpoch` a | Existing applier rules (unchanged) plus the binding rules below | Unchanged effects, in log order; `STALE_ADMISSION(a, L)` recorded deterministically when the binding fails; `EPOCH_CONFLICT`/replay answers name the winning disposition | **Never consulted for these deterministic effects.** New local serving/proposal admission only: derived from row{L} + local observations, exactly T1's D3 rule |

T7 binding rules (the corrections of D and E, one row each):

- **Protected write / staging (`PARTICIPANT_TXN_BEGIN`):** executes (or
  stages) iff row{a} is APPROVED AND `a = L` at this prefix; otherwise a typed
  `STALE_ADMISSION`-class refusal with effect not applied. Immutable
  `admissionEpoch` is part of the command bytes. Silent adoption of a newer
  epoch and per-replica nondeterminism are both excluded. Legitimate
  re-admission is a **new** command bound to the current epoch, admitted by
  D3 at serving/proposal time; exact replay of an already-applied command
  replays its original outcome and re-executes nothing.
- **`PARTICIPANT_PREPARE`:** classification from replicated state at the
  prefix. (a) The transaction has a replicated staging row applied at this
  prefix -> **settlement**: applies regardless of HELD (the transaction
  owner's valid recovery semantics, unchanged). (b) Exact duplicate of an
  already-applied PREPARE -> `REPLAYED`, no new effect. (c) No replicated
  staging record and the replicated release state is HELD -> typed
  `PREPARE_ADMISSIBILITY_REFUSED`, no effect (a fresh PREPARE after HOLD
  cannot admit). (d) No staging record and admission is open -> ordinary
  PREPARE. No reading of replica-local lifecycle to choose any branch.
- **`PARTICIPANT_DECISION`:** authoritative settlement of an existing
  obligation; applies regardless of HELD; idempotent by transaction id (an
  exact duplicate replays its recorded outcome).
- **`GENERATION_ORIGIN`:** unchanged existing applier rules.

D4 correction (F): the coordinator outcome is classified only from committed
facts bound to exact request identity (entryId), immutable bytes, and the
relevant observed prefix. An entry not observed committed at the prefix
answers `PENDING` (non-terminal, never NOT_COMMITTED/ABORTED, never a full
fallback); a missing epoch row answers `PENDING` if unapplied,
`SPENT_WITHOUT_ROW` if spent without a surviving row, or typed `RETIRED` if
below the watermark - **never** "never committed". Only the typed pre-decision
refusal (proposal refused at D0, no entry submitted) is a terminal
not-committed outcome. Every observed answer is recorded with its prefix and
is monotone: `PENDING` may become `COMMITTED{epoch, disposition}`; `COMMITTED`
never reverts.

## 5. Ingress corrections (revision 2 section 4 deltas)

- Protected writes and staging commands carry their committed
  `admissionEpoch`; execution gates on the replicated row for that epoch, not
  on the proposing replica's local gate. The fence remains: with a HOLD at
  index h and `L` advanced, any later-ordered entry with a stale binding
  refuses deterministically; nothing retroactive, nothing undone.
- PREPARE ingress follows T7's four-way classification; the revision-2
  sentences "PREPARE after HOLD cannot admit" and "PREPARE applies regardless
  of HELD" are both preserved - the first for fresh unstaged work, the second
  for settlement of already-staged obligations and for authoritative
  DECISIONs. No PREPARE is classified as settlement without a replicated
  staging record.
- D3 gates only new local serving/proposal admission. No deterministic apply
  branch consults D3, replica-local lifecycle, remote replies, or volatile
  work queues; deterministic application may inspect only replicated state at
  its application prefix.
- Retention (Section 4's `W`) is a replicated apply-time policy, bounded
  (`retention-per-partition`), not a background process.

## 6. Successor-draft corrections

The successor draft is **still unsealed and unactivated**; nothing was started,
sealed, or probed. A corrected draft supersedes the revision-2 draft file:

`solve/quests/seed-control-current-proof-amortization/evidence/participant-release-committed-disposition-quest-draft-correction.json`

Constraint deltas, one per affected constraint (ids below are the corrected
draft's; two are renamed from their revision-2 names to state what changed):

- `deterministic-disposition-purity` - adds the T7 binding rule (committed
  commands carry `admissionEpoch`; D2 never consults D3) and the census
  binding of T1/T6 (authorization consumes the exact expected replicated HELD
  state at the application prefix; `E > L` alone is not sufficient).
- `decision-points-named` - unchanged, plus D4's `PENDING` non-terminal class.
- `identity-epoch-separation-and-monotonicity` (was
  `identity-epoch-separation-and-compaction`) - adds monotonicity (no refused,
  stale or invalid command ever reduces `L`, rewrites a row, or replaces the
  current disposition), sequential epoch allocation (`E = L + 1`), and
  conflict annotations that name the winning disposition.
- `eligibility-derivation-not-proof-invalidation` - unchanged, plus the T2
  clarification: replay of a superseded epoch re-derives against the current
  epoch and can never re-open the gate.
- `tx1-prepare-classification-and-ownership` (was
  `tx1-work-ownership-unchanged`) - keeps the old rule; the PREPARE four-way
  classification is stated inside the interaction contract so the settlement
  owner's recovery semantics are preserved and no PREPARE is classified as
  settlement without a replicated staging record.
- `committed-fact-outcome-classification` - adds `PENDING` (non-terminal),
  answer binding to request identity + bytes + observed prefix, and the row
  vocabulary of Section 4/D4.
- `retention-owned-bounded-fencing-preserving` (new constraint) - the
  resource/retention policy of Section 7.
- `no-new-machinery` - unchanged.
- `red-on-revert-witnesses` - witness platform corrected: the raft-rs owners
  (`raft-rs-operation-port.js`, `raft-rs-runtime-owner.js`,
  `raft-rs-application-transaction-owner.js`, `raft-rs-durable-store.js`, and
  the `raft-rs-backend` native fixtures under `test/raft/raft-rs-backend/`)
  replace every stale Liferaft reference. Any successor witness with different
  post-commit semantics documents why it supersedes the earlier expectation;
  the three preserved witnesses keep their bytes.

## 7. Retention policy (G)

- **Owned and bounded** (R13): the release owner's per-epoch rows are bounded
  per partition by `retentionBound` live rows. Retention executes inside the
  same application transaction when the bound would be exceeded: it retires
  only the oldest rows below the current epoch (strictly `E < L`), never the
  row for the current epoch `L`, and never an epoch with an unresolved
  obligation; it advances the watermark `W = retiredBelow`.
- **Fencing preserved:** `L` is monotone forever; spent epochs are never
  reclaimable (T3), retired or not. A watermark denies stale authority; it
  cannot invent a past disposition.
- **Answer vocabulary:** row present -> its typed disposition; below `W` ->
  typed `RETIRED` (unavailable history, explicitly named, never reconstructed,
  never `UNKNOWN_EPOCH`-as-never-committed); spent without a row -> typed
  `SPENT_WITHOUT_ROW`; unconsumed -> `PENDING`. Distinguishes exact retained
  historical outcomes from unavailable or retired history at the type level.
- **Capacity behavior:** retention first, then the entry applies; the
  operations that remain possible without limit are release decisions, HOLDs,
  settlement (T7), replay/recovery of retained epochs, and typed answers. Safe
  closure and recovery are preserved: the current epoch's row, supersession
  pointers and all unresolved obligations are never retired.
- **Evidence:** scenario G runs five sequentially allocated epochs, forces the
  bound, and asserts the retained read typing, the stale-binding refusal
  across the watermark, and that fencing still commits at capacity.

## 8. What was run (exact)

```sh
node scripts/checks/participant-release-committed-disposition-transition-model.js \
  --evidence-dir solve/quests/seed-control-current-proof-amortization/evidence/transition-model-20261015
npx eslint test/model/participant-release-disposition/model.js \
  scripts/checks/participant-release-committed-disposition-transition-model.js
```

Results: exit 0; seven scenarios x two rule sets green (rev2 counterexamples
present, rev3 invariants and claims satisfied). Raw machine-readable evidence:
`rev2-counterevidence.json`, `rev3-correction-evidence.json`,
`summary.json` under `evidence/transition-model-20261015/`.

**Stop: this addendum stops for independent review before any production
implementation, sealing or activation.** Nothing in `src/` changes; the
revision-2 document, the sealed Quest record and the three witnesses are
unmodified.
