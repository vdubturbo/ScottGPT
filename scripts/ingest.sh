#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Starting ScottGPT ingestion pipeline..."

# Check if pandoc is available
if ! command -v pandoc &> /dev/null; then
    echo "❌ Error: pandoc is required but not installed."
    echo "Install with: brew install pandoc (macOS) or apt-get install pandoc (Ubuntu)"
    exit 1
fi

# Check for required environment variables
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
    echo "❌ Error: OPENAI_API_KEY not found in environment"
    exit 1
fi

if [[ -z "${COHERE_API_KEY:-}" ]]; then
    echo "❌ Error: COHERE_API_KEY not found in environment"
    exit 1
fi

if [[ -z "${SUPABASE_URL:-}" ]]; then
    echo "❌ Error: SUPABASE_URL not found in environment"
    exit 1
fi

# Create working directories
mkdir -p .work/normalized .work/extracted

echo "📄 Step 1: Normalizing documents..."
node scripts/normalize.js

echo "🔍 Step 2: Extracting structured data..."
node scripts/extract.js

echo "✅ Step 3: Validating content..."
node scripts/validate.js

echo "💾 Step 4: Writing to source files..."
node scripts/write.js

echo "🔗 Step 5: Indexing and embedding..."
COHERE_API_KEY=j2GfQeuTCGKQhQecEnBNTUMi50jsLxyJu6x2t2qm node scripts/indexer.cjs

echo "🧹 Cleaning up temporary files..."
rm -rf .work

echo "✅ ScottGPT ingestion complete!"
echo "📊 Check the database for new chunks and sources."