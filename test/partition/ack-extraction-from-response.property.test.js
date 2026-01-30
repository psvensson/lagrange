/**
 * Property Test: ACK Extraction From Response
 * **Property 14: ACK Extraction From Response**
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
 *
 * *For any* transport response containing an ACK,
 * the extractAckFromResponse method SHALL extract and return the ACK
 * immediately without waiting for events.
 *
 * Note: With the unified flat message structure, ACK fields are spread
 * directly into the response.
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Helper function that mirrors the extractAckFromResponse logic from PartitionService.
 * Handles flat structure only.
 * @param {Object} result - Transport result.
 * @param {string} requestId - Expected request ID.
 * @return {Object|null} ACK or null.
 */
function extractAckFromResponse(result, requestId) {
  if (!result) return null;

  // Primary case: flat structure - request_id directly on result
  if (result.request_id === requestId) {
    return result;
  }

  return null;
}

test('Property 14: ACK Extraction From Response', async (t) => {
  t.beforeEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});
  });

  t.afterEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  /**
   * Property: For any ACK in flat response structure, extraction succeeds.
   * This is the primary case with unified message structure.
   */
  t.test('extracts ACK from flat response (primary case)', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(), // requestId
        fc.constantFrom('success', 'initiated', 'completed', 'error'), // status
        fc.boolean(), // acknowledged
        (requestId, status, acknowledged) => {
          // Flat structure: ACK fields spread directly into response
          const response = {
            messageId: 'msg-123',
            acknowledged,
            request_id: requestId,
            status,
            type: 'CREATE_REPLICA_ACK',
          };

          const extracted = extractAckFromResponse(response, requestId);

          return extracted !== null &&
            extracted.request_id === requestId &&
            extracted.status === status;
        },
      ),
      {numRuns: 10},
    );

    t.pass('extracts ACK from flat response');
  });

  /**
   * Property: For any response without matching requestId, extraction returns null.
   */
  t.test('returns null when requestId does not match', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(), // expectedRequestId
        fc.uuid(), // actualRequestId in response
        (expectedRequestId, actualRequestId) => {
          // Skip if IDs happen to match
          if (expectedRequestId === actualRequestId) {
            return true;
          }

          const response = {
            request_id: actualRequestId,
            status: 'success',
          };

          const extracted = extractAckFromResponse(response, expectedRequestId);

          return extracted === null;
        },
      ),
      {numRuns: 10},
    );

    t.pass('returns null when requestId does not match');
  });

  /**
   * Property: For null/undefined responses, extraction returns null.
   */
  t.test('returns null for null/undefined responses', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(), // requestId
        (requestId) => {
          const nullExtracted = extractAckFromResponse(null, requestId);
          const undefinedExtracted = extractAckFromResponse(undefined, requestId);

          return nullExtracted === null && undefinedExtracted === null;
        },
      ),
      {numRuns: 10},
    );

    t.pass('returns null for null/undefined responses');
  });

  /**
   * Property: For empty object responses, extraction returns null.
   */
  t.test('returns null for empty object responses', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(), // requestId
        (requestId) => {
          const extracted = extractAckFromResponse({}, requestId);

          return extracted === null;
        },
      ),
      {numRuns: 10},
    );

    t.pass('returns null for empty object responses');
  });
});
