# Bounded F lifecycle observation repair

Base: 5e58474b13870c95ea6bd6175942c33984cd6ac9, rule-set revision 5.
The three F hashes match r4's reviewed manifest. Full lab has six new F sites;
that bounded approval did not measure global audit cleanliness. The first red is
retained under test-output/lifecycle-observation-20261112/full-lab-first-red.txt.
Initial solver startup lacked node_modules (tap-parser import failure); dependency
resolution now uses a local symlink to the existing checkout installation. This
setup error is distinct from the lab's engaged audit failure.

## Cause and transition

The F extraction copied a duplicate RETIRED reason into constants and a shared
reason mapper, but did not unify row validity. The observation catch converts
invalid evidence into absence; runtime opening never selects evidence and admits
unknown lifecycle states as CORE_OK; snapshot maps non-active states to retirement.
These are one inconsistent row-decoding concern, not a vocabulary-only repair.

Trigger: runtime construction, durable removal observation, receiver admission,
final swap revalidation, and private snapshot staging inspect a durable lifecycle
row. The lifecycle owner alone owns its state, reason and evidence carrier. A small
shared lifecycle-record module will decode that row for owner and observation and
supply the named lifecycleAdmissionOf operation. No new store or capability.

Shape: ACTIVE/RETIRED are the only lifecycle states. Identity and incarnation remain
exact nonempty strings. Reason is SQL NULL for active birth (empty string may remain
an explicit empty representation if existing contracts require it), or a string;
terminal retirement writes a nonempty reason. No coercion of objects/numbers into
reasons. SQL NULL is absent retirement evidence; present data is JSON text encoding
a non-array object, including {}. Empty text, JSON null/scalars/arrays and parse
failure are malformed. Active rows cannot carry retirement evidence. This codec
owns the evidence carrier, not the group-workflow semantic proof: that owner already
verifies evidence before REMOVE persists it. Existing opaque marker-object tests
remain valid; no second workflow schema will be invented here.

One typed owner refusal identifies invalid state, reason or evidence; durable reads
return UNREADABLE without a held row, opening authority or readBeside execution;
runtime and snapshot return CORE_REFUSED. No malformed carrier may be ignored even
when the caller only wants state. Canonical terminal refusals preserve reseed-required
and otherwise use LIFECYCLE_STATE.RETIRED, without duplicate state aliases.

Writers: birth, original preparation and staging remain existing operations. Retire
validates reason/evidence and captures their serialized value before closing admission
or awaiting active turns; invalid intent leaves the durable row and active latch
unchanged. Reseed remains immediate and writes terminal state with NULL evidence.
The existing durable UPDATE and commitDurably remain the commit point; no DDL added.
No new writes on observation, compatibility reader, migration, or recovery shortcut.

Identity/generation: exact group, peer, replica and minted incarnation retained;
no new current-name lookup. Ordered retirement continues to drain admitted turns,
then commits state/reason/evidence together. Lost-answer/restart consumes the same
validated record. Malformed authority remains held pending its real owner's repair;
ordinary retries re-read through the existing owner path. This repair does not claim
automatic recovery of corrupt data or release/service acceptance.

## Scope and callers

Writable production scope: lifecycle constants, observation, owner, plus a small
lifecycle-record codec if needed. Dedicated regression test, authority-and-recovery
contract and existing raft-rs-runtime-lifecycle-entry registry/witness mapping as
necessary. Existing canonical constants are not legacy compatibility. No baseline
increase or checker exception. No role observation/cache fix. Separate SQLite owner
migration touches observation constructors/assertions: parent must compose that
mechanical storage change with this semantic repair; never copy its implementation.

Runtime callers: operation-port constructor and exact runtime lifecycle claims;
staging: snapshot-install and receiver admission/final revalidation; durable readers:
raft-rs-lifecycle-administration, own-group-record readBeside, removal participation,
group-retired tombstone consumers. Original-allocation reads/updates require audit
for bypassing the common row validation. No changes to primary Quest log/integration.

## Proof and review

Native SQLite regressions must be red on the exact base and green on the candidate:
malformed JSON and type lattice through durable read, readBeside, runtime and snapshot;
invalid state/reason; NULL and {} terminal evidence; active empty evidence; explicit
reseed reason; no file/schema/row changes; writer input refusal before effects; valid
reads and retirement after a finite rejected input. Existing birth, opening, staging,
claim and tombstone witnesses cover the callers. Canonical guards are file-scoped.
Every execution uses thermal owner plus flock /tmp/lagrange-local-test.lock, jobs 1.
No full local suite. Preserve each first red and exact candidate hashes.

Fresh independent reviewer: gpt-6-astra, effort max, no higher-tier escalation claim.
Design review precedes source changes; final review binds the exact candidate packet.
Parent owns composition, global verification and any future landing/publication.
