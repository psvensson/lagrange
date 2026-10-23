# Independent native mixed-vector witness review

Reviewer: `subagent:/root/retained_effects_tests`.
Verdict: **REVISE for MV1, the expected-input snapshot.** The actual native
fixture and proposed I-to-N-to-I API are appropriate for the claimed bounded
recipient witness. No runtime, source/test edits, metadata, lab, commit or
publication was performed by this reviewer.

Exact root-authored file:
`test/message-group/message-group-native-mixed-vector.test.js`, 147 lines,
SHA256 `38c50730400d3d427caa90ded1e9612c6da8a9d8cef7a7d40133ce54c4b83be4`.
Shared native fixture:
`test/message-group/message-group-native-custody-fixture.js`,
SHA256 `2806d3980b7b4b0392c79e2924984fb23e26147c5c27a3ed2e5d7a9409ff3012`.
The design authority is the independently approved complete-vector R2 correction,
SHA256 `7ccbad6c08aebc6275a400f80fe7f6eb2007094479116cddb5b2d28f61b7a76c`,
under MG contract `474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383`.
The moving native R4 source still needs its own independent review.

## Actual mechanism and useful assertions

The shared fixture opens real RF1 or three-voter MessageGroupService databases,
registers the actual message-group handler, subscribes to CONFIG and requires
real native leader/frontier/readiness setup. Its controlled carrier holds and
delivers actual native envelopes; it does not forge CDC receipts. The new test
does not activate the loss cut or invent a role. Its RF3 case explicitly observes
the follower and lets the real F3/transport path reach the actual leader.

The application observer delegates every argument and returns the original
answer (`mixed-vector.test.js:55-70`). Native traffic delegates unchanged.
`measuredApply:73-89` consumes rejection immediately, pumps the real carrier and
requires the operation to have settled before inspecting it. Cleanup remains
with the shared actual service/router owners; a failure retains the directory.

The asserted result must carry a complete-vector digest for I and one durable
receipt without inventing an ordinary occurrence. The actual durable command
must retain both ordered members, the original durable envelope, ordinary
content and a supplied ordinary stamp. Missing ordinary stamp assignment must
not insert a stamp into the caller object. Receipt term/index match retained
native history, with commit/applied at or beyond that index; both cache rows
are inspected (`:92-115`). RF3 additionally checks the real terminal address,
group, whole wire vector N against retained N, the terminal N-bound result and
the distinct returned I binding (`:129-147`). These are substantive native
checks, not assertions over a constructed receipt.

The durable input is explicitly synthetic. This file does not prove released
SQL admission, actual source event/debt production, source ACK, all-replica
application, rollback, stale leader routing, full W7 or restart classification.
Those limits are accurately stated and must remain literal.

## MV1: expected data can be changed by the operation under test

Every expected vector/body/digest passed into `assertNativeMixedResult` is the
same mutable `events` object previously supplied to `applyCDCBatch` (`:77`,
`:92-110`, `:124-126`, `:135-137`). The hasOwn(timestamp) assertion only protects
one property. There is no complete independent pre-call input snapshot.

A finite source-semantic counterexample is an implementation that executes
`events[1].data.config_value = 'wrong-body'` before its ordinary admission.
It can then legitimately capture/commit that changed vector and return its
matching digest. The test compares the command and cache to the same changed
input, and calculates the expected I digest from that changed input too.
Its RF3 transport comparison is likewise between changed N and retained N.
All those checks can pass while the originally supplied ordinary body was lost.
This is source reasoning, not a mutation run claimed as measured evidence.

Required bounded repair: capture an independent complete expected input before
the first production call, use it for the raw-I validation and retained-member
comparisons, and assert that the complete caller vector is unchanged afterward.
Preserve actual raw missing/supplied-stamp inputs and real owner normalization;
do not pre-normalize them in the test or fabricate the assigned stamp/receipt.

## Independent proof after the repair

The snapshot must kill in-place member/body mutation as well as filtering,
reordering, duplication, or durable-stamp replacement. Dropping native
application/afterCommit or returning append-only success must fail the retained
position/frontier checks. Returning N directly to raw I must fail the binding
check, and restamping at a forwarding hop must fail exact wire/retained-vector
correspondence. The supplied-stamp RF1 control must continue to preserve that
stamp. Separate canonical component tests own wrong-digest/contradictory outcome
and coverage-reuse negatives; this native positive alone does not prove them.

All nine applicable categories were considered: real admission/formation setup,
actual transport and owner delegation, native retained replay evidence, bounded
single-operation concurrency, creating-clock/finite-pump fidelity, unchanged
retry policy, no added sweep, and an independent treatment oracle. MV1 is the
finite remaining harness-fidelity defect. No runtime was executed; source and
native witness approval remain separate, and a green result after the repair
will still be recipient proof rather than source-delivery acceptance.
