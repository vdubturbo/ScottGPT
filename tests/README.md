# ScottGPT Test Suite Documentation

## Overview

This comprehensive test suite replaces the previous collection of 19+ debug scripts with a maintainable, organized testing framework. The test suite provides confidence in system functionality through unit tests, integration tests, performance tests, and end-to-end tests.

## Test Structure

```
tests/
├── unit/               # Unit tests for individual services
│   ├── embeddings.test.js      # Embedding service tests
│   ├── retrieval.test.js       # Retrieval service tests
│   └── database.test.js        # Database service tests
├── integration/        # Integration tests for complete workflows
│   └── rag-pipeline.test.js    # Full RAG pipeline tests
├── performance/        # Performance and optimization tests
│   ├── database-performance.test.js  # Database performance tests
│   └── api-performance.test.js       # API performance tests
├── e2e/                # End-to-end API tests
│   └── chat-api.test.js        # Complete chat API workflow
├── utilities/          # Test utilities and setup
│   └── test-setup.js           # Common test utilities and mocks
└── fixtures/           # Test data and mock responses
    └── test-data.js            # Consistent test data across suites
```

## Quick Start

### Running Tests

```bash
# Install test dependencies
npm install

# Run all tests
npm test

# Run specific test types
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only  
npm run test:performance   # Performance tests only
npm run test:e2e          # End-to-end tests only

# Development workflows
npm run test:watch        # Watch mode for development
npm run test:coverage     # Run with coverage report
npm run test:ci          # CI-optimized run (no watch, coverage)
```

### Debug Tests

```bash
# Debug specific test
npm run test:debug -- tests/unit/embeddings.test.js

# Run single test file
npm test -- tests/integration/rag-pipeline.test.js

# Run tests matching pattern
npm test -- --testNamePattern="OLDP"
```

## Test Categories

### Unit Tests (`tests/unit/`)

Test individual services in isolation with mocked dependencies.

**Embeddings Service** (`embeddings.test.js`)
- ✅ Embedding generation with correct dimensions (1024D)
- ✅ Filter extraction from queries (skills, tags, organizations)
- ✅ Similarity threshold calculation
- ✅ Embedding validation and structure verification
- ✅ Performance requirements (< 2 seconds)
- ✅ Error handling for API failures

**Retrieval Service** (`retrieval.test.js`)
- ✅ Context retrieval for OLDP, IoT, and AI queries
- ✅ Semantic search with similarity calculations
- ✅ Text search fallback when semantic returns no results
- ✅ Result reranking with multiple quality signals
- ✅ Soft filtering with preference boosts
- ✅ Performance requirements (< 2 seconds)

**Database Service** (`database.test.js`)
- ✅ Database connection and health checks
- ✅ Chunk search with embeddings and filters
- ✅ Skills-based and title-based filtering
- ✅ Embedding storage and retrieval
- ✅ Cosine similarity calculations
- ✅ Performance monitoring (current: < 1s, optimized: < 50ms)

### Integration Tests (`tests/integration/`)

Test complete workflows with realistic data flow.

**RAG Pipeline** (`rag-pipeline.test.js`)
- ✅ End-to-end query processing (embedding → retrieval → generation)
- ✅ OLDP query returning Lockheed Martin 2001-2005 experience
- ✅ IoT query returning Coca-Cola Freestyle projects
- ✅ General queries with multiple relevant chunks
- ✅ Error handling across pipeline stages
- ✅ Context filtering and ranking
- ✅ Response quality and consistency

### Performance Tests (`tests/performance/`)

Monitor system performance and identify optimization opportunities.

**Database Performance** (`database-performance.test.js`)
- ✅ Connection time monitoring (< 200ms threshold)
- ✅ Search query performance (current vs. optimized)
- ✅ Concurrent request handling
- ✅ Embedding storage and retrieval efficiency
- ✅ pgvector optimization status and potential
- ✅ Stress testing with sustained load

**API Performance** (`api-performance.test.js`)
- ✅ OpenAI response generation (< 5 seconds)
- ✅ Cohere embedding generation (< 2 seconds)
- ✅ Concurrent API request handling
- ✅ Rate limiting and retry logic
- ✅ Token usage optimization
- ✅ Network error recovery

### End-to-End Tests (`tests/e2e/`)

Test complete API workflows as users would experience them.

**Chat API** (`chat-api.test.js`)
- ✅ Complete chat interactions with realistic queries
- ✅ Proper response structure and source attribution
- ✅ Error handling (missing parameters, API failures)
- ✅ Security (input sanitization, sensitive data protection)
- ✅ Concurrent request isolation
- ✅ Performance under load

## Test Data and Mocking

### Test Fixtures (`tests/fixtures/test-data.js`)

Provides consistent test data across all test suites:

- **Mock Sources**: Lockheed Martin (OLDP), Coca-Cola (IoT), Tech Startup (AI/ML)
- **Mock Chunks**: Realistic content chunks with proper skills/tags
- **Test Queries**: Validated queries for OLDP, IoT, AI, and general experience
- **Performance Thresholds**: Expected performance benchmarks

### Test Utilities (`tests/utilities/test-setup.js`)

