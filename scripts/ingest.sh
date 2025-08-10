#!/usr/bin/env bash
set -euo pipefail

# Force unbuffered output for real-time streaming
export PYTHONUNBUFFERED=1

# Function to log progress in real-time
log_progress() {
    echo "$1" | tee -a "${PROGRESS_LOG:-/dev/null}"
}

log_progress "🚀 Starting ScottGPT ingestion pipeline..."

# Load environment variables from .env file
if [ -f ".env" ]; then
    set -a
    source .env
    set +a
    log_progress "✅ Loaded environment variables from .env"
fi

# Clean up any previous .work directory to avoid processing old files
if [ -d ".work" ]; then
    log_progress "🧹 Cleaning up previous work directory..."
    rm -rf .work
fi

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

log_progress "📄 Step 1: Normalizing documents..."
node scripts/normalize.js 2>&1
echo "✅ Normalization completed"

echo "🔍 Step 2: Extracting structured data..."
node scripts/extract.js 2>&1  
echo "✅ Extraction completed"

echo "✅ Step 3: Validating content..."
node scripts/validate.js 2>&1
echo "✅ Validation completed"

echo "💾 Step 4: Writing to source files..."
node scripts/write.js 2>&1
echo "✅ Writing completed"

echo "🔗 Step 5: Indexing and embedding..."
node scripts/indexer.cjs 2>&1

# Move processed files from incoming to processed directory
echo "📦 Moving processed files..."
mkdir -p processed
if [ -d "incoming" ]; then
    for file in incoming/*; do
        if [ -f "$file" ]; then
            mv "$file" processed/
            echo "   Moved: $(basename "$file")"
        fi
    done
fi

# Cleanup is now done at the beginning to avoid accumulation
echo "✅ Pipeline completed - temporary files preserved for debugging"

echo "✅ ScottGPT ingestion complete!"
echo "📊 Check the database for new chunks and sources."