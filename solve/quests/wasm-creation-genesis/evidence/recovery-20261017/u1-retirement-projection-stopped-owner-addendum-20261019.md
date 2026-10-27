# U1 projection debt: stopped-owner exclusion

Status: mandatory scope clarification of the existing U1 debt contract and
activation prerequisite A5; independently selected by `subagent:/root` after
the independent physical/manager review. No new asynchronous projection
continuation is approved here.

The original projection-debt clarification remains preserved at SHA256
`339fb399f23e9c91c41482bcafd07e81da541e3c06ec724c87e0667d9c6b637a`.
Its phrase about a returned STOPPED row and non-retained writer result is
insufficient if applied without the writer's actual result contract.

The live `RuntimeReplicaStateProjectionOwner.submit` returns
`{retained: false, state: 'stopped', ...}` after its owner has shut down. It
performs no row write in that branch. `_projectReplicaState` can still wrap
the requested STOPPED row around that answer. The requested row is input,
not an applied-write receipt. U1 must refuse this known zero-effect result
and retain RETIRED_UNPROJECTED plus the original journal debt. It must never
call the original journal completion CAS on that answer. A direct witness
must engage the actual stopped projection owner while the old ACTIVE row
and original IN_PROGRESS journal remain, not invent an APPLIED result.

The existing `activation-prerequisite-audit.md`, section 4, already records
both this explicit exclusion and the live owner's always-RETAINED result.
The complete RETAINED-to-APPLIED continuation, exact receipt lifetime,
supersession and eventual endpoint/PRESENT continuation remain A5. They are
not pulled into U1 or declared supplied by its synchronous embedding.

The U1 boundary may consume a narrow named refusal/settlement classification
from the existing projection contract. It must not infer successful apply
from an absent retained flag, an echoed desired row, an event name alone,
or a stopped owner. The embedding's direct asynchronous writer proves only
its stated completion contract. Corrected U1 evidence must retain that
ceiling and leave A5 explicitly open.