Common utilities for all tests:

- **Mocking**: Supabase, OpenAI, Cohere clients
- **Performance Measurement**: Timing utilities with millisecond precision
- **Data Generation**: Mock embeddings, chunks, and responses
- **Validation**: Embedding structure and quality verification

## Coverage and Quality

### Coverage Requirements

```javascript
coverageThreshold: {
  global: {
    branches: 70,    // 70% branch coverage
    functions: 80,   // 80% function coverage  
    lines: 80,       // 80% line coverage
    statements: 80   // 80% statement coverage
  }
}
```

### Coverage Report

```bash
# Generate coverage report
npm run test:coverage

# View HTML coverage report
open coverage/lcov-report/index.html
```

## Performance Monitoring

### Current Performance Baselines

| Operation | Current Threshold | Optimized Target | Notes |
|-----------|------------------|------------------|--------|
| Database Connection | 200ms | 200ms | Consistently fast |
| Semantic Search | 1000ms | 50ms | pgvector optimization needed |
| Embedding Generation | 2000ms | 2000ms | External API dependent |
| Full Chat Response | 5000ms | 5000ms | End-to-end including AI |

### Performance Test Results

Performance tests log actual measurements for monitoring:

```bash
npm run test:performance
# Outputs timing data for trend analysis
```

## Migration from Debug Scripts

### Converted Functionality

The test suite replaces these debug scripts with proper test coverage:

| Debug Script | New Test Location | Functionality |
|--------------|------------------|---------------|
| `debug-embeddings.js` | `unit/embeddings.test.js` | Embedding generation and validation |
| `debug-retrieval.js` | `unit/retrieval.test.js` | Context retrieval testing |
| `debug-search.js` | `unit/database.test.js` | Database search functionality |
| `test-oldp-retrieval-detailed.js` | `integration/rag-pipeline.test.js` | OLDP query end-to-end |
| `check-oldp-context.js` | `unit/database.test.js` | OLDP content verification |
| And 14 others... | See `archive-debug-scripts/README.md` | Full mapping |

### Archived Scripts

Original debug scripts are preserved in `archive-debug-scripts/` with full documentation of the conversion mapping.

## Continuous Integration

### CI Configuration

The test suite is optimized for CI environments:

```bash
# CI-optimized test run
npm run test:ci
# - No watch mode
# - Coverage reporting
# - JUnit XML output
# - Performance metrics
```

### Test Reports

Tests generate multiple report formats:

- **JUnit XML**: `test-results/junit.xml` (for CI integration)
- **Coverage**: `coverage/` directory (HTML, LCOV, JSON)
- **Performance**: `test-results/performance.json` (timing data)

## Development Workflow

### Writing New Tests

1. **Unit Tests**: Test individual functions/services in isolation
   ```javascript
   import TestSetup from '../utilities/test-setup.js';
   
   describe('My Service', () => {
     beforeEach(() => {
       TestSetup.setupMocks();
     });
   });
   ```

2. **Integration Tests**: Test complete workflows
   ```javascript
   test('should handle complete workflow', async () => {
     const result = await service.processQuery(query);
     expect(result.context).toHaveLength(expectedCount);
   });
   ```

3. **Performance Tests**: Monitor timing and optimization
   ```javascript
   const performance = await TestSetup.measurePerformance(
     () => service.slowOperation(),
     'Operation Name'
   );
   expect(performance.duration).toBeLessThan(threshold);
   ```

### Test Debugging

```bash
# Run single test with verbose output
npm test -- --verbose tests/unit/embeddings.test.js

# Debug test with breakpoints
npm run test:debug -- tests/integration/rag-pipeline.test.js

# Watch specific test during development
npm run test:watch -- tests/unit/retrieval.test.js
```

## Troubleshooting

### Common Issues

**Tests Timing Out**
- Check if external services (OpenAI, Cohere) are mocked properly
- Increase timeout in specific test files if needed

**Coverage Too Low**
- Add tests for uncovered branches and functions
- Use `npm run test:coverage` to identify gaps

**Performance Tests Failing**
- Check if database optimization (pgvector) is needed
- Monitor actual vs. expected performance baselines

**Mocking Issues**
- Ensure `TestSetup.setupMocks()` is called in `beforeEach`
- Check mock implementations match expected interfaces

### Getting Help

1. **Check Test Logs**: Tests output detailed timing and result information
2. **Review Coverage Report**: Identifies untested code paths
3. **Run Individual Test Files**: Isolate issues to specific functionality
4. **Compare with Archived Scripts**: Reference original debug script logic

## Future Enhancements

### Planned Improvements

- **Visual Testing**: Screenshot testing for React components
- **Load Testing**: Sustained high-load performance testing  
- **Regression Testing**: Automated testing of known issue fixes
- **Contract Testing**: API contract validation

### Performance Optimization

Tests monitor for these optimization opportunities:

- **pgvector Migration**: 10-100x faster similarity queries
- **Connection Pooling**: Improved database connection efficiency
- **Caching**: Embedding and response caching strategies
- **Batch Processing**: Optimized bulk operations

The test suite provides the foundation for confident development and deployment of ScottGPT improvements.