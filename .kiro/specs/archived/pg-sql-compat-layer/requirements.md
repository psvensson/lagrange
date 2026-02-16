# Requirements Document

## Introduction

This feature adds a PostgreSQL SQL compatibility translation layer to the distributed database system. The system currently parses SQL using `node-sql-parser` in SQLite mode, converts to an internal AST, reconstructs SQL, and executes against `better-sqlite3` at the partition level. The translation layer enables external clients to submit PostgreSQL-dialect SQL, which is transparently translated to SQLite-compatible SQL before reaching the existing execution pipeline. Internal system queries continue using SQLite dialect unchanged.

## Glossary

- **SQLParser**: The existing SQL parser wrapper class (`src/query/sql-parser.js`) that uses `node-sql-parser` to parse SQL and convert to the internal AST format.
- **SqlCore**: The main SQL execution coordinator (`SQLQueryEngine` in `src/query/sql-query-engine.js`) that orchestrates parsing, routing, and execution.
- **QueryExecutor**: The component (`src/query/query-executor.js`) that reconstructs SQL from the internal AST and executes it on partition services.
- **PostgresWireAdapter**: The existing adapter (`src/query/postgres-wire-adapter.js`) that bridges authenticated PostgreSQL protocol sessions to SqlCore via SqlRequest objects.
- **Translation_Layer**: The new preprocessing component that converts PostgreSQL-dialect AST nodes into SQLite-compatible AST nodes before they enter the existing execution pipeline.
- **Function_Registry**: An extensible mapping structure that translates PostgreSQL function names to their SQLite equivalents.
- **Type_Affinity_Map**: A mapping structure that translates PostgreSQL type names to SQLite type affinities (TEXT, INTEGER, REAL, BLOB, NUMERIC).
- **Internal_AST**: The internal AST format used by QueryExecutor, defined by `AST_TYPE` and `EXPR_TYPE` constants in `sql-parser.js`.
- **Dialect_Mode**: A configuration option on SQLParser that selects between `'sqlite'` (default, current behavior) and `'postgresql'` parsing and translation.

## Requirements

### Requirement 1: Dual-Mode Parser

**User Story:** As a developer integrating PostgreSQL clients, I want the SQL parser to accept PostgreSQL syntax, so that external clients can use familiar PG SQL without modification.

#### Acceptance Criteria

1. WHEN Dialect_Mode is set to `'postgresql'`, THE SQLParser SHALL parse SQL using `node-sql-parser`'s PostgreSQL database mode.
2. WHEN Dialect_Mode is set to `'sqlite'` or omitted, THE SQLParser SHALL parse SQL using `node-sql-parser`'s SQLite database mode, preserving current behavior.
3. WHEN Dialect_Mode is `'postgresql'` and parsing succeeds, THE SQLParser SHALL produce an Internal_AST that is identical in structure to the AST produced by SQLite-mode parsing of the equivalent SQLite SQL.
4. IF parsing fails in either dialect mode, THEN THE SQLParser SHALL throw an error with a descriptive message including the original SQL.

### Requirement 2: Positional Parameter Mapping

**User Story:** As a PostgreSQL client developer, I want to use `$1, $2, ...` positional parameters in my queries, so that I can use standard PG parameterized query syntax.

#### Acceptance Criteria

1. WHEN the SQL contains PostgreSQL positional parameters (`$1`, `$2`, ..., `$N`), THE Translation_Layer SHALL replace each positional parameter with a SQLite `?` placeholder in the Internal_AST.
2. WHEN positional parameters are translated, THE Translation_Layer SHALL reorder the parameters array so that the value at index 0 corresponds to `$1`, index 1 to `$2`, and so on, regardless of the order parameters appear in the SQL.
3. WHEN a positional parameter index exceeds the length of the provided parameters array, THE Translation_Layer SHALL report an error indicating the missing parameter index.
4. WHEN positional parameters are not sequential (e.g., `$1`, `$3` without `$2`), THE Translation_Layer SHALL report an error indicating the gap in parameter indices.

### Requirement 3: RETURNING Clause Support

**User Story:** As a PostgreSQL client developer, I want to use `RETURNING` clauses on INSERT, UPDATE, and DELETE statements, so that I can retrieve affected rows without a separate query.

#### Acceptance Criteria

1. WHEN an INSERT, UPDATE, or DELETE statement includes a `RETURNING` clause, THE Translation_Layer SHALL preserve the RETURNING clause in the Internal_AST.
2. WHEN the RETURNING clause specifies column names, THE QueryExecutor SHALL include those columns in the reconstructed SQL sent to partition services.
3. WHEN the RETURNING clause specifies `RETURNING *`, THE QueryExecutor SHALL reconstruct it as `RETURNING *` in the SQL sent to partition services.

### Requirement 4: INSERT ON CONFLICT (Upsert)

**User Story:** As a PostgreSQL client developer, I want to use `INSERT ... ON CONFLICT` syntax for upserts, so that I can handle duplicate key scenarios using standard PG syntax.

#### Acceptance Criteria

