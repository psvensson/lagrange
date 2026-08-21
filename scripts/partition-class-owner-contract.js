import {parseSourceFile, walkAst} from './guideline-check-shared.js';
import {
  NODE_TYPE,
  resolveAccessPath,
  resolveIdentifierName,
  resolvePropertyName,
  unwrapChain,
} from './partition-class-owner-ast.js';

const LOCAL_STR_OWNED_001 = 'Object';
const LOCAL_STR_OWNED_002 = 'freeze';
const LOCAL_STR_OWNED_003 = 'SYSTEM_PARTITION_CLASS must declare exactly three classes';
const LOCAL_STR_OWNED_004 = 'ArrowFunctionExpression';
const LOCAL_STR_OWNED_005 = 'FunctionExpression';
const LOCAL_STR_OWNED_006 = 'BlockStatement';
const LOCAL_STR_OWNED_007 = 'ReturnStatement';
const LOCAL_STR_OWNED_008 = 'ObjectPattern';
const LOCAL_STR_OWNED_009 = 'has';
const LOCAL_STR_OWNED_010 = 'VariableDeclaration';
const LOCAL_STR_OWNED_011 = 'AssignmentPattern';
const LOCAL_STR_OWNED_012 = 'options';
const LOCAL_STR_OWNED_013 = 'classifySystemPartition must receive options = {}';
const LOCAL_STR_OWNED_014 = 'classifySystemPartition must contain four canonical const declarations ';
const LOCAL_STR_OWNED_015 = 'and one direct return';
const LOCAL_STR_OWNED_016 = '||';
const LOCAL_STR_OWNED_017 = 'getPartitionIdFromPartitionRow';
const LOCAL_STR_OWNED_018 = 'options.partitionRow';
const LOCAL_STR_OWNED_019 = 'normalizeNonEmptyString';
const LOCAL_STR_OWNED_020 = 'options.partitionId';
const LOCAL_STR_OWNED_021 = 'partitionId must derive from partitionRow then options.partitionId';
const LOCAL_STR_OWNED_022 = 'resolvePartitionTableId';
const LOCAL_STR_OWNED_023 = 'tableId must derive from resolvePartitionTableId original options';
const LOCAL_NUM_OWNED_024 = 3;
const LOCAL_STR_OWNED_025 = 'SYSTEM_PARTITION_CLASS_ROWS must declare exactly three ordered rows';
const LOCAL_STR_OWNED_026 = 'partitionClass';
const LOCAL_STR_OWNED_027 = 'matches';
const LOCAL_STR_OWNED_028 = 'partitionId';
const LOCAL_STR_OWNED_029 = 'tableId';
const LOCAL_STR_OWNED_030 = 'find';
const LOCAL_STR_OWNED_031 = 'canonical partitionClass must come from the selected row';
const LOCAL_STR_OWNED_032 = 'classifySystemPartition must select from SYSTEM_PARTITION_CLASS_ROWS';
const LOCAL_STR_OWNED_033 = 'classifySystemPartition must have one top-level frozen canonical return';
const STRICT_EQUALITY_OPERATOR = '===';
const OPERATION_LEDGER_FIELD = 'operationLedger';
const TABLE_ID_ACCESS_PATH = 'tableId';
const REPLICA_OPERATIONS_TABLE_ACCESS_PATH =
  'SYSTEM_TABLE_NAME.REPLICA_OPERATIONS';
const OPERATION_LEDGER_IDENTITY_PROBLEM =
  'canonical operationLedger must derive from the replica_operations table identity';

const OWNER_CONTRACT_NAME = Object.freeze({
  CLASS: 'SYSTEM_PARTITION_CLASS',
  ROWS: 'SYSTEM_PARTITION_CLASS_ROWS',
  CLASSIFIER: 'classifySystemPartition',
});

const EXPECTED_PARTITION_CLASS_VALUE = Object.freeze({
  BOOTSTRAP_CRITICAL: 'bootstrap_critical',
  PRIORITY_CONTROL_PLANE: 'priority_control_plane',
  DEFAULT: 'default',
});

