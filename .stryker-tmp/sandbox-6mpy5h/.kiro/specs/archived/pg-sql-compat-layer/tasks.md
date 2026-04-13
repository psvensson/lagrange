# Implementation Plan: PostgreSQL SQL Compatibility Translation Layer

## Overview

Implement a PG-to-SQLite translation layer inside the existing `SQLParser`, adding new AST node types, translation functions, and SQL reconstruction support in `QueryExecutor`. The translation is a preprocessing step within the parse phase — no new execution paths are created.

## Tasks

- [x] 1. Add constants and type affinity map
  - [x] 1.1 Create `src/query/pg-compat-constants.js` with `PARSER_DIALECT`, `PG_TRANSLATE_ERROR`, `PG_EXTRACT_FORMAT`, `PG_DATE_TRUNC_FORMAT`, and new `EXPR_TYPE` values (`CAST`, `CASE`, `SUBQUERY`, `EXISTS`, `FUNCTION_CALL`)
    - Export all constants as frozen objects
    - _Requirements: 1.1, 6.3, 8.2, 8.3_
  - [x] 1.2 Create `src/query/pg-type-affinity.js` with `PG_TYPE_AFFINITY_MAP` and a `resolveAffinity(pgType)` function
    - Map all PG types listed in Requirement 6.3 to SQLite affinities
    - Return the input type uppercased if no mapping exists (pass-through)
    - _Requirements: 6.2, 6.3_
  - [x] 1.3 Write unit tests for type affinity map
    - Verify every documented PG type maps to the correct SQLite affinity
    - Verify unknown types pass through uppercased
    - _Requirements: 6.3_

- [x] 2. Implement core PG translation functions
  - [x] 2.1 Create `src/query/pg-translate.js` with stateless translation functions
    - `translateBooleanLiteral(expr)` — TRUE/FALSE → 1/0 literal nodes
    - `translatePositionalParam(expr, tracker)` — $N → parameter node, records index in tracker
    - `translateTypeCast(expr, convertExprFn)` — ::type and CAST → cast node with resolved affinity
    - `translateIlike(expr, convertExprFn)` — ILIKE → LIKE with LOWER-wrapped operands
    - `translateOnConflict(insertAst)` — ON CONFLICT DO NOTHING → orIgnore, DO UPDATE → orReplace
    - `reorderParams(params, paramMapping)` — reorder params array based on positional mapping
    - `validateParamMapping(mapping, paramsLength)` — check for gaps and out-of-bounds
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2, 14.1, 14.2_
  - [x] 2.2 Write property tests for core translation functions
    - **Property 3: Positional Parameter Round-Trip** — For any N sequential params in any order, reordering produces correct mapping
    - **Validates: Requirements 2.1, 2.2**
    - **Property 4: Boolean Literal Normalization** — For any expression with TRUE/FALSE, translation produces 1/0
    - **Validates: Requirements 5.1, 5.2**
    - **Property 10: ON CONFLICT Translation** — For any INSERT with ON CONFLICT variants, correct flags are set
    - **Validates: Requirements 4.1, 4.2**
    - **Property 11: ILIKE Translation** — For any ILIKE expression, LOWER wrapping is applied
    - **Validates: Requirements 14.1, 14.2**
    - _Requirements: 2.1, 2.2, 4.1, 4.2, 5.1, 5.2, 14.1, 14.2_

