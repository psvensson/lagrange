# U1 F1: content-bound red evidence and implementation release

Reviewer: `subagent:/root`, 2026-10-18.

Decision: **the preserved independently executed F1 red witnesses satisfy the
reproduce-before-fix prerequisite for the approved F1 correction.** A new
Harnessd run remains requested, with no fresh execution result claimed here.

## Exact binding

| Artifact | Identity |
| --- | --- |
| Independently rejected original U1 | `a251ce4fd9c980a78c0fd33d8a5f873161f90870` |
| Continued lane before corrections | `f5717e6f53a3ae18c2f470a507a180c3eca2cc17` |
| Author's first test-only checkpoint | `0440cada679b0c056fb3ba423f573be0ff166829` |
| Remote test-only checkpoint for Harnessd | `f088943e4c487c7f06827ffd93b0eed69de4afd7` |
| Fixed remote ref | `refs/heads/probe/u1-f1-reservation-red-20261018` |
| Identical production source tree at original, continued lane and remote checkpoint | `97388f76ab4468da91b4a7eb9badc8b3c1804e62` |
| Exact common full tree for author and remote checkpoints | `225dac4913dd876c7716e4a0f9f743c4c81ea8ff` |
| Remote `test/service/service-consensus-creation-intent.test.js` SHA256 | `bee18660a45c472b16611e1a8dd3361c0cf56932d187444ff3e1820e5bf68bad` |
| Preserved independent-complete test SHA256 | `656e5e2ca870d68ec78b9f004d7bb94cd872c3f6f9259ad964af2b77a1071cc2` |

The author and remote commits differ because the GitHub commit API generates
its own author/time metadata. Their full trees were compared directly and are
identical. The production tree was compared separately against the original
independent-review subject.

The remote test file and the preserved independent-complete file have an
identical prefix through all three F1 witnesses (457 lines). The only remaining
test-file difference is omission of the preserved file's later 15-line
positive journal-only inventory control. No F1 race fixture, assertion or
production byte changed for this comparison.

## Already measured failures

All paths below are within
`verifier-recovery-u1-cloud/independent/` in this evidence directory.

| Witness | Preserved result and diagnostic |
| --- | --- |
| Temporary TARGET_ALREADY_OWNED, followed by delayed successful reservation of the same original request | `service-consensus-creation-intent.test.js.extended.tap`: cancelled original journal, null retained admission, admitted resource and empty inventory; `CANCELLED_JOURNAL_WITH_DELAYED_ADMITTED_RESOURCE` |
| Temporary INVALID_EXPECTED_STATE, followed by delayed successful reservation of the same original request | Same TAP: cancelled original journal and admitted resource; the same explicit obligation-loss diagnostic |
| Future binding becomes admissible after the temporary refusal | Same TAP: `FUTURE_BINDING_CANCELLED_BEFORE_EXACT_REQUEST_BECAME_ADMISSIBLE` |

The corresponding `service-consensus-creation-intent.test.js.extended.runner.log`
records 33 tests, 30 passing and these three failing. The independent report's
F1 finding binds the behavior to the source subject above. These are behavioral
failures, distinct from the separately retained Node 24 and fixture-prerequisite
failures. They are not inferred from an absent success marker.

The F1 author may now implement the already-approved owner-supplied
SEALED/UNRESOLVED reservation contract. The expanded test-only checkpoint and
subsequent green verification must remain separate evidence. Final F1
implementation approval requires an independent source review and executed
targeted evidence at the corrected candidate. No U1, U2 or release acceptance
is conferred by reusing this exact historical red proof.