const EXPECTED_CLASSIFIER_OUTCOME_FIELDS = Object.freeze([
  'partitionClass',
  'bootstrapCritical',
  'formationLivenessDependency',
  'operationLedger',
  'priorityControlPlane',
  'systemTable',
]);
const NO_CLASSIFIER_PROBLEMS = Object.freeze([]);

function isObjectFreezeCall(node) {
  const normalized = unwrapChain(node);
  return normalized?.type === NODE_TYPE.CALL &&
    normalized.callee?.type === NODE_TYPE.MEMBER &&
    resolveIdentifierName(normalized.callee.object) === LOCAL_STR_OWNED_001 &&
    resolvePropertyName(normalized.callee) === LOCAL_STR_OWNED_002;
}

function objectFreezeArgument(node) {
  return isObjectFreezeCall(node) ? unwrapChain(node).arguments?.[0] : null;
}

function objectPropertiesByName(node) {
  const properties = new Map();
  if (node?.type !== NODE_TYPE.OBJECT) return properties;
  for (const property of node.properties || []) {
    if (property.type !== NODE_TYPE.PROPERTY) continue;
    const name = resolvePropertyName(property);
    if (name) properties.set(name, property);
  }
  return properties;
}

function hasExactObjectProperties(node, expectedNames) {
  if (node?.type !== NODE_TYPE.OBJECT ||
      node.properties?.length !== expectedNames.length ||
      node.properties.some((property) => property.type !== NODE_TYPE.PROPERTY)) {
    return false;
  }
  const properties = objectPropertiesByName(node);
  return properties.size === expectedNames.length &&
    expectedNames.every((name) => properties.has(name));
}

function declarationByName(ast) {
  const declarations = new Map();
  walkAst(ast, (node) => {
    if (node.type !== NODE_TYPE.VARIABLE_DECLARATOR || !node.id?.name) return;
    const existing = declarations.get(node.id.name) || [];
    existing.push(node);
    declarations.set(node.id.name, existing);
  });
  return declarations;
}

function classVocabularyProblems(classDeclaration) {
  const classObject = objectFreezeArgument(classDeclaration?.init);
  const properties = objectPropertiesByName(classObject);
  const problems = [];
  const expectedEntries = Object.entries(EXPECTED_PARTITION_CLASS_VALUE);
  if (!hasExactObjectProperties(
    classObject,
    expectedEntries.map(([name]) => name),
  )) {
    problems.push(LOCAL_STR_OWNED_003);
  }
  for (const [name, value] of expectedEntries) {
    if (properties.get(name)?.value?.value !== value) {
      problems.push(`SYSTEM_PARTITION_CLASS.${name} must equal ${value}`);
    }
  }
  return problems;
}

function rowSource(source, node) {
  return node?.range ? source.slice(node.range[0], node.range[1]) : '';
}

function functionReturnExpression(node) {
  if (!node || (node.type !== LOCAL_STR_OWNED_004 &&
      node.type !== LOCAL_STR_OWNED_005)) {
    return null;
  }
  if (node.body?.type !== LOCAL_STR_OWNED_006) return unwrapChain(node.body);
  if (node.body.body?.length !== 1 ||
      node.body.body[0]?.type !== LOCAL_STR_OWNED_007) {
    return null;
  }
  return unwrapChain(node.body.body[0].argument);
}

function destructuredContextBinding(node, propertyName) {
  const parameter = node?.params?.[0];
  if (parameter?.type !== LOCAL_STR_OWNED_008) return null;
  for (const property of parameter.properties || []) {
    if (property.type !== NODE_TYPE.PROPERTY ||
        resolvePropertyName(property) !== propertyName) {
      continue;
    }
    return property.value?.type === NODE_TYPE.IDENTIFIER ?
      property.value.name : null;
  }
  return null;
}