- [x] 3. Implement function registry and date/time translation
  - [x] 3.1 Create `src/query/pg-function-registry.js` with `PG_FUNCTION_MAP`
    - Implement translator functions: `translateConcat`, `translateSubstring`, `translateNow`, `translateCurrentDate`, `translateCurrentTime`, `translateExtract`, `translateDateTrunc`
    - Implement pass-through entries for: `length`, `lower`, `upper`, `trim`, `coalesce`, `nullif`, `substr`
    - Export `translateFunctionCall(name, args, convertExprFn)` that looks up the registry and applies the translator
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3_
  - [x] 3.2 Write property tests for function registry
    - **Property 6: Function Registry Translation** — For any registered function, translation produces correct SQLite expression
    - **Validates: Requirements 7.2**
    - **Property 7: Unknown Function Pass-Through** — For any unregistered function name, pass-through preserves name
    - **Validates: Requirements 7.4**
    - **Property 8: EXTRACT Translation** — For any supported field, correct strftime format is used
    - **Validates: Requirements 8.2**
    - **Property 9: DATE_TRUNC Translation** — For any supported precision, correct strftime format is used
    - **Validates: Requirements 8.3**
    - _Requirements: 7.2, 7.4, 8.2, 8.3_
  - [x] 3.3 Write unit tests for function registry
    - Test each specific mapping: CONCAT → ||, SUBSTRING → SUBSTR, NOW → datetime('now'), etc.
    - Test EXTRACT with each supported field
    - Test DATE_TRUNC with each supported precision
    - Test error on unsupported EXTRACT field and DATE_TRUNC precision
    - _Requirements: 7.3, 8.1, 8.2, 8.3_

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Extend SQLParser for dual-mode parsing
  - [x] 5.1 Modify `SQLParser` constructor to accept `options` with `dialect` field
    - Import `PARSER_DIALECT` from `pg-compat-constants.js`
    - Add `PARSER_CONFIG.DATABASE_PG = 'postgresql'` constant
    - Select `node-sql-parser` database mode based on `this.dialect`
    - When dialect is `'postgresql'`, apply PG-specific AST translations during `convertAst()`
    - Track positional parameters in `this.positionalParams` array
    - Attach `_paramMapping` to the returned AST when in PG mode
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 5.2 Add PG-specific expression conversion in `convertExpression()`
    - Handle `node-sql-parser` PG AST node types for: type casts (::), ILIKE, boolean literals, positional params ($N), CASE WHEN, EXISTS, function calls
    - Delegate to translation functions from `pg-translate.js` and `pg-function-registry.js`
    - _Requirements: 5.1, 5.2, 6.1, 6.2, 7.2, 8.2, 8.3, 11.1, 11.2, 14.1, 14.2_
  - [x] 5.3 Add subquery and derived table conversion
    - Handle subqueries in WHERE (IN subquery, scalar subquery, EXISTS)
    - Handle derived tables in FROM clause
    - Recursively call `convertSelect()` for inner queries
    - _Requirements: 9.1, 9.2, 9.3, 12.1_
  - [x] 5.4 Add CTE and set operation conversion
    - Parse WITH clause and preserve CTE definitions in AST
    - Handle WITH RECURSIVE
    - Parse UNION, UNION ALL, INTERSECT, EXCEPT and represent in AST
    - _Requirements: 10.1, 10.2, 10.3, 13.1_
  - [x] 5.5 Add RETURNING clause conversion for INSERT/UPDATE/DELETE
    - Extract RETURNING clause from PG AST and store in Internal_AST
    - Handle both column list and * forms
    - _Requirements: 3.1_
  - [x] 5.6 Add ON CONFLICT conversion for INSERT
    - Detect ON CONFLICT DO NOTHING → set orIgnore
    - Detect ON CONFLICT DO UPDATE → set orReplace
    - _Requirements: 4.1, 4.2_
  - [x] 5.7 Write property tests for SQLParser PG mode
    - **Property 1: Backward Compatibility** — For any valid SQLite SQL, parsing with default dialect produces unchanged AST
    - **Validates: Requirements 1.2**
    - **Property 2: Dual-Dialect AST Equivalence** — For any SQL valid in both dialects, PG and SQLite mode produce identical ASTs
    - **Validates: Requirements 1.3**
    - **Property 5: Type Cast Translation Round-Trip** — For any cast with PG type, correct affinity and valid SQL reconstruction
    - **Validates: Requirements 6.1, 6.2, 6.4**
    - _Requirements: 1.2, 1.3, 6.1, 6.2, 6.4_
  - [x] 5.8 Write unit tests for SQLParser PG mode
    - Test PG-specific syntax: $1 params, ::type casts, ILIKE, TRUE/FALSE, ON CONFLICT, RETURNING
    - Test subqueries, CTEs, CASE WHEN, derived tables, set operations
    - Test error cases: invalid SQL, param gaps, out-of-bounds params
    - _Requirements: 1.4, 2.3, 2.4, 3.1, 3.2, 3.3, 4.1, 4.2, 9.1, 9.2, 9.3, 10.1, 10.3, 11.1, 11.2, 12.1, 13.1_

