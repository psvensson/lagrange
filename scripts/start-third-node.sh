#!/bin/bash
#
# Start a third node that connects to the seed node
#
# Usage: ./scripts/start-third-node.sh
#

set -e

SEED_NODE_ADDRESS="${SEED_NODE_ADDRESS:-localhost:8080}"

echo "Starting third node..."
echo "  REST API Port: 8084"
echo "  Admin WebSocket Port: 8085"
echo "  Data Directory: ./data3"
echo "  Seed Node: $SEED_NODE_ADDRESS"
echo ""

# Set environment variables for the third node
# Using a fixed UUID for reproducible testing (node-3)
export NODE_ID="550e8400-e29b-41d4-a716-446655440003"
export NODE_ADDRESS="localhost:8084"
export REST_API_PORT=8084
export ADMIN_WEBSOCKET_PORT=8085
export DATA_DIR="./data3"
export SEED_NODE_ADDRESS="$SEED_NODE_ADDRESS"
export LOG_LEVEL="info"
export LOG_PRETTY_PRINT="true"

# Run the distributed database system with seed node address
node src/index.js --data-dir ./data3 --seed "$SEED_NODE_ADDRESS"