1. WHEN an INSERT statement includes `ON CONFLICT ... DO NOTHING`, THE Translation_Layer SHALL translate it to an Internal_AST with `orIgnore` set to true.
2. WHEN an INSERT statement includes `ON CONFLICT ... DO UPDATE SET ...`, THE Translation_Layer SHALL translate it to an Internal_AST with `orReplace` set to true.
3. WHEN the Internal_AST has `orIgnore` set to true, THE QueryExecutor SHALL reconstruct the SQL using `INSERT OR IGNORE INTO`.
4. WHEN the Internal_AST has `orReplace` set to true, THE QueryExecutor SHALL reconstruct the SQL using `INSERT OR REPLACE INTO`.

### Requirement 5: Boolean Literal Normalization

**User Story:** As a PostgreSQL client developer, I want to use `TRUE` and `FALSE` boolean literals, so that I can write queries using standard PG boolean syntax.

#### Acceptance Criteria

1. WHEN the SQL contains PostgreSQL boolean literals `TRUE` or `FALSE`, THE Translation_Layer SHALL convert them to integer literals `1` and `0` respectively in the Internal_AST.
2. WHEN boolean literals appear in WHERE clauses, value lists, or assignment expressions, THE Translation_Layer SHALL normalize them consistently to `1` or `0`.

### Requirement 6: Type Casting Translation

**User Story:** As a PostgreSQL client developer, I want to use `CAST(x AS type)` and `x::type` syntax, so that I can perform type conversions using standard PG casting syntax.

#### Acceptance Criteria

1. WHEN the SQL contains a PG-style `::type` cast expression, THE Translation_Layer SHALL convert it to a `CAST(expression AS affinity)` node in the Internal_AST.
2. WHEN the SQL contains a `CAST(expression AS pg_type)` expression, THE Translation_Layer SHALL map the PostgreSQL type name to the corresponding SQLite type affinity using the Type_Affinity_Map.
3. THE Type_Affinity_Map SHALL map PostgreSQL types to SQLite affinities as follows: `VARCHAR`, `TEXT`, `CHAR`, `CHARACTER VARYING` to `TEXT`; `INTEGER`, `INT`, `SMALLINT`, `BIGINT`, `SERIAL`, `BIGSERIAL` to `INTEGER`; `REAL`, `DOUBLE PRECISION`, `FLOAT`, `NUMERIC`, `DECIMAL` to `REAL`; `BYTEA` to `BLOB`; `BOOLEAN` to `INTEGER`.
4. WHEN the QueryExecutor reconstructs SQL containing a CAST node, THE QueryExecutor SHALL emit valid `CAST(expression AS affinity)` SQL syntax.

### Requirement 7: Function Name Translation

**User Story:** As a PostgreSQL client developer, I want to use common PG function names in my queries, so that I can write queries using familiar PG functions.

#### Acceptance Criteria

1. THE Function_Registry SHALL provide an extensible mapping from PostgreSQL function names to SQLite-compatible SQL expressions.
2. WHEN the SQL contains a PG function call that has a mapping in the Function_Registry, THE Translation_Layer SHALL replace the function call with the corresponding SQLite expression in the Internal_AST.
3. THE Function_Registry SHALL include mappings for at least: `CONCAT(a, b, ...)` to `(a || b || ...)`, `SUBSTRING(str, start, len)` to `SUBSTR(str, start, len)`, `LENGTH(str)` to `LENGTH(str)`, `LOWER(str)` to `LOWER(str)`, `UPPER(str)` to `UPPER(str)`, `TRIM(str)` to `TRIM(str)`, `COALESCE(a, b, ...)` to `COALESCE(a, b, ...)`, `NULLIF(a, b)` to `NULLIF(a, b)`.
4. WHEN the SQL contains a function call not present in the Function_Registry, THE Translation_Layer SHALL pass it through unchanged.

### Requirement 8: Date/Time Function Translation

**User Story:** As a PostgreSQL client developer, I want to use PG date/time functions, so that I can perform temporal operations using familiar PG syntax.

#### Acceptance Criteria

1. THE Function_Registry SHALL include mappings for date/time functions: `NOW()` to `datetime('now')`, `CURRENT_TIMESTAMP` to `datetime('now')`, `CURRENT_DATE` to `date('now')`, `CURRENT_TIME` to `time('now')`.
2. WHEN the SQL contains `EXTRACT(field FROM expression)`, THE Translation_Layer SHALL translate it to the equivalent `strftime()` call using the appropriate format string for the requested field (e.g., `EXTRACT(YEAR FROM col)` to `CAST(strftime('%Y', col) AS INTEGER)`).
3. WHEN the SQL contains `DATE_TRUNC(field, expression)`, THE Translation_Layer SHALL translate it to the equivalent `strftime()` call that truncates to the specified precision.

### Requirement 9: Subquery Support

**User Story:** As a PostgreSQL client developer, I want to use subqueries in WHERE clauses, so that I can write complex queries with nested SELECTs.

#### Acceptance Criteria

