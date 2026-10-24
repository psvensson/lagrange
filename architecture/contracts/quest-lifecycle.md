# Quest Lifecycle Contract

> **Reading this contract.** The block below is the machine-readable
> `system-contract` consumed by `npm run model:contracts`. The prose sections
> explain its runtime bindings and the workflow obligations that remain with
> the author, independent reviewer and integration owner.

<!-- system-contract
{
  "schema": "system-contract-v1",
  "contractId": "quest-lifecycle",
  "status": "active",
  "owners": [
    {
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle"
    }
  ],
  "failureClasses": [
    "Quest acceptance changes after sealing",
    "attempts or findings exist only in chat and cannot be recovered from the Quest log",
    "source changes land without current independent verification",
    "a repair result is presented as distributed service or release acceptance",
    "competing writers or unrelated work obscure the changed interaction",
    "unavailable measurement is presented as success or terminal exhaustion",
    "pending work has no real request, observer or next action",
    "retired workflow operations are treated as current execution authority"
  ],
  "stateVariables": [
    "questStatus",
    "doneWhen",
    "sealedAt",
    "seal",
    "attemptEvents",
    "findingEvents",
    "lastVerification",
    "verificationIsCurrent",
    "attemptsSinceAltitudeCheck",
    "blockedNextOwner",
    "changedPaths",
    "epicAuthorizes",
    "terminalEvidence"
  ],
  "safetyInvariants": [
    {
      "id": "sealed-goalposts-immutable",
      "statement": "After start seals the quest, doneWhen remains identical to the sealed specification; land refuses a difference."
    },
    {
      "id": "sealing-requires-a-red-probe",
      "statement": "start seals only a valid draft whose doneWhen measures red, and records the sealing head and measurement."
    },
    {
      "id": "attempts-record-head-and-paths",
      "statement": "note --attempt requires a sealed quest and records the current head and changed-path summary; the append-only log retains the work history."
    },
    {
      "id": "source-landing-requires-current-verification",
      "statement": "land refuses a current rejection and requires an approving subagent verification newer than the last attempt for changed src/ paths; review policy also binds approval to reviewed content and evidence."
    },
    {
      "id": "terminal-comes-from-solver",
      "statement": "Only land records solved after a green sealed probe, required guards, staged-tree proof and scoped commit; note may record blocked, exhausted or superseded with the required fields."
    },
    {
      "id": "history-is-append-only",
      "statement": "Recorded findings, attempts, verifications and terminal evidence are preserved; a correction is a later entry, and a terminal quest accepts no new entries."
    },
    {
      "id": "scope-is-authorized",
      "statement": "For a non-legacy epic, land refuses changed paths outside its authorizes scope and the quest/epic record paths; a scope change requires an explicit decision under existing authority."
    },
    {
      "id": "acceptance-levels-remain-distinct",
      "statement": "A bounded repair result proves only its sealed claim; the owning service milestone and exact-candidate publication or release gates retain their separate acceptance requirements."
    }
  ],
  "livenessExpectations": [
    {
      "id": "agents-use-existing-authority",
      "statement": "Assigned author and integration agents exercise routine judgment, repair audits and land authorized work; independent verification and genuinely missing product/scope authority retain their own owners."
    },
    {
      "id": "repeated-attempts-reassess-the-cause",
      "statement": "The existing landing guard requires an altitude-check after more than three attempts since the previous one; reassess evidence, owner and scope without automatically escalating to the user or replacing the quest."
    },
    {
      "id": "review-converges-on-a-bounded-surface",
      "statement": "Independent review consolidates all reachable material findings in the agreed interaction, then rechecks repairs and invalidated risks while retaining applicable unaffected findings."
    },
    {
      "id": "accepted-repairs-integrate",
      "statement": "One integration owner can close and integrate an accepted repair while a different service-scenario cause remains open; one writer owns each changing interaction and independent work may proceed concurrently."
    },
    {
      "id": "pending-work-has-a-resumption-owner",
      "statement": "A pending run names its actual request or run, revision, workload, status and observer/resumption owner or mechanism; work without a submitted request or active continuation is reported as such."
    }
  ],
  "knownResiduals": [
    "The CLI validates verifier identity format and log order; reviewers and the integration owner must establish actual independence, content identity and evidence applicability.",
    "Role assignment, bounded review, WIP accounting and the current epic summary are workflow obligations, not an implemented scheduler or new Solver statuses.",
    "class: fix and legacy epics do not receive the non-legacy epic path-scope guard; their author and reviewer must preserve the statement scope.",
    "A blocked hold clears on a later attempt or typed finding in the projection; its owner must verify the missing input is actually resolved before recording that clearance.",
    "Historical Solver v1 entries and the cited theory ledger remain archive evidence only; their frontier, rung and executor operations are not current commands."
  ],
  "runtimeBindings": [
    {
      "path": "scripts/solve.js",
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle",
      "transition": "Quest CLI dispatch for start, note, probe, land, evidence add, and board (solve-v2)"
    },
    {
      "path": "scripts/solve/store.js",
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle",
      "transition": "append-only Quest event log and derived state projection"
    },
    {
      "path": "scripts/solve/schema.js",
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle",
      "transition": "quest.json, log entry and epic front-matter shapes and vocabularies (solve-v2)"
    },
    {
      "path": "scripts/solve/probes.js",
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle",
      "transition": "every doneWhen measurement: test-receipt, scenario-harness, oracle, script"
    },
    {
      "path": "scripts/solve/guards.js",
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle",
      "transition": "landing guards: change set, epic scope, static quality, coupled pairs, canonical import graph"
    },
    {
      "path": "scripts/solve/commands.js",
      "owner": "workflow_tooling_owner",
      "boundary": "quest_lifecycle",
      "transition": "start (seal against a red probe), note, probe, land (guards, npm test, commit, terminal solved), evidence add, board"
    }
  ],
  "modelBindings": [
    {
      "kind": "statechart",
      "artifact": "docs/specs/statecharts/quest-lifecycle.json",
      "properties": "current sealing, attempt, verification, blocked and terminal transitions, with forbidden goalpost, scope and closure shortcuts"
    },
    {
      "kind": "structural-constraint",
      "artifact": "scripts/check-system-contracts.js",
      "properties": "contract records retain valid Quest refs, runtime bindings, model artifacts and archived theory refs"
    }
  ],
  "metrics": [
    {
      "name": "Quest lifecycle statechart",
      "probe": "npm run model:statecharts"
    },
    {
      "name": "system contract registry",
      "probe": "npm run model:contract-records"
    },
    {
      "name": "Solver lifecycle regressions",
      "probe": "npm run test:file -- test/solve/commands.test.js test/solve/store.test.js test/solve/probes.test.js test/solve/guards.test.js"
    }
  ],
  "questRefs": [
    "solve/quests/rolling-restart-core-stability/quest.json"
  ],
  "theoryLedgerRefs": [
    "theory-20260522-experiment-theory-memory"
  ],
  "failureAnalysis": {
    "fmea": [
      {
        "failureMode": "Acceptance is edited or solved is asserted without a measuring green probe",
        "severity": "high - terminal status misrepresents the bounded result",
        "detectability": "high - start, probe and land expose measurements and sealed-predicate mismatch",
        "mitigation": "retain the seal, require land and its guards for solved, and explicitly supersede a changed premise",
        "probe": "npm run test:file -- test/solve/commands.test.js test/solve/probes.test.js"
      },
      {
        "failureMode": "Source landing proceeds with a missing, stale or rejected verification",
        "severity": "high - an unaccepted repair enters the baseline",
        "detectability": "high for log-order violations; content coverage and independence also require reviewer evidence",
        "mitigation": "record the reviewed content and consolidated findings, repair, append the next attempt and obtain current independent approval",
        "probe": "npm run test:file -- test/solve/commands.test.js"
      },
      {
        "failureMode": "Unrelated work joins a quest or multiple writers change one interaction",
        "severity": "medium - accepted results become difficult to attribute and integrate",
        "detectability": "epic scope guards detect unauthorized paths; interaction ownership is checked during planning and review",
        "mitigation": "use one writer per changing interaction, isolate unrelated work and retain the epic scope guard",
        "probe": "npm run test:file -- test/solve/guards.test.js"
      },
      {
        "failureMode": "A blocked input or separate scenario failure becomes an endless repair loop",
        "severity": "medium - accepted work waits or repeats without advancing the service milestone",
        "detectability": "current epic summary, blocked records and linked request or run artifacts expose the next owner and evidence gap",
        "mitigation": "evaluate bounded repair acceptance separately, route the remaining cause, and record a real continuation owner instead of inventing background progress",
        "probe": "npm run test:file -- test/solve/store.test.js test/solve/commands.test.js"
      }
    ],
    "stpa": [
      {
        "controller": "workflow_tooling_owner",
        "unsafeAction": "lands a quest after altering its seal or without required proof and verification",
        "feedbackSignal": "probe measurement, land refusal, attempt and verification entries, and terminal receipt",
        "ownerBoundary": "workflow_tooling_owner / quest_lifecycle"
      },
      {
        "controller": "workflow_tooling_owner",
        "unsafeAction": "presents repair acceptance or diagnostic movement as complete distributed service or release proof",
        "feedbackSignal": "separate quest, epic and exact-candidate publication acceptance records",
        "ownerBoundary": "workflow_tooling_owner / quest_lifecycle"
      },
      {
        "controller": "workflow_tooling_owner",
        "unsafeAction": "clears a hold or claims background execution without resolving or submitting the pending work",
        "feedbackSignal": "blocked next owner, linked request or run status and current epic summary",
        "ownerBoundary": "workflow_tooling_owner / quest_lifecycle"
      }
    ]
  }
}
-->

