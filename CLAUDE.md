# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: ScottGPT

An Interactive AI-powered resume that lets users ask questions about professional experience and get personalized responses using RAG (Retrieval-Augmented Generation).

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
```

## Architecture Overview

**Tech Stack:**
- Backend: Node.js + Express
- Frontend: React
- Database: Supabase (PostgreSQL + Vector)
- Embeddings: Cohere API
- AI Model: OpenAI ChatGPT-4
- Deployment: Netlify

**Project Structure:**
```
├── server.js              # Express server entry point
├── routes/                # API endpoints
│   ├── chat.js            # Chat/Q&A endpoint
│   └── data.js            # Data ingestion endpoint
├── services/              # Business logic (RAG pipeline)
├── config/                # Configuration files
├── utils/                 # Helper functions
└── client/                # React frontend
    ├── src/
    │   ├── App.js         # Main test interface
    │   └── App.css        # Basic styling
    └── public/
```

**RAG Pipeline Flow:**
1. User asks question via React frontend
2. Backend embeds question using Cohere
3. Vector search in Supabase for relevant resume content
4. Context + question sent to ChatGPT-4
5. Generated response returned to user

**Environment Variables:**
- `OPENAI_API_KEY`: ChatGPT API access
- `SUPABASE_URL` + `SUPABASE_ANON_KEY`: Database access
- `COHERE_API_KEY`: Embedding generation