1. WHEN the SQL contains a subquery in a WHERE clause (e.g., `WHERE x IN (SELECT ...)`), THE Translation_Layer SHALL recursively convert the subquery AST and preserve it in the Internal_AST.
2. WHEN the SQL contains a scalar subquery (e.g., `WHERE x = (SELECT ...)`), THE Translation_Layer SHALL convert the subquery and preserve it as a nested expression in the Internal_AST.
3. WHEN the SQL contains an `EXISTS (SELECT ...)` expression, THE Translation_Layer SHALL convert the subquery and represent it as an EXISTS node in the Internal_AST.
4. WHEN the QueryExecutor reconstructs SQL containing subquery nodes, THE QueryExecutor SHALL emit valid nested `SELECT` SQL syntax.

### Requirement 10: CTE (WITH Clause) Support

**User Story:** As a PostgreSQL client developer, I want to use Common Table Expressions, so that I can write readable queries with named intermediate result sets.

#### Acceptance Criteria

1. WHEN the SQL contains a `WITH` clause defining one or more CTEs, THE Translation_Layer SHALL parse and preserve the CTE definitions in the Internal_AST.
2. WHEN the Internal_AST contains CTE definitions, THE QueryExecutor SHALL reconstruct the `WITH` clause in the SQL sent to partition services.
3. WHEN a CTE is recursive (`WITH RECURSIVE`), THE Translation_Layer SHALL preserve the RECURSIVE keyword in the Internal_AST.

### Requirement 11: CASE WHEN Expressions

**User Story:** As a PostgreSQL client developer, I want to use CASE WHEN expressions, so that I can write conditional logic in my queries.

#### Acceptance Criteria

1. WHEN the SQL contains a `CASE WHEN ... THEN ... ELSE ... END` expression, THE Translation_Layer SHALL convert it to a CASE node in the Internal_AST.
2. WHEN the SQL contains a simple `CASE expression WHEN value THEN result END` form, THE Translation_Layer SHALL convert it to the equivalent CASE node in the Internal_AST.
3. WHEN the QueryExecutor reconstructs SQL containing CASE nodes, THE QueryExecutor SHALL emit valid `CASE WHEN ... THEN ... ELSE ... END` SQL syntax.

### Requirement 12: Derived Tables

**User Story:** As a PostgreSQL client developer, I want to use subqueries in FROM clauses, so that I can compose queries from intermediate result sets.

#### Acceptance Criteria

1. WHEN the SQL contains a derived table in the FROM clause (e.g., `SELECT * FROM (SELECT ...) AS t`), THE Translation_Layer SHALL convert the subquery and preserve it with its alias in the Internal_AST FROM node.
2. WHEN the QueryExecutor reconstructs SQL containing a derived table in FROM, THE QueryExecutor SHALL emit valid `(SELECT ...) AS alias` SQL syntax.

### Requirement 13: Set Operations

**User Story:** As a PostgreSQL client developer, I want to use UNION, INTERSECT, and EXCEPT, so that I can combine result sets from multiple queries.

#### Acceptance Criteria

1. WHEN the SQL contains `UNION`, `UNION ALL`, `INTERSECT`, or `EXCEPT` between SELECT statements, THE Translation_Layer SHALL represent the set operation and both operand queries in the Internal_AST.
2. WHEN the QueryExecutor reconstructs SQL containing set operations, THE QueryExecutor SHALL emit valid `SELECT ... UNION/INTERSECT/EXCEPT SELECT ...` SQL syntax.

### Requirement 14: ILIKE Support

**User Story:** As a PostgreSQL client developer, I want to use `ILIKE` for case-insensitive pattern matching, so that I can write queries using standard PG syntax.

#### Acceptance Criteria

1. WHEN the SQL contains an `ILIKE` operator, THE Translation_Layer SHALL translate it to a SQLite-compatible `LIKE` with both operands wrapped in `LOWER()` in the Internal_AST.
2. WHEN the SQL contains a `NOT ILIKE` operator, THE Translation_Layer SHALL translate it to a negated `LIKE` with both operands wrapped in `LOWER()` in the Internal_AST.

### Requirement 15: Integration with PostgresWireAdapter

**User Story:** As a system architect, I want the translation layer to integrate cleanly with the existing PostgresWireAdapter, so that PG-dialect SQL is translated before reaching SqlCore without forking the execution path.

#### Acceptance Criteria

1. WHEN PostgresWireAdapter receives a SQL statement from an external client, THE PostgresWireAdapter SHALL pass the SQL to SqlCore with dialect information indicating PostgreSQL mode.
2. WHEN SqlCore receives a SQL statement with PostgreSQL dialect indication, THE SqlCore SHALL use SQLParser in `'postgresql'` Dialect_Mode for parsing.
3. WHEN SqlCore receives a SQL statement without dialect indication (internal queries), THE SqlCore SHALL use SQLParser in `'sqlite'` Dialect_Mode, preserving current behavior.
4. THE Translation_Layer SHALL operate as a preprocessing step within the parse phase, producing a standard Internal_AST that the rest of the pipeline (QueryExecutor, partition handlers) consumes without modification.
