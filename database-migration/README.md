# ScottGPT Database Performance Optimization

## Problem Statement

ScottGPT currently uses a performance workaround where it retrieves 1000 chunks and calculates similarity in memory using JavaScript. This approach has several critical issues:

- **Slow queries**: 200-800ms per search instead of 5-10ms
- **High memory usage**: Loads 6-12MB of vectors per query
- **Poor scalability**: Linear performance degradation with data size
- **High CPU usage**: Client-side vector calculations

## Root Cause Analysis

1. **pgvector extension not enabled** in Supabase database
2. **Embeddings stored as TEXT/JSON** instead of native `vector(1024)` type
3. **No vector indexes** because they can't be created on text columns
4. **All similarity calculations in JavaScript** instead of optimized database operations

## Solution Overview

The solution implements pgvector-based similarity search with the following improvements:

- ✅ **10-100x faster queries** (5-10ms vs 200-800ms)
- ✅ **Minimal memory usage** (only results loaded, not all vectors)
- ✅ **Database-optimized operations** (HNSW indexes for similarity search)
- ✅ **Excellent scalability** (sub-linear performance with proper indexes)
- ✅ **Backward compatibility** (falls back to JavaScript if pgvector unavailable)

## Migration Files

### 1. `01-enable-pgvector.sql`
- Enables the vector extension in Supabase
- Adds `embedding_vector` column alongside existing `embedding`
- Creates helper functions for embedding conversion
- Creates optimized similarity search function
- Sets up performance monitoring tools

### 2. `02-create-vector-indexes.sql`
- Creates HNSW indexes for fast similarity search
- Creates supporting indexes for metadata filters
- Sets up performance benchmarking functions
- Provides index usage monitoring tools

### 3. Application Updates
- `database-optimized.js`: Enhanced database class with pgvector support
- `migrate-to-pgvector.js`: Automated migration script
- `monitor-db-performance.js`: Performance monitoring and analysis

## Expected Performance Improvements

| Metric | Before (JavaScript) | After (pgvector) | Improvement |
|--------|-------------------|------------------|-------------|
| Query Time | 200-800ms | 5-10ms | 20-100x faster |
| Memory Usage | 6-12MB per query | 0.1MB per query | 60-120x less |
| CPU Usage | High (client-side) | Low (database) | Significantly reduced |
| Network Traffic | High (all vectors) | Low (results only) | 50-100x less |
| Scalability | Linear degradation | Sub-linear | Excellent |

## Migration Process

### Step 1: Database Setup (Manual)
Run these SQL scripts in your Supabase SQL Editor:
1. `01-enable-pgvector.sql` - Enable pgvector and create functions
2. `02-create-vector-indexes.sql` - Create optimized indexes

### Step 2: Automated Migration
```bash
node migrate-to-pgvector.js
```
This script will:
- Check pgvector availability
- Migrate existing embeddings to vector format
- Update application configuration
- Test performance improvements

### Step 3: Monitoring
```bash
node monitor-db-performance.js
```
Provides:
- Real-time performance metrics
- Optimization recommendations
- Historical trend tracking

## Verification

After migration, you should see:
- Query times reduced from 200-800ms to 5-10ms
- Search method shows "pgvector (optimized)" instead of "JavaScript (legacy)"
- Performance monitoring confirms dramatic improvements

## Rollback Plan

If issues occur:
1. The original `database.js` is backed up as `database-backup.js`
2. Restore with: `cp database-backup.js database.js`
3. The system will fall back to JavaScript similarity calculations
4. No data is lost (both text and vector embeddings are preserved)

## Troubleshooting

### pgvector Not Available
- Ensure your Supabase project supports pgvector extension
- Contact Supabase support if the extension isn't available
- Check project settings for available extensions

### Migration Fails
- Verify you have proper database permissions
- Check that embeddings exist in the database
- Run scripts manually in Supabase SQL Editor if needed

### Performance Not Improved
- Verify vector indexes were created successfully
- Check that `embedding_vector` column is populated
- Monitor index usage with provided tools

## Support Resources

- [Supabase pgvector documentation](https://supabase.com/docs/guides/database/extensions/pgvector)
- [pgvector GitHub repository](https://github.com/pgvector/pgvector)
- ScottGPT troubleshooting: See `../CLAUDE.md`