function isDirectSetMembership(node, setName, argumentName) {
  const expression = unwrapChain(node);
  if (expression?.type !== NODE_TYPE.CALL) {
    return false;
  }
  const callee = unwrapChain(expression.callee);
  const directMembership = callee?.type === NODE_TYPE.MEMBER &&
    expression.arguments?.length === 1 &&
    expression.arguments[0]?.type === NODE_TYPE.IDENTIFIER &&
    expression.arguments[0].name === argumentName &&
    resolveAccessPath(callee.object) === setName &&
    resolvePropertyName(callee) === LOCAL_STR_OWNED_009;
  const hardenedMembership =
    resolveIdentifierName(callee) === 'setHas' &&
    expression.arguments?.length === 2 &&
    resolveAccessPath(expression.arguments[0]) === setName &&
    expression.arguments[1]?.type === NODE_TYPE.IDENTIFIER &&
    expression.arguments[1].name === argumentName;
  return directMembership || hardenedMembership;
}

function isOperationLedgerIdentity(node) {
  const expression = unwrapChain(node);
  if (expression?.type !== NODE_TYPE.BINARY ||
      expression.operator !== STRICT_EQUALITY_OPERATOR) {
    return false;
  }
  return resolveAccessPath(expression.left) === TABLE_ID_ACCESS_PATH &&
    resolveAccessPath(expression.right) ===
      REPLICA_OPERATIONS_TABLE_ACCESS_PATH;
}

function rowOwnsSetMembership(rowObject, setName, contextProperty) {
  const matches = objectPropertiesByName(rowObject).get('matches')?.value;
  const binding = destructuredContextBinding(matches, contextProperty);
  return binding !== null && isDirectSetMembership(
    functionReturnExpression(matches),
    setName,
    binding,
  );
}

function rowOwnsDefaultMatch(rowObject) {
  const matches = objectPropertiesByName(rowObject).get('matches')?.value;
  const expression = functionReturnExpression(matches);
  return expression?.type === NODE_TYPE.LITERAL && expression.value === true;
}

function topLevelDeclarationByName(classifierNode) {
  const declarations = new Map();
  for (const statement of classifierNode?.body?.body || []) {
    if (statement.type !== LOCAL_STR_OWNED_010) continue;
    for (const declaration of statement.declarations || []) {
      if (declaration.id?.type === NODE_TYPE.IDENTIFIER) {
        declarations.set(declaration.id.name, declaration);
      }
    }
  }
  return declarations;
}

function isNamedCallWithArgument(node, functionName, argumentPath) {
  const expression = unwrapChain(node);
  return expression?.type === NODE_TYPE.CALL &&
    resolveAccessPath(expression.callee) === functionName &&
    expression.arguments?.length === 1 &&
    resolveAccessPath(expression.arguments[0]) === argumentPath;
}

