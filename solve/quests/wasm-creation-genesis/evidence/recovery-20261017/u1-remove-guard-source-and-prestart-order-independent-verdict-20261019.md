# U1 exact REMOVE guard correction and pre-start oracle order: independent verdict

Date: 2026-10-19. Reviewer: `subagent:/root/lifecycle_design_research`.

## Narrow production-source verdict

**APPROVE** the exact one-guard correction in
`src/node/runtime-service-generic-replica.js`, complete-file SHA256
`a8db277dc5bd861796d870478bd52397984e6e5d444a02000ad3604ff3af7f30`.

The independently checked parent is published test-only checkpoint
`e88863f874bc75473458dd6cbc8cd7bd5aa76c57`, full Git tree
`d812c36e4c6f4ea509609e94c982a1326f5af969`. The complete uncommitted production
diff contains only moving the existing initial
`if (!currentRemovalMemo(handler, entry)) return;` from immediately before
the existing `try` to its first statement. No other production file differs
from that parent.

This implements the precise correction independently approved in
`u1-superseded-remove-gate-independent-review-20261019.md`, SHA256
`33928371fc105f0de799cfb0058d23f1744e240a8add6c7b3b87b1db07c40c07`.
The source reviewer authored neither this production edit nor the handler
test. No source/test edits or behavioral execution were performed in this
review. Root's separately reported ESLint/diff checks are not presented as
independent execution here.

## Why the changed exit is correct

The execution entry and the local routing memo have different custody.
`currentRemovalMemo` at lines 104–107 combines exact current execution with
identity of the admitted local memo. If that memo changes while the original
queued REMOVE still owns its execution entry, the obsolete STOP must be
refused and the completed attempt must release its own scheduling slot.
The old pre-try return achieved only the refusal. The corrected return now
necessarily runs the existing `finally` at lines 169–171.

`src/node/runtime-service-creation-execution.js:89–92,121–125` independently
guards release using the live handler and exact installed entry object:

| State when the queued continuation runs | Corrected effect |
| --- | --- |
| Original entry remains installed; admitted memo was replaced | Refuse old physical STOP and outcome publication; delete that completed original entry and reconsider already queued work through the existing owner. |
| Execution slot now holds another entry | Refuse old work; the unchanged release guard cannot delete the replacement entry. |
| Handler has stopped | Refuse old work; release does not resurrect or wake a closed handler. |
| Original entry and memo remain current | Preserve the existing STOP, post-await currentness, success/failure and final release behavior. |

All later pre-STOP, post-STOP and catch-path memo checks are unchanged. The
correction creates no new admission, physical authority, registry, observer,
timeout or retry loop. It implements v3 section 6 and addendum D3.6's exact
settlement requirement without making a changed projection discharge an
execution that still belongs to the old request.

The unchanged handler test file is SHA256
`e6fb5b6b658fa855ecabe22689c7e3d7896e783fe68ed7a19a17dc961cb77fe3`.
Its queued gate-size assertion and subsequent legitimate successor REMOVE
admission discriminate the old defect. Its existing late-STOP gate assertion
checks the sibling path that already returned from inside `try/finally`.
The direct memo substitution and scripted lifecycle remain explicitly handler
consumer evidence, not a demonstrated physical replacement interleave.
An unchanged-test old-source negative and corrected-source positive remain
required; neither has been executed by this reviewer.

## Separate pre-start test-order proposal

**APPROVE** the following test-order-only supersession in the dedicated
pre-start case of
`test/wasm-service/bound-creation-physical-custody.integration.test.js:362–395`.
Starting from the installed 818-line source SHA256
`7f59f5869ee85849e2030e1cd28282f66e8bc893ea6f6965d40f1cf9c7532ce2`,
replace the single adjacent pair after `await host.driver.start(owned)` with:

```js
    assert.equal(calls, 0, 'OLD_CONTEXT_STARTED_A_SUCCESSOR_THROUGH_SERVICE_ID');
    assert.equal(answer.status, START_STATUS.FAILED);
```