## Failure Classes

This contract covers changed acceptance, lost work history, stale verification,
unowned interactions and premature closure. It also separates three claims:
a bounded repair is accepted, the distributed service milestone is met, and an
exact candidate satisfies publication or release gates. Each keeps its own
existing authority and evidence.

## Invariants

`start` seals one measuring red `doneWhen`. `note --attempt` records the head
and changed paths. Only `land` writes `solved`, after measuring that unchanged
predicate green, enforcing scope and verification, proving the staged tree and
committing it. Other terminal outcomes are recorded explicitly. Logs are
append-only; terminal quests are not reopened by rewriting their history.

For source landing, the runtime requires an approving `subagent:<id>` entry
newer than the last attempt and refuses a current rejection. That check does
not establish actual independence or review coverage. The author and reviewer
must identify the reviewed content and evidence, consolidate material findings,
and renew approval for repairs and risks they invalidate. The existing
altitude guard requires a finding after more than three attempts since the
previous altitude check; it does not require human permission or a new quest.

## Runtime Bindings

`scripts/solve.js` owns dispatch. `scripts/solve/commands.js` owns sealing,
notes, probe projection and the landing sequence. `scripts/solve/store.js`
owns the record layout and derived state; `scripts/solve/schema.js` owns its
vocabulary. `scripts/solve/probes.js` owns measurements and required proof
artifacts. `scripts/solve/guards.js` owns changed-path, epic-scope, static,
interaction and canonical import-graph checks. The generated
[command reference](../../docs/steering/generated/solve-commands.md) lists
supported operations. Historical v1 operations are not current authority.

