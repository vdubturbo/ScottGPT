#!/bin/bash

# ScottGPT Project Cleanup Script
# Removes test files, debug scripts, migration files, and temporary files
# Run from ScottGPT project root directory

echo "🧹 Starting ScottGPT project cleanup..."
echo ""

# Create backup directory for important migration files
echo "📦 Creating backup directory for migration files..."
mkdir -p .cleanup-backup/migration-files
mkdir -p .cleanup-backup/debug-scripts

# Backup important migration files before deleting
echo "📋 Backing up migration files..."
cp -r database-migration/ .cleanup-backup/migration-files/ 2>/dev/null || true
cp fix-*.sql .cleanup-backup/migration-files/ 2>/dev/null || true
cp migrate-to-pgvector.js .cleanup-backup/migration-files/ 2>/dev/null || true

echo "📋 Backing up debug scripts (in case you need them later)..."
cp -r archive-debug-scripts/ .cleanup-backup/debug-scripts/ 2>/dev/null || true

echo ""
echo "🗑️  Removing test files..."

# Remove test files
rm -f test-*.txt
rm -f test-*.js  
rm -f test-*.sh
rm -f test-*.md
rm -f test-*.mjs

echo "   ✅ Removed test files"

echo "🗑️  Removing debug files..."

# Remove debug files
rm -f debug-*.txt
rm -f debug-*.js
rm -f debug-*.sh
rm -f debug-*.py
rm -f openai-response-debug.txt
rm -f new-test-resume.txt

echo "   ✅ Removed debug files"

echo "🗑️  Removing migration and fix files..."

# Remove migration/fix files (backed up above)
rm -f fix-*.sql
rm -f migrate-to-pgvector.js
rm -rf database-migration/

echo "   ✅ Removed migration files"

echo "🗑️  Removing analysis and monitoring scripts..."

# Remove analysis scripts
rm -f analyze-*.js
rm -f check-*.js
rm -f diagnose-*.js
rm -f diagnose-*.py
rm -f monitor-db-performance.js

echo "   ✅ Removed analysis scripts"

echo "🗑️  Removing debug script directories..."

# Remove debug directories
rm -rf archive-debug-scripts/

echo "   ✅ Removed debug directories"

echo "🗑️  Removing log files..."

# Remove log files
rm -f backend.log
rm -f frontend.log
rm -f *.log

echo "   ✅ Removed log files"

echo "🗑️  Cleaning up temporary directories..."

# Clean .work directory but keep the directory structure
if [ -d ".work" ]; then
    find .work -name "*.md" -type f -delete 2>/dev/null || true
    find .work -name "*.txt" -type f -delete 2>/dev/null || true
    echo "   ✅ Cleaned .work directory"
fi

# Clean processed directory if it exists and is empty or has temp files
if [ -d "processed" ]; then
    find processed -name "*.txt" -type f -delete 2>/dev/null || true
    find processed -name "*.md" -type f -delete 2>/dev/null || true
    # Remove directory if now empty
    rmdir processed 2>/dev/null || true
    echo "   ✅ Cleaned processed directory"
fi

echo ""
echo "🧹 Cleanup complete!"
echo ""
echo "📊 Summary:"
echo "   ✅ Test files removed"
echo "   ✅ Debug scripts removed" 
echo "   ✅ Migration files removed"
echo "   ✅ Analysis scripts removed"
echo "   ✅ Log files removed"
echo "   ✅ Temporary files cleaned"
echo ""
echo "💾 Important files backed up to:"
echo "   📁 .cleanup-backup/migration-files/"
echo "   📁 .cleanup-backup/debug-scripts/"
echo ""
echo "🚨 If you need any of the removed files later, check the backup directories."
echo "   You can safely delete .cleanup-backup/ after confirming everything works."
echo ""
echo "✨ Your ScottGPT project is now clean and ready for production!"

# Show final directory structure
echo ""
echo "📁 Final directory structure:"
ls -la | grep -E "^d|^-.*\.(js|json|md|sh|sql)$" | head -20