#!/bin/bash

echo "🧹 Starting clean slate reset..."

# Clear all working directories
echo "📁 Clearing work directories..."
rm -rf .work/
mkdir -p .work/normalized
mkdir -p .work/extracted  
mkdir -p .work/validated

# Clear source directories
echo "📁 Clearing source directories..."
rm -rf sources/
mkdir -p sources/jobs
mkdir -p sources/projects
mkdir -p sources/education
mkdir -p sources/certs
mkdir -p sources/bio

# Clear archives
echo "📁 Clearing archives..."
rm -rf archives/

# Clear any cache files
echo "🗑️ Clearing cache files..."
find . -name "*cache*" -type f -delete
find . -name "*.cache" -type f -delete

# Clear incoming files
echo "📥 Clearing incoming files..."
rm -rf incoming/*

# Don't clear processed files as they're the archive
# rm -rf processed/

echo "✅ Clean slate complete!"
echo ""
echo "💡 Next steps:"
echo "1. Clear database tables in Supabase"
echo "2. Upload ONE simple test document"
echo "3. Verify complete pipeline works end-to-end"
