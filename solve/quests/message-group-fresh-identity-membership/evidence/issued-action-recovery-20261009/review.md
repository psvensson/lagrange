# Issued-action recovery continuation and adversarial review

Reviewed base: 8ece20f70392314ceba49e4e787b800bc14d07d6.
This packet is prepared locally on 2026-10-09 and has NOT been pushed.
It is an author implementation/self-review, not independent verification.

## Implemented

One existing source owner is extended: raft-rs-committed-membership-context.js.
The new pure decoder observes exact retained/applied action evidence. Existing
context encoding and decoding remain unchanged. No schema, proposal path,
lease, membership phase, transport registration or physical CREATE is changed.
The method is intentionally not wired into the production semantic port yet.

The native witness proves two histories, rather than assuming one from a lost
answer: a term-1/index-2 learner entry retained on the future leader commits
when that leader reaches term 2, and a different schedule overwrites a
minority-only term-1/index-2 action with a term-2 entry. The second returns
UNRESOLVED, NOT proved absence or permission for a successor attempt.

The decoder binds all original context dimensions, excludes unapplied entries,
rejects malformed boundaries/data, keeps historical entry terms valid, and
excludes raw entries covered by an installed snapshot cut. Historical ADD
proof does not become current CREATE eligibility after actual REMOVE.

## Measurement

Eight tests pass in the local native/SQLite diagnostic. Five deliberate source
weakenings fail at the required assertions: applied frontier, operation ID,
snapshot cut, historical term handling, and malformed zero-term action. Each
mutation restores the exact source bytes; final positives pass. No cancelled
or skipped tests are counted as mutation success. The existing five-case
durable-store committed-reader test also passes with the same explicit driver
substitution. Exact outputs, measured durations and hashes are in the bundle.

The initial seven-case red fails because the new observation method is absent;
this is proof of a missing capability, NOT seven pre-existing corruption bugs.
The first exploratory election attempt advanced only the requester clock and
left a follower's leader lease unticked; it failed in the apparatus. Both
survivor clocks are advanced in the final bounded schedule. The original failed
exploratory source and a record of that failure are retained. No production
Raft timing, timeout or quorum parameter was changed to obtain engagement.

## Limits found by self-review

- A coherent same-group durable record is a native-owner precondition. This
  function is not an authenticity check on arbitrary external records.
- Returning positive historical evidence is safe without making the old
  execution permit current. It is not a live membership descriptor.
- A compacted record without retained provenance remains unresolved. The
  decoder cannot finish checkpoint recovery by guessing from role/identity.
- A log scan is a bounded initial observation implementation, not approval to
  rescan an arbitrarily large log indefinitely in a hot reconciliation loop.
- No independent ordered reissue/noncommitment certificate exists yet; do not
  relax the initial author's sequence-1 constraint or refresh old fences.
- The new tests use historical low-level Ready helpers, not the actual current
  runtime/port consumer. The locally supplied SQLite adapter uses node:sqlite,
  not better-sqlite3. This is native-core plus real SQLite evidence, NOT the
  full production-owner proof required by the Quest.
- The snapshot cases use projected record views, not physical snapshot install.
- Syntax and line-length checks pass. The actual strict-complexity command
  failed its prerequisite because eslint is absent. Lint, generated metadata,
  full static, canonical test budgets, integration and GCP are NOT claimed.

## Publication

The session exposed 48 GitHub read/search/download actions and no write or
workflow-dispatch action. Discovery of the installed GitHub plugin found no
second publisher; an ordinary git network attempt failed DNS resolution.
No credential was extracted, no permission expanded, no read action repurposed
as a write, and no remote branch changed. The patch is bound to the exact base
module's Git blob 3f9ff244007449c1755e70b96d9bbc97b7575354 and packaged for the
existing publication route when available. Do not label this packet published.

## Next boundary

Run the added test with canonical dependencies and the repository runner on
Actions/GCP, regenerate metadata through its producers, and obtain source
review. Then implement the native outcome read plus retained provenance/
checkpoint path and exact repository recording as one owner interaction.
Only after that should the ordered successor-attempt and CREATE paths activate.
Keep the original lab FAIL, restart-duration debt, global-currentness finding,
final main proof and A1-v13 compatibility gate unchanged.