function canonicalClassifierInputProblems(classifierNode) {
  const problems = [];
  const parameter = classifierNode?.params?.[0];
  if (classifierNode?.params?.length !== 1 ||
      parameter?.type !== LOCAL_STR_OWNED_011 ||
      parameter.left?.type !== NODE_TYPE.IDENTIFIER ||
      parameter.left.name !== LOCAL_STR_OWNED_012 ||
      parameter.right?.type !== NODE_TYPE.OBJECT ||
      parameter.right.properties?.length !== 0) {
    problems.push(LOCAL_STR_OWNED_013);
  }

  const declarations = topLevelDeclarationByName(classifierNode);
  const statements = classifierNode?.body?.body || [];
  const expectedDeclarationNames = [
    'partitionId',
    'tableId',
    'context',
    'row',
  ];
  const canonicalStatementOrder = statements.length === 5 &&
    expectedDeclarationNames.every((name, index) => {
      const statement = statements[index];
      return statement?.type === 'VariableDeclaration' &&
        statement.kind === 'const' &&
        statement.declarations?.length === 1 &&
        statement.declarations[0]?.id?.type === NODE_TYPE.IDENTIFIER &&
        statement.declarations[0].id.name === name;
    }) && statements[4]?.type === 'ReturnStatement';
  if (!canonicalStatementOrder) {
    problems.push(
      LOCAL_STR_OWNED_014 +
      LOCAL_STR_OWNED_015,
    );
  }
  const partitionIdInitializer = unwrapChain(declarations.get('partitionId')?.init);
  if (partitionIdInitializer?.type !== NODE_TYPE.LOGICAL ||
      partitionIdInitializer.operator !== LOCAL_STR_OWNED_016 ||
      !isNamedCallWithArgument(
        partitionIdInitializer.left,
        LOCAL_STR_OWNED_017,
        LOCAL_STR_OWNED_018,
      ) ||
      !isNamedCallWithArgument(
        partitionIdInitializer.right,
        LOCAL_STR_OWNED_019,
        LOCAL_STR_OWNED_020,
      )) {
    problems.push(LOCAL_STR_OWNED_021);
  }

  const tableIdInitializer = unwrapChain(declarations.get('tableId')?.init);
  if (tableIdInitializer?.type !== NODE_TYPE.CALL ||
      resolveAccessPath(tableIdInitializer.callee) !== LOCAL_STR_OWNED_022 ||
      tableIdInitializer.arguments?.length !== 1 ||
      resolveAccessPath(tableIdInitializer.arguments[0]) !== LOCAL_STR_OWNED_012) {
    problems.push(
      LOCAL_STR_OWNED_023,
    );
  }
  return problems;
}

function orderedRowProblems(rowsDeclaration) {
  const rowsArray = objectFreezeArgument(rowsDeclaration?.init);
  const rowElements = rowsArray?.type === 'ArrayExpression' ?
    rowsArray.elements || [] : [];
  const problems = [];
  if (rowElements.length !== LOCAL_NUM_OWNED_024) {
    return [LOCAL_STR_OWNED_025];
  }
  const expectedRows = [
    {
      className: 'BOOTSTRAP_CRITICAL',
      ownsPredicate: (rowObject) => rowOwnsSetMembership(
        rowObject,
        'CRITICAL_SYSTEM_PARTITION_IDS',
        'partitionId',
      ),
    },
    {
      className: 'PRIORITY_CONTROL_PLANE',
      ownsPredicate: (rowObject) => rowOwnsSetMembership(
        rowObject,
        'PRIORITY_CONTROL_PLANE_TABLE_IDS',
        'tableId',
      ),
    },
    {className: 'DEFAULT', ownsPredicate: rowOwnsDefaultMatch},
  ];
  for (const [index, expected] of expectedRows.entries()) {
    const rowObject = objectFreezeArgument(rowElements[index]);
    const properties = objectPropertiesByName(rowObject);
    if (!hasExactObjectProperties(rowObject, [LOCAL_STR_OWNED_026, LOCAL_STR_OWNED_027])) {
      problems.push(
        `row ${index + 1} must declare exactly partitionClass and matches`,
      );
    }
    const classPath = resolveAccessPath(properties.get('partitionClass')?.value);
    if (classPath !== `SYSTEM_PARTITION_CLASS.${expected.className}`) {
      problems.push(`row ${index + 1} must classify ${expected.className}`);
    }
    if (!properties.has(LOCAL_STR_OWNED_027) || !expected.ownsPredicate(rowObject)) {
      problems.push(`row ${index + 1} must own its declared match predicate`);
    }
  }
  return problems;
}

