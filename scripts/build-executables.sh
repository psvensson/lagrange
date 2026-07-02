#!/bin/bash
# Build script for creating single executable applications
# Requires Node.js 22+ for SEA support

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$PROJECT_ROOT/dist"

echo "=== Building Single Executables ==="
echo ""

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  echo "Error: Node.js 22+ required for SEA builds"
  echo "Current version: $(node -v)"
  exit 1
fi
echo "✓ Node.js version: $(node -v)"

# Ensure dist directory exists
mkdir -p "$DIST_DIR"

# Step 1: Bundle JavaScript
echo ""
echo "Step 1: Bundling JavaScript..."
node "$SCRIPT_DIR/build-sea.js"

# Step 2: Generate SEA blobs
echo ""
echo "Step 2: Generating SEA blobs..."
cd "$PROJECT_ROOT"
node --experimental-sea-config sea-config.json
echo "  ✓ Main system blob generated"
node --experimental-sea-config sea-config-cli.json
echo "  ✓ CLI blob generated"

# Step 3: Copy Node.js binary
echo ""
echo "Step 3: Creating executable copies..."
NODE_PATH=$(which node)
cp "$NODE_PATH" "$DIST_DIR/lagrange"
cp "$NODE_PATH" "$DIST_DIR/lagrange-cli"
echo "  ✓ Node.js binary copied"

# Step 4: Inject SEA blobs using postject
echo ""
echo "Step 4: Injecting SEA blobs..."

# Check if postject is available
if ! npx postject --help > /dev/null 2>&1; then
  echo "Installing postject..."
  npm install --save-dev postject
fi

npx postject "$DIST_DIR/lagrange" NODE_SEA_BLOB "$DIST_DIR/sea-prep.blob" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  --overwrite
echo "  ✓ Main system blob injected"

npx postject "$DIST_DIR/lagrange-cli" NODE_SEA_BLOB "$DIST_DIR/sea-cli-prep.blob" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  --overwrite
echo "  ✓ CLI blob injected"

# Step 5: Make executables
echo ""
echo "Step 5: Setting executable permissions..."
chmod +x "$DIST_DIR/lagrange"
chmod +x "$DIST_DIR/lagrange-cli"
echo "  ✓ Permissions set"

# Step 6: Verify executables
echo ""
echo "Step 6: Verifying executables..."
if [ -f "$DIST_DIR/lagrange" ] && [ -x "$DIST_DIR/lagrange" ]; then
  MAIN_SIZE=$(du -h "$DIST_DIR/lagrange" | cut -f1)
  echo "  ✓ lagrange ($MAIN_SIZE)"
else
  echo "  ✗ lagrange not found or not executable"
  exit 1
fi

if [ -f "$DIST_DIR/lagrange-cli" ] && [ -x "$DIST_DIR/lagrange-cli" ]; then
  CLI_SIZE=$(du -h "$DIST_DIR/lagrange-cli" | cut -f1)
  echo "  ✓ lagrange-cli ($CLI_SIZE)"
else
  echo "  ✗ lagrange-cli not found or not executable"
  exit 1
fi

echo ""
echo "Step 7: Smoke-testing executables..."
"$DIST_DIR/lagrange-cli" --help > /dev/null
echo "  ✓ lagrange-cli --help"
"$DIST_DIR/lagrange" --help > /dev/null
echo "  ✓ lagrange --help"
"$DIST_DIR/lagrange" --dry-run > /dev/null
echo "  ✓ lagrange --dry-run"

echo ""
echo "=== Build Complete ==="
echo ""
echo "Executables created:"
echo "  Main system: $DIST_DIR/lagrange"
echo "  CLI tool:    $DIST_DIR/lagrange-cli"
echo ""
echo "To run without Node.js in PATH:"
echo "  $DIST_DIR/lagrange"
echo "  $DIST_DIR/lagrange-cli --help"
