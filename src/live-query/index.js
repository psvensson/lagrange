/**
 * Live Query Module - Real-time streaming query subscriptions.
 * Requirements: 33.1-33.20
 */

export {
  LiveQueryService,
  LiveQueryEventType,
  compilePredicate,
  extractPartitionKeyValue,
  canonicalizePredicate,
  parseLiveSelect,
  evaluateExpression,
} from './live-query-service.js';

export {
  LiveQueryManager,
  QueryGroup,
} from './live-query-manager.js';

export {
  createLiveQueryCacheSubscriptionAdapter,
  createLiveQueryStartupWiring,
} from './live-query-startup-wiring.js';
