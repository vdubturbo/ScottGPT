# ScottGPT pgvector Migration Instructions

## Overview
Your ScottGPT database needs to be migrated from JavaScript-based similarity calculations to pgvector for dramatically improved performance.

## Current Performance Issue
- **Problem**: Similarity calculations done in JavaScript after retrieving 1000+ records
- **Impact**: Slow queries (200-500ms), high memory usage, poor scalability
- **Solution**: Use pgvector for database-level vector similarity with proper indexing

## Migration Steps

### 1. Enable pgvector in Supabase
1. Go to your Supabase project dashboard: https://app.supabase.com/projects
2. Navigate to SQL Editor
3. Copy and run the contents of: `./database-migration/01-enable-pgvector.sql`
4. This will:
   - Enable the vector extension
   - Add embedding_vector column
   - Create migration functions
   - Create optimized search functions

### 2. Create Vector Indexes
1. After step 1 completes, run: `./database-migration/02-create-vector-indexes.sql`
2. This will:
   - Create HNSW indexes for fast similarity search
   - Create supporting indexes for filters
   - Set up performance monitoring functions

### 3. Run Migration Script
1. After both SQL scripts complete, run: `node migrate-to-pgvector.js`
2. This will:
   - Migrate existing embeddings to vector format
   - Update application code
   - Test performance improvements

## Expected Performance Improvement
- **Query time**: 200-500ms → 5-10ms (20-100x faster)
- **Memory usage**: High → Low (no need to load all vectors)
- **CPU usage**: High → Low (database-optimized operations)
- **Scalability**: Limited → Excellent (handles 10k+ vectors easily)

## Verification
After migration, you can verify performance with:
```sql
SELECT * FROM benchmark_vector_search(10);
SELECT * FROM get_vector_search_stats();
```

## Rollback Plan
If issues occur, the original database.js is backed up as database-backup.js
and can be restored to return to the original behavior.

## Support
- Supabase docs: https://supabase.com/docs/guides/database/extensions/pgvector
- pgvector docs: https://github.com/pgvector/pgvector
- ScottGPT issues: Check ./CLAUDE.md for troubleshooting