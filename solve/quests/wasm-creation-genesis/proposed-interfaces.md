# R2 component oracle: proposed callable shapes

Test author proposal, not source or independent approval. Preserve R2 semantics.
The existing `ServiceDefinitionsOwner` constructor remains
`{controlPlaneSystemTableGateway, systemTableCache?, catalogOwner}`. The catalog
is the actual `ServiceInstallCatalogOwner`, with one immutable package/revision
recorded through production methods before creation; creation never inserts
per-request catalog rows.

All methods below are async, and return named `outcome` values. Protocol refusals
return data; environmental uncertainty returns `UNKNOWN`. Fresh permission must
be obtained separately from a historical selected result.

`selectConsensusInstance(request)` accepts exactly R2's canonical request:
`{format:1, requestId:{serviceDefinitionId,expectedVersion,nonce}, tenantId,
expectedIncarnation, action:'CREATE'|'RETIRE', revisionId, definition, profile,
foundingPeers}`. For CREATE, definition is the immutable effective definition
stored in the referenced revision config (`config.definition`), profile is
`'wasm-writer-v1/1'`, foundingPeers is a sorted array of `{replicaId,nodeId}`.
RETIRE uses null revisionId/definition/profile/foundingPeers. First expected
incarnation is null. Existing identity derivation remains authoritative; a new
export from its current owner, `deriveServiceDefinitionId(tenantId, serviceName)`,
is proposed to avoid duplicating it in consumers/tests.

Selection results:
- `{outcome:'SELECTED'|'RETIRED', requestId, selectionVersion, binding}`;
  RETIRED binding is null. Exact winner replay returns this original object.
- `{outcome:'CONFLICT', expectedVersion, winnerRequestId}` is fixed per decided
  version, independent of losing K/content. Altered winner content returns
  `{outcome:'CONTENT_CONFLICT',requestId}`.
- `{outcome:'HISTORY_UNAVAILABLE',requestId}` below retained frontier;
  `{outcome:'INVALID_EXPECTED_STATE'|'TRANSITION_HELD'|'UNKNOWN',requestId}`.

Binding fields: `{format:1,tenantId,serviceDefinitionId,requestId,
selectionVersion,incarnation,revisionId,definitionDigest,profileDigest,
foundingPeers}`. Domain-separated digest construction belongs to source codec.
Tests consume returned B; they never invent its incarnation.

`reserveInstanceResource(binding, slotRequest)` consumes immutable
`{slot,expectedOrdinal,operationId,replicaId,nodeId}`. Directory/route canonical
identity is derived by existing owners from B and peer identity, not a raw path.
Returns `{outcome:'ADMITTED',token,phase:'ADMITTED'}`. Token is
`{serviceDefinitionId,incarnation,selectionVersion,slot,ordinal,operationId,
bodyDigest}`. Exact replay returns original ordinal and current phase; altered
same operation body is `CONTENT_CONFLICT`; competing operation for the same
ordinal is `CONFLICT` with `winnerToken`; cross-slot same target is
`TARGET_ALREADY_OWNED`; wrong current B is `STALE_BINDING`.

`resolveInstanceResource(binding,token)` returns `{outcome:'RESOURCE',token,
phase:'ADMITTED'|'PUBLISHED'|'CLOSED'}` for current retained attempt;
lower ordinal is `HISTORY_UNAVAILABLE`, wrong binding is `STALE_BINDING`.
`grantInstanceResource(binding,token)` returns `{outcome:'PUBLISHED',token}`
only if B remains selected and retiring resources are all CLOSED. Otherwise
`STALE_BINDING`, `PREDECESSOR_OUTSTANDING`, or `RESOURCE_CLOSED`; no new token.
`closeInstanceResource(binding,token)` is a trusted lifecycle-owner ingress
after its local RETIRED proof, returns `{outcome:'CLOSED',token}`; repeated exact
close is identical. This component oracle calls that boundary explicitly and
does not claim to establish the local retirement prerequisite. Unknown/stale
tokens cannot close another resource. Closure never reopens or changes ordinal.

`getCurrentInstance(serviceDefinitionId)` returns `{outcome:'CURRENT',version,
selected:binding|null,retiring:binding|null,decisionFrontier}`; never-created is
version0/selected null/retiring null/frontier0. This is fresh authority distinct
from historical selection replies. Retained DB JSON minimally exposes
`version`, `decisions` (max16) and selected/retiring instance records with
`binding` and `resources` (exact9 slots). Null selected does not delete the row.

The test fixture uses actual owner/gateway/CDC and SQLite WHERE evaluation. Its
SQL-engine adapter is explicitly component-only, with held SQL submissions and
lost response injection. It is not a native QueryEngine/Raft or process proof.
