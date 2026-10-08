# Unadopted claim interface draft

This is the exact, unrun draft from a52074d384961b18fe0d2ff1a155bfb05105cca4.
Its bytes are retained as unadopted-claim-interface-a52074d.txt (Git blob
a13c18eb46836283e80d1d0e47bcac8bea12fdcc). It is not an active regression or
accepted API contract. No runtime implementation was added to satisfy it.

The live source census found the newer work/freshmg-branch-authorization-20261008
implementation at 01463d0cda429840aeeb31cb17efae4f34a1d11c, whose request-object
interface and recorded/unknown outcomes differ from this early proposal.
The continuation uses that existing repository implementation and extends
message-group-membership-branch-authorization.test.js instead. It does not
introduce a second claim owner, API or parallel regression framework.

The bounded NULL-lease correction is preserved in PR #105. Its original GCP
red/green/mutant run is 37765480208. Terminal non-admission work is a separate
increment. This move only retires this continuation's unrun proposal from the
test census; no existing failing production regression was removed, no
history was rewritten, and every proposed byte remains available here and
at the original commit.
