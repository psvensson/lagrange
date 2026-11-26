import {lexPartitionStatement} from './partition-statement-admission-lexer.js';
import {dmlVerbIndex} from './partition-statement-admission-names.js';
import {hasDoUpdateClause} from './partition-statement-admission-rowid-rules.js';
import {PARTITION_STATEMENT_KEYWORD as KEYWORD} from './partition-statement-admission-constants.js';
import {PARTITION_SERVICE_OPERATION} from './partition-service-constants.js';

const DIRECT_MUTATION_KIND_BY_VERB = Object.freeze({
  [KEYWORD.DELETE]: PARTITION_SERVICE_OPERATION.DELETE,
  [KEYWORD.UPDATE]: PARTITION_SERVICE_OPERATION.UPDATE,
  [KEYWORD.REPLACE]: PARTITION_SERVICE_OPERATION.UPSERT,
});

function isInsertOrReplaceAt(tokens, verbIndex) {
  return (
    tokens[verbIndex + 1]?.upper === KEYWORD.OR &&
    tokens[verbIndex + 2]?.upper === KEYWORD.REPLACE
  );
}

function lexedMutationOperationType(lexed) {
  const verbIndex = dmlVerbIndex(lexed);
  if (verbIndex < 0) return null;
  const tokens = lexed.tokens;
  const verb = tokens[verbIndex]?.upper ?? null;
  if (Object.hasOwn(DIRECT_MUTATION_KIND_BY_VERB, verb)) {
    return DIRECT_MUTATION_KIND_BY_VERB[verb];
  }
  if (verb !== KEYWORD.INSERT) return null;
  return isInsertOrReplaceAt(tokens, verbIndex) || hasDoUpdateClause(tokens) ?
    PARTITION_SERVICE_OPERATION.UPSERT :
    PARTITION_SERVICE_OPERATION.INSERT;
}

function extractLexedSqlMutationType(sql) {
  return typeof sql === 'string' && sql.length > 0 ?
    lexedMutationOperationType(lexPartitionStatement(sql)) :
    null;
}

export {extractLexedSqlMutationType, lexedMutationOperationType};