Both checks, the actual-owner setup, the labelled old prepared-pointer seam,
and every successor object/state/storage assertion remain. No expected result
changes. The exact proposed complete file was derived in memory without
writing or executing it: 818 lines, SHA256
`b22348a23a705765b92be5480737b2532d79aa90570fd0209554a2fa83de7d6b`.
Approval applies to that exact resulting file if installed unchanged. Its
actual installation/hash must be recorded before the final control freeze.

The original source report at
`u1-handler-source-verdict-ac092686-20261019.md:243–258` expressly records that
the historical pre-start baseline first failed its carrier assertion. That
is not a substitute for a measured forbidden physical-call assertion. The
ordering correction makes the existing owner-invocation discriminator the
first failure when only the driver's currentness half is removed at
`src/runtime/wasm-component-driver-consensus.js:106–109`.

This dedicated case deliberately reinstalls I's old prepared descriptor
after real successor preparation. Consequently descriptor equality cannot
mask deletion of the separate physical-currentness check. The actual
service-keyed start would be invoked for J and `calls` would be nonzero.
The negative must reach this effect assertion with setup intact; it must
not be credited from an import failure, missing interface, timeout or
different response label. Actual corrected and source-only control results
remain pending.

The five reconstructed post-await cases remain byte-identical under this
proposed two-line reordering. Their new-byte oracle approval is the separate
`u1-reconstructed-post-await-oracles-independent-verdict-20261019.md`, SHA256
`84dee44a2cdd05723ef17d2845671dd2473cfd4a6f8d9673c4fa9d7de9126895`.
This record adds only the dedicated pre-start ordering disposition; it does
not claim whole-test execution or transfer missing historical test evidence.

## Bounds of both approvals

Neither approval certifies the ten earlier production commits between the
coherent source approval at `ac092686975dd22b4843be8df8e2e1d3663c0b7f` and
`a55ab41296faf30a4c404c56117eacbaa993c903`. Their nine-path source delta still
needs its own explicit bounded rebind/review. The current guard correction
does not repair or accept the separately identified request-Cell queued-START
shutdown interval.

No combined U1 acceptance, U2 implementation permission, production activation,
coordinator convergence, generic physical-generation safety, main merge or
release follows from this record. Exact candidate execution, meaningful
frozen-test controls, applicable generated/static checks and independent
final synthesis remain distinct gates.

| Additional source binding | SHA256 |
| --- | --- |
| Generic source before the one-guard move | `775850400bb74828f338cc97c9a316d72d7078e13b916a5e1d2fa373d7fa0a77` |
| `src/node/runtime-service-creation-execution.js` | `f7a68bd547d33128e410915ec4bda6c4cb944fa89df444a0a246fdd8fc96988e` |
| `src/runtime/wasm-component-driver-consensus.js` | `b3065d582982d581af810134bf3d74168818b253b83c3c113b84d392b461a0c3` |

This append-only evidence record is the reviewer's sole filesystem edit for
these two rulings.

## Checkpoint sequencing addendum

After the implementation inspection above, root installed the approved
pre-start assertion reorder and temporarily restored the one guard to its
original pre-try position so the test supersession can be committed as a
normal test-only checkpoint with its generated metadata. The reviewer then
independently checked the actual physical-test hash:
`b22348a23a705765b92be5480737b2532d79aa90570fd0209554a2fa83de7d6b`.
The complete test diff is exactly the approved two-line assertion reorder.
The temporarily restored generic source has its original hash
`775850400bb74828f338cc97c9a316d72d7078e13b916a5e1d2fa373d7fa0a77`;
no production diff was present at that sequencing check.

This deliberate test-before-source sequence does not withdraw or widen the
source approval. The implementation that was actually inspected and approved
is precisely `a8db277dc5bd861796d870478bd52397984e6e5d444a02000ad3604ff3af7f30`.
Root intends to reapply those same bytes immediately after preserving the
test-only checkpoint. The checkpoint must record its own commit/tree, and
the reapplied source must match that approved hash before its positive run.
The restored old source is not represented as the corrected implementation
or as an executed negative result.
