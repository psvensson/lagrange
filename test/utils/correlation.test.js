import {test} from 'tap';
import {
  CORRELATION_HEADER,
  generateCorrelationId,
  getOrCreateCorrelationId,
  withCorrelationId,
} from '../../src/utils/correlation.js';

test('CORRELATION_HEADER constant', async (t) => {
  t.equal(CORRELATION_HEADER, 'x-correlation-id', 'should be x-correlation-id');
});

test('generateCorrelationId', async (t) => {
  const id1 = generateCorrelationId();
  const id2 = generateCorrelationId();

  t.ok(id1, 'should generate a non-empty string');
  t.ok(typeof id1 === 'string', 'should return a string');
  t.not(id1, id2, 'should generate unique IDs');

  // UUID v4 format check
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  t.ok(uuidRegex.test(id1), 'should generate valid UUID v4 format');
});

test('getOrCreateCorrelationId', async (t) => {
  await t.test('returns existing correlationId when present', async (t) => {
    const existingId = 'existing-correlation-id';
    const message = {correlationId: existingId, type: 'test'};

    const result = getOrCreateCorrelationId(message);

    t.equal(result, existingId, 'should return the existing correlationId');
  });

  await t.test('generates new correlationId when not present', async (t) => {
    const message = {type: 'test'};

    const result = getOrCreateCorrelationId(message);

    t.ok(result, 'should generate a correlationId');
    t.ok(typeof result === 'string', 'should return a string');
  });

  await t.test('generates new correlationId for empty message', async (t) => {
    const message = {};

    const result = getOrCreateCorrelationId(message);

    t.ok(result, 'should generate a correlationId');
  });
});

test('withCorrelationId', async (t) => {
  await t.test('adds provided correlationId to message', async (t) => {
    const message = {type: 'test', data: 'value'};
    const correlationId = 'provided-correlation-id';

    const result = withCorrelationId(message, correlationId);

    t.equal(result.correlationId, correlationId, 'should use provided correlationId');
    t.equal(result.type, 'test', 'should preserve original message properties');
    t.equal(result.data, 'value', 'should preserve all original properties');
    t.not(result, message, 'should return a new object');
  });

  await t.test('generates correlationId when not provided', async (t) => {
    const message = {type: 'test'};

    const result = withCorrelationId(message);

    t.ok(result.correlationId, 'should generate a correlationId');
    t.equal(result.type, 'test', 'should preserve original message properties');
  });

  await t.test('generates correlationId when null provided', async (t) => {
    const message = {type: 'test'};

    const result = withCorrelationId(message, null);

    t.ok(result.correlationId, 'should generate a correlationId');
  });

  await t.test('overwrites existing correlationId in message', async (t) => {
    const message = {type: 'test', correlationId: 'old-id'};
    const newCorrelationId = 'new-correlation-id';

    const result = withCorrelationId(message, newCorrelationId);

    t.equal(result.correlationId, newCorrelationId, 'should use new correlationId');
  });
});