function canonicalContextNames(classifierNode) {
  const names = new Set();
  for (const statement of classifierNode?.body?.body || []) {
    if (statement.type !== LOCAL_STR_OWNED_010) continue;
    for (const node of statement.declarations || []) {
      if (node.id?.type !== NODE_TYPE.IDENTIFIER) continue;
      const contextObject = objectFreezeArgument(node.init);
      const fields = objectPropertiesByName(contextObject);
      if (hasExactObjectProperties(contextObject, [LOCAL_STR_OWNED_028, LOCAL_STR_OWNED_029]) &&
          fields.get(LOCAL_STR_OWNED_028)?.value?.type === NODE_TYPE.IDENTIFIER &&
          fields.get(LOCAL_STR_OWNED_028).value.name === LOCAL_STR_OWNED_028 &&
          fields.get(LOCAL_STR_OWNED_029)?.value?.type === NODE_TYPE.IDENTIFIER &&
          fields.get(LOCAL_STR_OWNED_029).value.name === LOCAL_STR_OWNED_029) {
        names.add(node.id.name);
      }
    }
  }
  return names;
}

function findInvokesRowMatch(callback, contextNames) {
  const candidateName = callback?.params?.length === 1 &&
      callback.params[0]?.type === NODE_TYPE.IDENTIFIER ?
    callback.params[0].name : null;
  const expression = functionReturnExpression(callback);
  const callee = unwrapChain(expression?.callee);
  return candidateName !== null &&
    expression?.type === NODE_TYPE.CALL &&
    expression.arguments?.length === 1 &&
    expression.arguments[0]?.type === NODE_TYPE.IDENTIFIER &&
    contextNames.has(expression.arguments[0].name) &&
    callee?.type === NODE_TYPE.MEMBER &&
    callee.object?.type === NODE_TYPE.IDENTIFIER &&
    callee.object.name === candidateName &&
    resolvePropertyName(callee) === LOCAL_STR_OWNED_027;
}

function selectedRowNames(classifierNode) {
  const names = new Set();
  const contextNames = canonicalContextNames(classifierNode);
  for (const statement of classifierNode?.body?.body || []) {
    if (statement.type !== LOCAL_STR_OWNED_010) continue;
    for (const node of statement.declarations || []) {
      if (node.id?.type !== NODE_TYPE.IDENTIFIER) continue;
      const initializer = unwrapChain(node.init);
      const callee = unwrapChain(initializer?.callee);
      if (initializer?.type === NODE_TYPE.CALL &&
          callee?.type === NODE_TYPE.MEMBER &&
          resolveAccessPath(callee.object) === OWNER_CONTRACT_NAME.ROWS &&
          resolvePropertyName(callee) === LOCAL_STR_OWNED_030 &&
          findInvokesRowMatch(initializer.arguments?.[0], contextNames)) {
        names.add(node.id.name);
      }
    }
  }
  return names;
}

function isSelectedPartitionClass(node, rowNames) {
  const expression = unwrapChain(node);
  return expression?.type === NODE_TYPE.MEMBER &&
    expression.object?.type === NODE_TYPE.IDENTIFIER &&
    rowNames.has(expression.object.name) &&
    resolvePropertyName(expression) === LOCAL_STR_OWNED_026;
}

function canonicalOutcomeProblems(fields, rowNames) {
  const problems = [];
  if (!isSelectedPartitionClass(fields.get(LOCAL_STR_OWNED_026)?.value, rowNames)) {
    problems.push(LOCAL_STR_OWNED_031);
  }
  const membershipFields = [
    ['bootstrapCritical', 'CRITICAL_SYSTEM_PARTITION_IDS', 'partitionId'],
    [
      'formationLivenessDependency',
      'FORMATION_LIVENESS_DEPENDENCY_PARTITION_IDS',
      'partitionId',
    ],
    ['priorityControlPlane', 'PRIORITY_CONTROL_PLANE_TABLE_IDS', 'tableId'],
    ['systemTable', 'SYSTEM_TABLE_IDS', 'tableId'],
  ];
  for (const [fieldName, setName, argumentName] of membershipFields) {
    if (!isDirectSetMembership(
      fields.get(fieldName)?.value,
      setName,
      argumentName,
    )) {
      problems.push(
        `canonical ${fieldName} must derive from ${setName}.has(${argumentName})`,
      );
    }
  }
  if (!isOperationLedgerIdentity(fields.get(OPERATION_LEDGER_FIELD)?.value)) {
    problems.push(OPERATION_LEDGER_IDENTITY_PROBLEM);
  }
  return problems;
}

