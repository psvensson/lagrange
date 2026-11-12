# Review response and precise implementation contract

This addendum resolves the independent Astra max design feedback observed before
implementation; the consolidated verdict remains retained separately. It does not
change the sealed claim, scope or doneWhen. There is no design approval claim yet.

1. Invalid retirement intent throws LifecycleRecordRefusal with the owner-defined
   code BEFORE changing the admission latch or awaiting turns. Returning CORE_REFUSED
   would be unsafe because REMOVE awaits retireReplica and discards its return.
   A rejection unwinds that existing await before tombstone/file cleanup. Tests now
   require rejection and assert a continuation cannot run. The original proposed
   return-result tests and their measured red remain preserved.
2. The codec is the existing lifecycle owner's pure representation implementation,
   in raft-rs-replica-lifecycle-record.js. All ordinary runtime, durable observation,
   snapshot and original-allocation row reads validate its complete shape. Original
   issuance validates before its durable commit, not merely during readback.
3. Exact representations: active reason is SQL NULL, terminal reason is a nonempty
   string. The existing writer always produced these. The observation's active
   reason remains the existing empty display string. No new reading of old forms.
   SQL NULL is absent evidence; {} is a present empty record, valid only terminal.
   Empty text, scalar, array, BLOB, malformed JSON and active evidence are invalid.
   LIFECYCLE_STATE.RETIRED remains the durable terminal value and refusal spelling.
   Removal's domain reason remains in the decoded record; RESEED_REQUIRED survives
   both live refusal and restart. Missing incarnation is still refused.
4. Retirement captures canonical JSON DATA through existing isRecord/serializeJsonData
   primitives before await, rejecting accessors, exotic objects, coercion, cycles and
   values serialization would discard. No workflow-schema duplication or new
   intrinsic-hardening framework. The group-retirement owner still decides semantic
   proof before the writer accepts it; an opaque object is not a fresh workflow grant.
5. Decode errors become typed UNREADABLE observations, with no held row, no opening
   authority and no readBeside call. Runtime/snapshot admission returns CORE_REFUSED.
   This cannot repair corrupt authority: ordinary re-drive reobserves the owner;
   no automatic corruption recovery or global release claim.

No observation constructors, pragmas, files or DDL changed. Parent must compose the
separate SQLite migration at those existing constructors/assertions with this repair.

Consolidated review clarification: on the base, unknown lifecycle state received an
inconsistent internal CORE_OK but the runtime active getter was false, so the port
never constructed its dispatcher. No unknown-state native-entry exploit is claimed.
Malformed evidence on an otherwise active row is the measured admission gap. The
new owner-level matrix is not by itself production operation-port/native proof;
actual port and final snapshot-seam witnesses must supplement it. Observer purity
is separate from port construction's existing peer-identity schema/reservation work.
The completed design rejection is retained, and final review must approve its
corrections on the measured candidate before any bounded acceptance claim.
