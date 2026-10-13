# Baseline source census

Base: `e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f`.

## Exact files

| Path | Lines | SHA-256 |
| --- | ---: | --- |
| `src/rebalancer/replica-operation-message-group-promotion.js` | 457 | `589ff7f6059a20252c6a886aeac018e0c04942573ddc39550ecebb78bb6e4382` |
| `src/rebalancer/replica-operation-message-group-learner-successor.js` | 227 | `0ebebdeafc727b79742c55d05cdec0033da6fcb000b8e65a4a08ad1c2335cda0` |
| `src/rebalancer/replica-operation-message-group-membership-authorization.js` | 701 | `f538d0317409642e4265a53d46fb82c42c6c7465daa8fb7a15833b948c07fa10` |
| `src/rebalancer/replica-operation-message-group-membership-permit.js` | 192 | `20822a12027a4e375402324ea676496e028b133925e40ef37cf2904b92f918c1` |

Both orphan modules were added to this lineage by
`4151a3ab4cf3859651507d2f575a49754deb8f61`, whose subject is
`Ephemeral exact-byte proof snapshot only; not reviewed or landed`.

## Caller and composition result

Source, test and script search finds no import of either orphan module and no
outside call to `selectMessageGroupPromotion`,
`recordMessageGroupVoterOutcome`, `recoverMessageGroupVoterOutcome`,
`recordedVoterFactIsValid`, `issueMessageGroupLearnerSuccessor` or
`canonicalBootIncarnation`.

`replica-operation-message-group-promotion.js` is the sole outside consumer of
`canonicalBootIncarnation`; the learner-successor module has no other caller.
The remaining search matches are definitions, their internal calls, exports,
and two comments in the membership-authorization owner.

`replica-operation-repository-message-group-membership-methods.js` binds the
current initial learner observation, claim, authorization, recording/recovery
and generic branch-selection methods. It binds neither orphan module.

### Wording correction recorded 2026-10-13

The earlier "no import of either orphan module" statement refers to callers
outside the two-module island. Promotion itself imports learner-successor and
is its sole caller of `canonicalBootIncarnation`; no source, test or script
outside that island imports or calls either module. This corrects the wording,
not the measured absence of a live composition-root caller.

The exclusive deletion inventory names `recordedLearnerCreateBasis`,
`recordedLearnerOrigin` and `RECORDED_LEARNER_FACT_COLUMNS`. Preserve
`NONCOMMITTED`, `canonicalAbsenceObservation`, `absenceFencesLearnerAction`,
`learnerActionAbsence`, `notRecorded` and `learnerObservationRefusal`, which
remain live in the current initial learner recorder. Eight other internally
live helpers are de-exported only, as named in the design.

The impact-contract registry contains current learner observation,
authorization, repository/recovery, permit and native/partition promotion
owners. It contains neither orphan path. Deletion therefore removes no
registered current owner interaction or witness edge.

## Baseline red

The archived focused dependency command exits 1 on exactly one error: the
promotion module imports absent
`src/raft/learner-catch-up-acknowledgement.js`. It cruises 15 modules and 36
dependency edges. This is the seal-time discriminator. Full dependency/static
commands may also report independently owned baseline debt; those reports
cannot substitute for this exact edge or for the required behavioral
preservation receipts.