function classifierOutcomeProblems(classifierNode, source) {
  if (!classifierNode) return NO_CLASSIFIER_PROBLEMS;
  const classifierSource = rowSource(source, classifierNode);
  const problems = canonicalClassifierInputProblems(classifierNode);
  if (!classifierSource.includes(OWNER_CONTRACT_NAME.ROWS) ||
      !/SYSTEM_PARTITION_CLASS_ROWS\s*\.\s*find|for\s*\([^)]*SYSTEM_PARTITION_CLASS_ROWS/u
        .test(classifierSource)) {
    problems.push(
      LOCAL_STR_OWNED_032,
    );
  }
  const rowNames = selectedRowNames(classifierNode);
  const classifierReturns = [];
  walkAst(classifierNode, (node, _parent, ancestors) => {
    if (node.type !== LOCAL_STR_OWNED_007) return;
    const belongsToNestedFunction = ancestors.some((ancestor) =>
      ancestor !== classifierNode && [
        'ArrowFunctionExpression',
        'FunctionDeclaration',
        'FunctionExpression',
      ].includes(ancestor.type),
    );
    if (!belongsToNestedFunction) classifierReturns.push(node);
  });
  const directReturn = classifierReturns.length === 1 &&
      classifierNode.body?.body?.includes(classifierReturns[0]) ?
    classifierReturns[0] : null;
  const outcomeObject = directReturn ?
    objectFreezeArgument(directReturn.argument) : null;
  const fields = objectPropertiesByName(outcomeObject);
  if (!outcomeObject ||
      !hasExactObjectProperties(
        outcomeObject,
        EXPECTED_CLASSIFIER_OUTCOME_FIELDS,
      ) ||
      !EXPECTED_CLASSIFIER_OUTCOME_FIELDS.every((field) => fields.has(field))) {
    problems.push(
      LOCAL_STR_OWNED_033,
    );
  } else {
    problems.push(...canonicalOutcomeProblems(fields, rowNames));
  }
  return problems;
}

export function evaluateOwnerContract(source) {
  const ast = parseSourceFile(source);
  const declarations = declarationByName(ast);
  const declarationCountByName = new Map();
  const exportedNames = new Set();
  let classifierNode = null;
  walkAst(ast, (node) => {
    if (node.type === NODE_TYPE.VARIABLE_DECLARATOR && node.id?.name) {
      declarationCountByName.set(
        node.id.name,
        (declarationCountByName.get(node.id.name) || 0) + 1,
      );
    }
    if (node.type === NODE_TYPE.FUNCTION_DECLARATION && node.id?.name) {
      declarationCountByName.set(
        node.id.name,
        (declarationCountByName.get(node.id.name) || 0) + 1,
      );
      if (node.id.name === OWNER_CONTRACT_NAME.CLASSIFIER) classifierNode = node;
    }
    if (node.type === NODE_TYPE.EXPORT_NAMED) {
      for (const specifier of node.specifiers || []) {
        if (specifier.exported?.name) exportedNames.add(specifier.exported.name);
      }
    }
  });
  const problems = [];
  for (const name of Object.values(OWNER_CONTRACT_NAME)) {
    if (declarationCountByName.get(name) !== 1) {
      problems.push(`${name} must have exactly one owner declaration`);
    }
    if (!exportedNames.has(name)) problems.push(`${name} must be exported`);
  }
  problems.push(...classVocabularyProblems(
    declarations.get(OWNER_CONTRACT_NAME.CLASS)?.[0],
  ));
  problems.push(...orderedRowProblems(
    declarations.get(OWNER_CONTRACT_NAME.ROWS)?.[0],
  ));
  problems.push(...classifierOutcomeProblems(classifierNode, source));
  return {passed: problems.length === 0, problems};
}