## Model Bindings

The [statechart](../../docs/specs/statecharts/quest-lifecycle.json) models current
sealing, attempts, review, blocked holds and terminal states. The contract
checker validates reference structure. These checks do not implement a job
queue or prove distributed service readiness. The legacy theory reference is
retained for historical traceability and grants no implementation authority.

## Operational Analysis

The author owns routine diagnosis and repair; independent verification owns
its verdict; one integration owner coordinates accepted work. Existing task
authorization continues across attempts and sessions. The user is needed for real
product/scope choices or missing authority. A recurring failure prompts a
recorded reassessment of cause, evidence and owner, not another approval ritual.

Use one writer per changing interaction, including its coupled boundary.
Independent investigation, review and other interactions may proceed in
parallel. Count waiting review, test and integration as work in progress.
Consolidate findings within a bounded review surface and retain applicable
unaffected evidence under the existing provenance and proof-selection rules.

Keep one current summary in the owning epic, linking the baseline, blocker,
accepted and pending work, evidence and next owner/action. The records it links
remain authoritative. A standalone `class: fix` uses its existing quest record
and log; no new epic is required solely for a summary. If a test or review
cannot proceed, name its real request
or run and resumption owner, or say that it has not been submitted and identify
the next action. Unavailable measurement is neither success nor exhaustion.

An accepted repair can close and integrate while a separate scenario cause
remains open. The service milestone and exact-candidate publication or release
gates retain their full requirements. FMEA/STPA identify where the runtime
refuses invalid claims and where reviewer and integration judgment must supply
the remaining evidence.
