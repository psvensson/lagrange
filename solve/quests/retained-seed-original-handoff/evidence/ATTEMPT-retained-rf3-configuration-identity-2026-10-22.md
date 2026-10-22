---
audience: development
documentClass: evidence
---

# RF3 retained-origin witness: consume canonical configuration identity

Diagnostic lab #842 ran the unchanged settled-state predicate at exact source
`164479277f58f6075e0c6bfd214ba3d2654da3db` on tv-dator. The complete log is
4,148 bytes with SHA256
`8629963aae172e2b2e822cfc4d908f7c996307453bd3cc4daae66281c689df38`;
its untruncated worker log is separately bound in
`MEASUREMENT-retained-rf3-diagnostic-16447927-2026-10-22.json`. All execution,
thermal and container scopes closed. RF1 passed. RF3 failed its initial setup
assertion, before ENABLE, commit-carrier interception or origin transitions.

The captured last predicate evaluation has applied=commit=last=3, term=1,
complete history and pre-origin on every replica. All four configuration role
sets and autoLeave agree. Only r3's voters vector order differs from r1/r2.
Thus the ordered ConfState comparison is the sole false conjunct in this
diagnostic evaluation. The earlier #835 failure remains separate evidence:
it reports the same setup assertion but did not capture its predicate values.

The witness was re-deriving configuration identity with isDeepStrictEqual.
The existing `src/raft/raft-rs-conf-state-key.js` owner defines that identity
over voters, outgoing voters, learners, next learners and autoLeave; durable
storage and committed membership already consume that owner. Correct the
witness by comparing its canonical keys. Do not sort or rewrite persisted
history, replace the admitted-group fixture, add a fallback, or change the
production owner. This is a measured witness defect, not a retained-origin
production defect or a reason to relax the settled-frontier requirement.

The complete change to test behavior is that one comparison and its import.
Every other predicate conjunct, diagnostic observation, RF1/RF3 assertion,
deadline, runner selection and production byte stays unchanged. The original
negative evidence is retained. The source tree remains
`d2ce2fdae880c6b2ec9c78fbcc03f164ec3213ba`.

After independent review and normal metadata refresh, freeze the corrected
candidate and run the same fourteen-file runtime selection plus applicable
metadata and fast-static checks in the lab against that exact revision. Both
RF3 origin transitions must now engage and pass; a setup-only result does not
satisfy that proof. No handoff receipt, original seal, main merge or full-cutover
claim changes. The separately recorded inherited source precommit findings
remain explicit until their own repair and proof.
