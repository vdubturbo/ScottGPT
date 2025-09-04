#!/usr/bin/env bash

echo "🔍 DIAGNOSTIC SCRIPT - Testing each pipeline step individually"
echo "============================================================="

# Set working directory
cd /Users/scottlovett/ScottGPT

# Load environment variables
if [ -f ".env" ]; then
    set -a
    source .env
    set +a
    echo "✅ Environment variables loaded"
else
    echo "❌ No .env file found"
    exit 1
fi

echo ""
echo "📋 ENVIRONMENT CHECK:"
echo "- OPENAI_API_KEY: ${OPENAI_API_KEY:0:10}..."
echo "- COHERE_API_KEY: ${COHERE_API_KEY:0:10}..." 
echo "- SUPABASE_URL: $SUPABASE_URL"
echo "- NODE_ENV: $NODE_ENV"

echo ""
echo "📁 DIRECTORY CHECK:"
ls -la incoming/
echo ""

echo "🔧 DEPENDENCY CHECK:"
echo -n "pandoc: "
if command -v pandoc &> /dev/null; then
    echo "✅ Available ($(pandoc --version | head -1))"
else
    echo "❌ Not found"
fi

echo -n "node: "
echo "✅ Available ($(node --version))"

echo ""
echo "🧪 TESTING INDIVIDUAL STEPS:"

echo ""
echo "1️⃣ TESTING NORMALIZE..."
timeout 30 node scripts/normalize.js
if [ $? -eq 0 ]; then
    echo "   ✅ Normalize completed"
    ls -la .work/normalized/ 2>/dev/null || echo "   📁 No .work/normalized directory created"
else
    echo "   ❌ Normalize failed or timed out"
    exit 1
fi

echo ""
echo "2️⃣ TESTING EXTRACT..."
timeout 60 node scripts/extract.js
if [ $? -eq 0 ]; then
    echo "   ✅ Extract completed"
    ls -la .work/extracted/ 2>/dev/null || echo "   📁 No .work/extracted directory created"
else
    echo "   ❌ Extract failed or timed out"
    exit 1
fi

echo ""
echo "3️⃣ TESTING VALIDATE..."
timeout 30 node scripts/validate.js
if [ $? -eq 0 ]; then
    echo "   ✅ Validate completed"
    ls -la .work/validated/ 2>/dev/null || echo "   📁 No .work/validated directory created"
else
    echo "   ❌ Validate failed or timed out"
    exit 1
fi

echo ""
echo "4️⃣ TESTING WRITE..."
timeout 30 node scripts/write.js
if [ $? -eq 0 ]; then
    echo "   ✅ Write completed"
    find sources/ -name "*.md" 2>/dev/null | head -5 || echo "   📁 No source files created"
else
    echo "   ❌ Write failed or timed out"
    exit 1
fi

echo ""
echo "5️⃣ TESTING INDEXER..."
timeout 120 node scripts/indexer.js
if [ $? -eq 0 ]; then
    echo "   ✅ Indexer completed"
else
    echo "   ❌ Indexer failed or timed out"
    exit 1
fi

echo ""
echo "🎉 ALL TESTS PASSED! Pipeline should work normally."
echo "📊 Final state check:"
echo "- Incoming files remaining: $(ls incoming/ | grep -v .DS_Store | wc -l)"
echo "- Normalized files: $(ls .work/normalized/ 2>/dev/null | wc -l)"
echo "- Source files: $(find sources/ -name "*.md" 2>/dev/null | wc -l)"