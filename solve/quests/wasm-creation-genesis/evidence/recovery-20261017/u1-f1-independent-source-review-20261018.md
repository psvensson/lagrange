# U1 F1: independent source review

Reviewer: `subagent:/root`, 2026-10-18. Implementation author:
`subagent:/root/u1_finality`.

**Source-review verdict: APPROVE. F1 execution acceptance remains PENDING.**
No fresh source test has executed for this verdict. This bounded source review
does not close U1 or release its U2 dependency.

## Reviewed candidate

| Identity | Value |
| --- | --- |
| Author source checkpoint | `61c78f69aa244bbec07ff213ab35855166b30c75` |
| Last test-only parent | `1b3ef886` (ancestor of the exact source checkpoint above) |
| Remote verification checkpoint | `77a888af01f13e30052135075964c6508b1d0b24` |
| Fixed remote ref | `refs/heads/probe/u1-f1-finality-candidate-20261018` |
| Author/remote identical full tree | `240db7714a4979c87aea8f70d28e20e9119f7359` |
| Approved contract | `u1-correction-proposal.md`, F1 section, and `u1-reservation-finality-bounded-verdict.md` |
| Measured original defect | `u1-f1-historical-red-binding-20261018.md` |

The complete four-file production delta is 62 inserted and 27 removed lines.
The reviewer read the changed code in its owner context, including resource
input capture, binding validation, state decoding and deterministic decisions,
bounded CAS submission/reread, journal capture, token retention, cancellation
and terminal observations. The complete added oracle surface in the three
targeted test files was also inspected. Author and remote full trees were
compared after fetching the published ref and are identical.

## Finality census

| Public reservation result class | Required and implemented finality | Reason |
| --- | --- | --- |
| Absent binding whose version is no greater than retained state version | SEALED | The authoritative selection version cannot decrease and this exact binding is absent from both selected and retiring retention |
| Absent future binding, or service never selected | UNRESOLVED | The same valid request can later become admissible |
| Requested ordinal below retained ordinal | SEALED | The resource ordinal cannot decrease |
| Same ordinal with another winning operation or different immutable request body | SEALED | That ordinal's retained winner cannot become this exact request |
| Exact matching admission, including retiring instance and CLOSED phase | ADMITTED, no refusal tag | Exact history is returned before considering a new reservation; closed old work is never converted into a fresh admission |
| Retiring binding needs a new reservation | SEALED | The existing resource owner admits no new slot for that retiring binding |
| Exact next ordinal overflows the accepted counter domain | SEALED | This exact immutable request cannot become representable later |
| Future ordinal, current live-slot occupancy, or another slot temporarily holds the target replica | UNRESOLVED | Owner state may legally change to admit this same request |
| Capture/validation or admitted-slot/state encoding failure | UNRESOLVED | A representational failure is not the deterministic ordinal-overflow fact |
| Missing, unavailable or corrupt owner observation; unknown submission/reread; exhausted bounded zero-CAS retries | UNRESOLVED unless the permitted authoritative reread itself proves one of the sealed facts above | The wrapper supplies no new negative authority and the existing mutation/re-observation bounds remain intact |

Only `reserveResourceState` assigns SEALED. The public reservation wrapper
preserves that deterministic result and marks every other negative answer
UNRESOLVED. It validates the full supplied binding through the existing binding
owner before allowing version-based finality; malformed input cannot exploit
the absent-old-binding branch.

The REMOVE-time consumer no longer contains an outcome-name finality set.
It cancels only an explicit SEALED result. Missing, unrecognized and UNRESOLVED
tags preserve the PENDING row and answer UNKNOWN with the owner's reason.
An ADMITTED result is validated and durably reread after the token write before
retirement receives it. The same immutable intent and operation ID are reused.
No new reservation or cancellation retry loop was introduced.

The two terminal reread edges are also correct: a terminal journal observed
while recording admission remains a `TERMINAL_OPERATION` answer, and a
different terminal state winning the cancellation CAS is reported as that
state. Resource uncertainty does not erase a confirmed journal observation.
Malformed retained journal identity continues to fail through the journal
owner before a resource call. Original journal completion is unchanged by F1
and remains part of the separate F2–F6 correction.

## Complete bounded review categories

| Category | Disposition |
| --- | --- |
| Owner interaction | Finality is supplied by the deterministic resource owner; journal terminal state stays with the journal owner; no caller policy duplicates outcome classification |
| Admission gating | Full request/binding capture precedes decisions; exact token is captured and confirmed before retirement; only explicit SEALED can admit cancellation |
| Concurrency serialization | Delayed original reserve cannot be invalidated by a temporary refusal; existing exact-predicate CAS/re-observation semantics are unchanged; concurrent terminal rereads remain authoritative |
| Recovery replay | Temporary refusal retains exact PENDING bytes, operation ID and later inventory obligation; old exact CLOSED admission remains replayable history without reopening |
| Transport delivery | Lost or unknown reserve/write answers do not become final absence; bounded reread distinguishes known terminal state from unknown submission |
| Harness fidelity | Original race cases use the real SQLite resource and journal owners; new handler cases explicitly use a scripted runtime for protocol ordering and do not claim native physical custody; complete executed proof remains pending |
| Formation circularity | No version prediction, runtime policy call or reservation refusal grants a new physical instance; no new formation trigger is introduced |
| Retry loops | Existing bounded resource CAS loop is unchanged; REMOVE retains caller retry custody for unresolved outcomes, with no autonomous loop |
| Sweep/timer | No scheduler, timer, polling or scan mechanism changes in F1; inventory lifetime and physical task joins remain independently reviewed F2–F6 work |

## Evidence still required before bounded F1 acceptance

Execute, under the locked deployed lab profile, these complete files at the
remote verification checkpoint:

- `test/control-plane/service-instance-creation-cas.test.js`
- `test/service/service-consensus-creation-intent.test.js`
- `test/node/runtime-service-bound-route.test.js`

Preserve actual planned/completed counts and the complete first failure. A
zero-test prerequisite, truncated tail, nonterminal controller receipt or
inherited failure is not a green result.

Required focused negative controls should remove the owner guarantee and the
consumer guarantee independently: seal temporary occupancy, seal a future
binding, and restore outcome-name cancellation for untagged refusals. The
preserved delayed-admission and future-selection races must fail again, and
the real closed-resource/terminal controls must remain meaningful. Additional
mutations are warranted only for a concrete uncovered edge or the required
combined U1 checklist.

The author's scoped lint, literal, decision-boundary, runtime-grammar,
cyclomatic/cognitive and metadata-gateway reports were read. They report no
new violations in the four source targets. The normal Node 22 pre-commit report
also records four analyzed source files; the separate default-sandbox Git
EPERM attempt is a prerequisite failure. These reports are author preflight,
not an independently executed source corpus. Generated metadata/seals and the
combined corrected-U1 gates remain outstanding.
