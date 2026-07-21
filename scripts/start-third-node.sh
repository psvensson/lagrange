#!/bin/bash
#
# Start a third node that connects to the seed node
#
# Usage: ./scripts/start-third-node.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEFAULTS=$(node "$SCRIPT_DIR/entrypoint-defaults.js")
DEFAULT_REST_PORT=$(node -e "console.log(JSON.parse('$DEFAULTS').restApiPort)")
DEFAULT_ADMIN_PORT=$(node -e "console.log(JSON.parse('$DEFAULTS').adminPort)")
DEFAULT_HOST=$(node -e "console.log(JSON.parse('$DEFAULTS').localhost)")

# Stride of 4 per node (WS transport binds REST+2); second node uses +4.
REST_API_PORT=${REST_API_PORT:-$((DEFAULT_REST_PORT + 8))}
ADMIN_WS_PORT=${ADMIN_WS_PORT:-$((DEFAULT_ADMIN_PORT + 8))}
DATA_DIR="${DATA_DIR:-./data3}"
SEED_NODE_ADDRESS="${SEED_NODE_ADDRESS:-$DEFAULT_HOST:$DEFAULT_REST_PORT}"

echo "Starting third node..."
echo "  REST API Port: $REST_API_PORT"
echo "  Admin WebSocket Port: $ADMIN_WS_PORT"
echo "  Data Directory: $DATA_DIR"
echo "  Seed Node: $SEED_NODE_ADDRESS"
echo ""

# Set environment variables for the third node.
# NODE_ID stays unset: the node mints a UUID on first start and restores it
# from the data directory on restart (join admission requires a UUID id).
export NODE_ADDRESS="$DEFAULT_HOST:$REST_API_PORT"
export REST_API_PORT="$REST_API_PORT"
export ADMIN_WS_PORT="$ADMIN_WS_PORT"
export DATA_DIR="$DATA_DIR"
export SEED_NODE_ADDRESS="$SEED_NODE_ADDRESS"
export LOG_LEVEL="info"
export LOG_PRETTY_PRINT="true"

# Run the distributed database system with seed node address
node "$PROJECT_ROOT/src/index.js" --data-dir "$DATA_DIR" --seed "$SEED_NODE_ADDRESS"
