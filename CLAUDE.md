# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: ScottGPT

An Interactive AI-powered resume that lets users ask questions about professional experience and get personalized responses using RAG (Retrieval-Augmented Generation).

## Current Status (Aug 17, 2025)

✅ **System Operational** - All major RAG pipeline issues have been resolved. The system correctly retrieves and presents information without hallucination or time period mixing.

✅ **Test Suite Complete** - Converted 19+ debug scripts to comprehensive test suite with unit, integration, performance, and end-to-end tests.

## Development Commands

```bash
# Install dependencies
npm install
cd client && npm install

# Development (run both server and client)
npm run dev        # Backend server (port 3001)
cd client && npm start  # Frontend React app (port 3000)

# Build for production
npm run build

# Testing
npm test                 # Run all tests
npm run test:unit        # Unit tests only (services isolation)
npm run test:integration # Integration tests (RAG pipeline)
npm run test:performance # Performance tests (database, API)
npm run test:e2e         # End-to-end tests (chat API)
npm run test:coverage    # Generate coverage report
npm run test:watch       # Watch mode for development
npm run test:ci          # CI-optimized run

# Lint code
npm run lint
npm run lint:fix         # Auto-fix linting issues

# Process new documents
node scripts/indexer.js   # Optimized with dynamic timeouts

# Database performance optimization
node migrate-to-pgvector.js    # Enable pgvector for 10-100x faster queries
node monitor-db-performance.js # Check current performance and optimization status
```

## Architecture Overview

**Tech Stack:**
- Backend: Node.js + Express
- Frontend: React
- Database: Supabase (PostgreSQL + pgvector)
- Embeddings: Cohere API (embed-english-v3.0, 1024 dimensions)
- AI Model: OpenAI ChatGPT-4
- Deployment: Netlify

**Project Structure:**
```
├── server.js              # Express server entry point
├── routes/                # API endpoints
│   ├── chat.js            # Chat/Q&A endpoint
│   └── data.js            # Data ingestion endpoint
├── services/              # Business logic (RAG pipeline)
│   ├── rag.js            # Main RAG orchestrator
│   ├── retrieval.js      # Consolidated retrieval service (semantic + text fallback)
│   ├── embeddings.js     # Cohere integration (FIXED)
│   └── simple-retrieval.js # Deprecated - consolidated into retrieval.js
├── utils/                 # Shared utilities
│   └── embedding-utils.js # Embedding validation, storage, and processing utilities
├── config/                # Configuration files
│   └── database.js       # Supabase config (FIXED)
├── scripts/
│   ├── indexer.js              # Document processing pipeline
│   └── cleanup-debug-scripts.js # Debug script management utility
├── tests/                      # Comprehensive test suite
│   ├── unit/                  # Unit tests (embeddings, retrieval, database)
│   ├── integration/           # Integration tests (RAG pipeline)
│   ├── performance/           # Performance tests (database, API)
│   ├── e2e/                   # End-to-end tests (chat API)
│   ├── utilities/             # Test utilities and mocking
│   └── fixtures/              # Test data and mock responses
├── archive-debug-scripts/      # Archived debug scripts (19 files)
├── archives/                   # Source content (gitignored)
│   ├── jobs/                  # 70+ job entries
│   ├── projects/              # Project descriptions
│   └── bio/                   # Professional summary
├── sources/                    # Empty (content in archives)
└── client/               # React frontend
    ├── src/
    │   ├── App.js        # Main test interface
    │   └── App.css       # Basic styling
    └── public/
```

## Recent Fixes (Aug 2025)

### Core System Improvements
1. **Embedding Storage Consistency**: Standardized embedding storage and retrieval pipeline
   - Implemented comprehensive embedding validation and utilities
   - Eliminated redundant defensive parsing throughout codebase
   - Added future-proofing for pgvector migration compatibility
   - Performance optimizations for batch embedding operations
2. **Consolidated Retrieval Services**: Merged dual retrieval systems into single robust service
   - Removed artificial similarity score manipulation
   - Semantic search prioritized over text search
   - Text search only as true fallback when semantic returns zero results
   - Enhanced reranking with multiple quality signals
3. **Similarity-First Retrieval**: Now calculates similarity for 1000 chunks before filtering
4. **Soft Filtering**: Filters are preferences with small boosts (0.02), not hard requirements
5. **Text Search Fix**: Only triggers when NO semantic results, uses lower confidence (0.3)
6. **Threshold Optimization**: Lowered from 0.35-0.45 to 0.25-0.35 for better recall
7. **Indexer Timeout Fix**: Removed artificial 2-minute timeout, added dynamic timeouts

### Test Suite Implementation (Aug 17, 2025)
8. **Converted Debug Scripts to Test Suite**: Replaced 19+ ad-hoc debug scripts with maintainable tests
   - **Unit Tests**: Individual service testing (embeddings, retrieval, database)
   - **Integration Tests**: Complete RAG pipeline workflows
   - **Performance Tests**: Database and API performance monitoring
   - **End-to-End Tests**: Chat API functionality testing
   - **Coverage Requirements**: 70% branches, 80% functions/lines/statements
   - **CI/CD Integration**: Automated testing with GitHub Actions
   - **Performance Baselines**: Monitoring for optimization opportunities

## RAG Pipeline Flow

1. User asks question via React frontend
2. Backend embeds question using Cohere (1024-dim)
3. Database retrieves 1000 chunks, calculates similarity
4. Top matches selected by similarity score (threshold: 0.25)
5. Filters applied as soft preferences
6. Context + question sent to ChatGPT-4
7. Generated response returned with source attribution

## Known Issues

- **Database Performance**: Currently using 1000-record workaround due to missing pgvector optimization
  - **Impact**: Similarity queries take 200-500ms instead of 5-10ms
  - **Cause**: Embeddings stored as TEXT, not native vectors; no vector indexes
  - **Solution**: Run `node migrate-to-pgvector.js` to enable pgvector optimization
- **Text Search Syntax**: Some complex OR queries have syntax issues (non-critical)

## Testing

### Automated Test Suite

```bash
# Run all tests
npm test

# Run specific test categories
npm run test:unit        # Service-level testing
npm run test:integration # RAG pipeline testing
npm run test:performance # Performance monitoring
npm run test:e2e         # Complete API testing

# Development workflows
npm run test:watch       # Watch mode for development
npm run test:coverage    # Generate coverage report
npm run test:debug       # Debug specific tests
```

### Manual Testing Queries

```bash
# OLDP Experience (should return Lockheed Martin 2001-2005)
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell me about Scott's OLDP experience"}'

# IoT Work (should return Coca-Cola Freestyle)
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What IoT work did Scott do?"}'

# AI/ML Experience (should return machine learning projects)
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What AI/ML experience does Scott have?"}'
```

### Test Coverage & Performance

- **Coverage Thresholds**: 70% branches, 80% functions/lines/statements
- **Performance Baselines**: Database < 1s, API < 5s, Embeddings < 2s
- **Test Documentation**: See `tests/README.md` for detailed usage
- **Archived Debug Scripts**: 19 scripts archived in `archive-debug-scripts/`

## Environment Variables

- `OPENAI_API_KEY`: ChatGPT API access
- `SUPABASE_URL` + `SUPABASE_ANON_KEY`: Database access  
- `COHERE_API_KEY`: Embedding generation