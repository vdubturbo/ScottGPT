# Archived Debug Scripts

These debug scripts were archived on 2025-08-17T19:23:28.225Z after being converted to proper test suites.

## Conversion Mapping

- `debug-embeddings.js` → `tests/unit/embeddings.test.js`
- `check-embedding-details.js` → `tests/unit/embeddings.test.js`
- `debug-db-structure.js` → `tests/unit/database.test.js`
- `debug-search.js` → `tests/unit/database.test.js`
- `debug-retrieval.js` → `tests/unit/retrieval.test.js`
- `test-oldp-retrieval-detailed.js` → `tests/integration/rag-pipeline.test.js`
- `test-oldp-search.js` → `tests/integration/rag-pipeline.test.js`
- `test-oldp-similarity.js` → `tests/integration/rag-pipeline.test.js`
- `test-oldp-filter.js` → `tests/integration/rag-pipeline.test.js`
- `test-extraction.js` → `tests/integration/rag-pipeline.test.js`
- `test-search.js` → `tests/integration/rag-pipeline.test.js`
- `test-pgvector-migration.js` → `tests/performance/database-performance.test.js`
- `test-scoring-system.js` → `tests/performance/api-performance.test.js`
- `check-oldp-context.js` → `tests/unit/database.test.js`
- `check-oldp-embeddings.js` → `tests/unit/embeddings.test.js`
- `check-skills-tags.js` → `tests/unit/retrieval.test.js`
- `debug-oldp-search.js` → `tests/integration/rag-pipeline.test.js`
- `debug-iot-search.js` → `tests/integration/rag-pipeline.test.js`
- `debug-extraction.js` → `tests/integration/rag-pipeline.test.js`

## Test Suite Usage

The functionality of these debug scripts is now covered by the test suite:

```bash
# Run all tests
npm test

# Run specific test types
npm run test:unit
npm run test:integration
npm run test:performance
npm run test:e2e

# Run with coverage
npm run test:coverage
```

These archived files can be safely deleted if the test suite provides adequate coverage.
