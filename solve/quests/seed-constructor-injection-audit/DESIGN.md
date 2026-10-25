# Exact seed constructor injection audit

The demonstrated red is an audit false positive in unchanged production bytes.
`createBootstrapPartitionReplica` at af8 and the activation candidate has the
same method SHA256 `8281dc5aa5f0a442b3f5aaafe93fb08fed3dfff5fe4771cdf3771b973bc7c7cf`.
The checker conflates the independent constructor inputs
`systemTableCache: d.getSystemTableCache()` and
`sqlQueryEngine: cdcIntegrationService?.sqlQueryEngine` with a shared truth
choice. Neither expression reads a cache row or executes SQL.

The existing `passiveConstructionOccurrences` remains the only policy. Its
structural exemptions currently cover constructor names and option keys, then
fresh handles created and published in the same scope. They cannot infer the
meaning of an arbitrary getter or member projection. Generic getter-name or
whole-constructor exemptions would erase real read evidence.

The proposed extension therefore carries one explicit, owned injection
contract. It identifies the real caller file, class method, named imported
constructor and option positions. It verifies the provider delegate and handle
accessor bodies from their source owners, then marks only the exact identifier
occurrences in those proved arguments passive. It never exempts the surrounding
constructor, method or source file. The contract is unavailable if the owner
source is absent or its accessor shape changes. Pure in-memory source checking
receives no allowance unless the owner proof is supplied by the production
collector; an arbitrary method name cannot opt in.

Call-site proof includes exact lexical binding, constructor import provenance,
argument shape, and refusal of rebinding, computed access, mutation, unknown
calls or extra arguments at the admitted expression. Every actual cache/SQL
operation elsewhere remains evidence. Tests use the actual baseline owner and
engaged mutations of its argument expressions and provider proof, alongside the
existing category-complete construction negatives. This is audit classification
only; it changes no runtime authority or behavior.
