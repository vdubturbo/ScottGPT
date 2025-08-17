# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: ScottGPT

An Interactive AI-powered resume that lets users ask questions about professional experience and get personalized responses using RAG (Retrieval-Augmented Generation).

## Current Status (Aug 16, 2025)

✅ **System Operational** - All major RAG pipeline issues have been resolved. The system correctly retrieves and presents information without hallucination or time period mixing.

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

# Run tests
npm test

# Lint code
npm run lint

# Process new documents
node scripts/indexer.js   # Note: Has 2-minute debug timeout
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
├── config/                # Configuration files
│   └── database.js       # Supabase config (FIXED)
├── scripts/
│   └── indexer.js        # Document processing pipeline
├── archives/             # Source content (gitignored)
│   ├── jobs/            # 70+ job entries
│   ├── projects/        # Project descriptions
│   └── bio/             # Professional summary
├── sources/              # Empty (content in archives)
└── client/               # React frontend
    ├── src/
    │   ├── App.js        # Main test interface
    │   └── App.css       # Basic styling
    └── public/
```

## Recent Fixes (Aug 2025)

1. **Consolidated Retrieval Services**: Merged dual retrieval systems into single robust service
   - Removed artificial similarity score manipulation
   - Semantic search prioritized over text search
   - Text search only as true fallback when semantic returns zero results
   - Enhanced reranking with multiple quality signals
2. **Similarity-First Retrieval**: Now calculates similarity for 1000 chunks before filtering
3. **Soft Filtering**: Filters are preferences with small boosts (0.02), not hard requirements
4. **Text Search Fix**: Only triggers when NO semantic results, uses lower confidence (0.3)
5. **Threshold Optimization**: Lowered from 0.35-0.45 to 0.25-0.35 for better recall
6. **Indexer Timeout Fix**: Removed artificial 2-minute timeout, added dynamic timeouts

## RAG Pipeline Flow

1. User asks question via React frontend
2. Backend embeds question using Cohere (1024-dim)
3. Database retrieves 1000 chunks, calculates similarity
4. Top matches selected by similarity score (threshold: 0.25)
5. Filters applied as soft preferences
6. Context + question sent to ChatGPT-4
7. Generated response returned with source attribution

## Known Issues

- **Text Search Syntax**: Some complex OR queries have syntax issues (non-critical)

## Testing Queries

```bash
# OLDP Experience (should return Lockheed Martin 2001-2005)
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell me about Scott's OLDP experience"}'

# IoT Work (should return Coca-Cola Freestyle)
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What IoT work did Scott do?"}'
```

## Environment Variables

- `OPENAI_API_KEY`: ChatGPT API access
- `SUPABASE_URL` + `SUPABASE_ANON_KEY`: Database access  
- `COHERE_API_KEY`: Embedding generation