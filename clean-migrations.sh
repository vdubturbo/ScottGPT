#!/bin/bash

echo "🧹 Cleaning up migration files..."

# Move broken/redundant files to archive
mkdir -p migrations/archive

# Archive the broken function file that caused overloading issues
mv migrations/003_fix_vector_function.sql migrations/archive/

echo "✅ Moved 003_fix_vector_function.sql to archive"

# List remaining active migrations
echo ""
echo "📋 Active migrations (in order):"
echo "1. migrations/002_fix_vector_storage.sql - Converts data and creates insert function"
echo "2. migrations/004_fix_function_types.sql - Creates search function with correct types"  
echo "3. migrations/005_fix_insert_types.sql - Fixes insert function types"
echo ""
echo "🗂️ All other files archived or left as-is for reference"
echo ""
echo "Ready for your solution!"
