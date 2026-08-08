# Detailed design: Supported upgrade and recovery envelope

Quest: `supported-upgrade-and-recovery-envelope` (Q12). Requirements
contract: [`requirements.md`](requirements.md) "Support envelope". Epic:
[`solve/epics/pilot-readiness-and-public-proof.md`](../../epics/pilot-readiness-and-public-proof.md);
binding decisions cited as D1–D12. Depends on Q6, Q7, Q8–Q9, and Q11; their
certification receipts are linked, never re-run or duplicated (D11).

## Owner boundaries touched

- Release process: `scripts/release-notes.js` (`--mode check` is the
  existing release-gate precedent — CHANGELOG-as-single-source, checked
  first in `release.yml`) plus
  `scripts/run-lagrange-server-clean-release-gate-scenarios.js`. The
  envelope check becomes a sibling release-gate stage: the release process
  consumes the envelope and refuses claims outside it.
- `docs/operations-readiness.md` — today states that `0.x` releases carry
  no published support envelope; it becomes a consumer of the generated
  envelope, never a hand-maintained parallel claim (D10, D11). Generated-
  surface precedent: `scripts/generate-current-capabilities-doc.js`.
- Drill substrate: `test/distributed/scenarios/rolling-restart.js`
  (restart-under-load precedent, fixed-code only today),
  `test/distributed/harness/docker-provider.js`, and the scenario registry
  — the envelope drills are registered scenarios on the existing harness
  (D11).
- Mixed-version refusal executes at node admission/handshake
  (`src/transport/message-router-connection-authority.js` /
  `src/bootstrap/owners/bootstrap-join-admission-owner.js` boundary — the
  same owner that fences identity in Q7; exact mechanism open below).
- Linked receipts: learner promotion (Q6), node transport (Q7), bulk
  load/cutover (Q8–Q9), scale/failure certification (Q11).

## Contract shape

### Envelope record (machine-readable, versioned)

One JSON record per certified version pair:

- `envelopeVersion: 1`; `sourceVersion`, `targetVersion` — **exact**
  versions (this is an exact-version-pair envelope, not a rolling-upgrade
  range claim; sealed constraint).
- `schemaBoundaries` — system-table/schema digests at both versions and the
  declared compatibility rule between them.
- `topologies[]` — tested node counts and failure-domain assumptions.
- `drainConditions`, `readinessConditions` — the operator-checkable
  conditions under which a node may be taken down and declared back.
- `backupDependency` — explicit, `none` allowed; if named, it is a link,
  not an implementation (D9).
- `rollbackCutoff` — the last point in the upgrade at which downgrade or
  rollback to `sourceVersion` is supported, and what is refused after it.
- `maxTestedReplicaSize`, `rebuildWindow` — the largest replica actually
  rebuilt in certification and its measured window.
- `availabilityOutcomes` — one **typed** outcome per drill (below).
- `receipts[]` — links (ids/digests) to the drill receipts and the
  dependency-Quest certification receipts.

The envelope is generated from drill receipts, never hand-written (D7,
D10); an envelope entry without a linked receipt is invalid.

### Certified drills (all under foreground load)

Each drill runs on a named supported topology with foreground load, checks
acknowledged-data preservation (pre/post independent checksums over
acknowledged writes — an acknowledged write may never disappear), and
yields a typed availability outcome from a closed enum, e.g.
`continuous`, `bounded_degradation{p99, window}`,
`bounded_unavailability{window}`:

1. **Upgrade** `sourceVersion → targetVersion`, node by node.
2. **Downgrade/rollback boundary**: rollback before `rollbackCutoff`
   succeeds; after it, refusal with an operator-readable reason.
3. **One-node failure** at `targetVersion`.
4. **Wiped-replica rebuild** at the certified `maxTestedReplicaSize`,
   measured against `rebuildWindow`.
5. **Service-artifact upgrade** (deployed WASM service updated in place)
   under foreground public-path traffic.

### Mixed-version behavior

Within the certified pair, mixed-version operation is supported only for
the drill's transition window. Any version pair **outside** the envelope
fails closed at admission with an operator-readable reason naming the
envelope — a node never silently joins across an uncertified boundary.

### Release-gate consumption

The release process loads the envelope record and refuses any release
claim (docs, notes, capability surface) not backed by an envelope entry
with linked receipts. Executable evidence, not prose (D10): the gate is a
script stage, and removing it is a release-process regression.

## Failure semantics (D12)

- Acknowledged-data loss in any drill → drill fails; no envelope entry.
- Missing or untyped availability outcome → envelope generation refuses.
- Receipt link broken or digest mismatch → envelope invalid; release gate
  red.
- Outside-envelope join attempt → typed refusal (never a hang or silent
  degradation).
- Red-on-revert (sealed): removing the acknowledged-data preservation
  check, the availability typing, or the outside-envelope refusal must
  fail the scenario deterministically.

## Non-goals and edition boundaries

- No generic "all rolling upgrades work" claim; exactly the certified
  pairs.
- No re-running dependency certifications — Q6/Q7/Q8–Q9/Q11 receipts are
  linked (D11).
- No backup/restore/PITR implementation; `backupDependency` may only link
  externally (D9). Community/AGPL scope per `edition-matrix.md` (D8).
- No prose-only envelope: documentation is generated from the record
  (D10).

## Open decisions left to the Quest

- The first certified version pair (governance picks the pilot-relevant
  pair; the epic's gate review owns it).
- Envelope artifact location and naming (release assets vs a generated
  in-repo record consumed by `release.yml`) — one location, digested.
- Mixed-version fencing mechanism: version fields in the IDENTIFY/admission
  handshake vs a control-plane admission check — must live with the
  existing admission owner, not a new gate (D11).
- The closed availability-outcome enum's exact members and their measured
  fields.
- Whether `drainConditions`/`readinessConditions` reuse existing rolling-
  restart readiness probes or name new operator-visible conditions.