- [x] 6. Extend QueryExecutor for new AST node types
  - [x] 6.1 Add new cases to `buildExpressionSQL()` in `query-executor.js`
    - Handle `cast` → `CAST(expr AS affinity)`
    - Handle `case` → `CASE WHEN ... THEN ... ELSE ... END`
    - Handle `subquery` → `(SELECT ...)`
    - Handle `exists` → `EXISTS (SELECT ...)`
    - Handle `function_call` → `name(args)`
    - _Requirements: 6.4, 9.4, 11.3_
  - [x] 6.2 Add CTE prefix to `buildSelectSQL()`
    - Prepend `WITH [RECURSIVE] name AS (...), ...` when `ast.ctes` is present
    - _Requirements: 10.2_
  - [x] 6.3 Add RETURNING suffix to `buildInsertSQL()`, `buildUpdateSQL()`, `buildDeleteSQL()`
    - Append `RETURNING col1, col2` or `RETURNING *` when `ast.returning` is present
    - _Requirements: 3.2, 3.3_
  - [x] 6.4 Add derived table support to `buildSelectSQL()` FROM clause
    - When `ast.from.subquery` is present, emit `(SELECT ...) AS alias` instead of table name
    - _Requirements: 12.2_
  - [x] 6.5 Add set operation support to `buildSelectSQL()`
    - When `ast.setOperation` is present, append `UNION/INTERSECT/EXCEPT SELECT ...`
    - _Requirements: 13.2_
  - [x] 6.6 Write unit tests for QueryExecutor new AST node reconstruction
    - Test CAST, CASE, subquery, EXISTS, function_call SQL reconstruction
    - Test CTE prefix, RETURNING suffix, derived table FROM, set operations
    - _Requirements: 3.2, 3.3, 6.4, 9.4, 10.2, 11.3, 12.2, 13.2_

- [x] 7. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Wire dialect through SqlRequest and adapters
  - [x] 8.1 Add optional `dialect` field to `createSqlRequest()` in `sql-request.js`
    - Add `dialect: fields.dialect ?? null` to the request object
    - Update `isSqlRequest()` to accept optional dialect field
    - _Requirements: 15.2, 15.3_
  - [x] 8.2 Update `PostgresWireAdapter.execute()` to pass `dialect: 'postgresql'` in SqlRequest
    - Import `PARSER_DIALECT` from `pg-compat-constants.js`
    - Add `dialect: PARSER_DIALECT.POSTGRESQL` to `createSqlRequest()` call
    - _Requirements: 15.1_
  - [x] 8.3 Update `SQLQueryEngine.executeQuery()` to pass dialect to SQLParser
    - Extract `dialect` from options (passed from SqlRequest)
    - Create `new SQLParser(sql, {dialect})` instead of `new SQLParser(sql)`
    - Handle `_paramMapping` on AST to reorder params when present
    - _Requirements: 15.2, 15.3_
  - [x] 8.4 Update `SQLQueryEngine.executeRequest()` to forward dialect from SqlRequest to executeQuery options
    - Pass `dialect: sqlRequest.dialect` in the options object to `executeQuery()`
    - _Requirements: 15.2_
  - [x] 8.5 Write unit tests for dialect wiring
    - Test PostgresWireAdapter creates SqlRequest with dialect='postgresql'
    - Test SqlCore forwards dialect to parser
    - Test internal queries (no dialect) use SQLite mode
    - _Requirements: 15.1, 15.2, 15.3_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (fast-check, numRuns: 10)
- Unit tests validate specific examples and edge cases
- All new constants go in `pg-compat-constants.js` — no string/number literals in code
- The translation layer is entirely within the parse phase; QueryExecutor and partition handlers see standard Internal_AST
