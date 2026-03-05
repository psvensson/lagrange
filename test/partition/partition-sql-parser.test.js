import {describe, it} from 'node:test';
import assert from 'node:assert';
import {
  extractConjunctiveWhereColumns,
  extractDataFromParameterizedSQL,
} from '../../src/partition/partition-sql-parser.js';
import {
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';

describe('partition-sql-parser', () => {
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  it('extracts conjunctive WHERE columns from nested parentheses', () => {
    const columns = extractConjunctiveWhereColumns(
      '(((service_id = ?) AND (service_type = ?)) AND (node_id = ?))',
    );

    assert.deepStrictEqual(columns, [
      'service_id',
      'service_type',
      'node_id',
    ]);
  });

  it('extracts parameterized DELETE data from nested parentheses', () => {
    const data = extractDataFromParameterizedSQL(
      'DELETE FROM services WHERE (((service_id = ?) AND ' +
        '(service_type = ?)) AND (node_id = ?))',
      ['svc-1', 'partition', 'node-1'],
      'services',
      PARTITION_SERVICE_OPERATION.DELETE,
      logger,
    );

    assert.deepStrictEqual(data, {
      service_id: 'svc-1',
      service_type: 'partition',
      node_id: 'node-1',
    });
  });
});
