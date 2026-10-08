# Operator decision: J1 and bounded implementation continuation

Date: 2026-10-08. Authority: the user's instruction in the continuation:
"Thank you. I agree with your recommendations. There is a way for you to git
push. Please find it. Then please continue with the recommended implementation".
This follows the requested adversarial self-review of published head
41a8cdfb33ddc4acddafa192f7f5141a6ae38119 and the separately retained local packet.

## Approved policy

For the initial FreshMG cutover, once promotion of the exact fresh target T
is DURABLY AUTHORIZED, do not automatically remove T as failure compensation.
Preserve the target and reconcile forward through the EXISTING operation and
membership owners. Promotion authorization, not merely observed promotion or
source-removal authorization, is the conservative branch boundary.

Before that boundary, removal of a failed learner T is permitted only after
the existing owners definitively resolve or fence outstanding admission and
promotion work. Timeout, cache absence, ordinary terminal status, or one
configuration observation is not such a fence. Successful retirement removes
old source S; failed-learner cleanup removes T only in its permitted branch.
The immutable S/T identities, exact operation/context and generation bindings
must never be swapped to fit a permit field.

If the promoted target cannot recover, retain the unresolved membership
obligation and its lane and expose an explicit operator-required blocker.
Do not claim that the blocker itself implements recovery. No destructive
operator action, same-voter empty-history reconstruction, automatic lane
release or successful replacement is authorized by this decision. Reconcile
this bounded availability limitation against the original failure controls;
a contradiction requires an explicit recorded contract decision, not weaker
tests. Post-promotion abandonment is deferred and not part of this cutover.

Normal request settlement, membership serialization, source-own applied
absence, quorum/leader absence, physical cleanup and storage accounting retain
their distinct existing owners. No new universal reservation release point.

## Work approved next

1. Preserve both saved work packets without overwriting the newer six-case
   real-repository GCP diagnostic. Publish the supplemental fixture with its
   distinct name and retain original files and hashes as historical evidence.
2. Correct the demonstrated harness engagement blind spots and the two
   bounded review findings (Node 22 before any Node invocation; four identity
   dimensions rather than three). Do not relabel old evidence as newly run.
3. Trace and test the terminal-operation recovery/dispatch entry with retained
   exact membership obligation. Classify actual owner behavior before opening
   a production repair; do not add a speculative local guard, queue or store.
4. Finish C0 as a classification/contract gate. Precisely classified missing
   FreshMG/snapshot implementation belongs to the next measured-red product
   unit; C0 must not demand those future implementations while forbidding
   their source changes. Its existing acceptance remains sealed.
5. Resume the existing FreshMG and snapshot owner interactions with bounded
   implementation and Actions/GCP proof. Actual multi-host acceptance follows
   deterministic engagement and applicable source verification.

## Publication and verification

Work branch: integrate/rs-raft-contract-first-20261008. Preserve main, PR #73,
all salvage refs and local worktrees. Non-main commits/pushes are preservation,
not terminal Solver landing, source approval or release certification.
The requested self-review is recorded as AUTHOR SELF-REVIEW, never as an
independent verifier. Existing independent rejections and review requirements
remain in force. A1-v13 compatibility waits for the final exact cutover proof.

GitHub write operations were rediscovered in this continuation. The supported
publication routes are Git data create_blob/create_tree/create_commit with a
non-force expected-head update_ref, or scoped git commit/push within GitHub
Actions using its repository GITHUB_TOKEN. Neither requires exporting a token
into the chat container. Verify the resulting remote SHA after each push.
