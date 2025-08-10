# ScottGPT - Interactive Resume

An AI-powered conversational resume that answers questions about Scott Lovett's professional experience using RAG (Retrieval-Augmented Generation).

## Quick Start

```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Start development servers
npm run dev        # Backend (port 3001)
npm run client     # Frontend (port 3000)
```

## Data Ingestion Pipeline

ScottGPT includes an automated pipeline to process resume documents and create a searchable knowledge base.

### Setup

1. **Install pandoc** (for document conversion):
   ```bash
   # macOS
   brew install pandoc
   
   # Ubuntu/Debian
   apt-get install pandoc
   ```

2. **Configure environment variables** in `.env`:
   ```env
   OPENAI_API_KEY=your_openai_key
   COHERE_API_KEY=your_cohere_key
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_key
   ```

### Usage

1. **Add documents** to the `incoming/` directory:
   - Supported formats: PDF, DOCX, DOC, TXT, MD
   - Resume, job descriptions, project summaries, etc.

2. **Run the ingestion pipeline**:
   ```bash
   npm run ingest
   ```

3. **Or run individual steps**:
   ```bash
   npm run ingest:normalize   # Convert to markdown
   npm run ingest:extract     # Extract structured data
   npm run ingest:validate    # Validate and clean content
   npm run ingest:write       # Save to source files
   npm run ingest:index       # Create embeddings and store
   ```

### Pipeline Steps

1. **Normalize** (`scripts/normalize.js`): Converts documents to markdown using pandoc
2. **Extract** (`scripts/extract.js`): Uses GPT-4 to extract structured data with YAML front-matter
3. **Validate** (`scripts/validate.js`): Validates fields, normalizes skills/tags, strips PII
4. **Write** (`scripts/write.js`): Saves organized files to `sources/` directories
5. **Index** (`scripts/indexer.js`): Chunks content, generates Cohere embeddings, stores in Supabase

### Directory Structure

```
scottgpt/
├── incoming/                # Drop documents here
├── sources/                 # Processed and organized content
│   ├── jobs/               # Employment history
│   ├── projects/           # Project descriptions
│   ├── education/          # Education and certifications
│   └── certs/              # Professional certifications
├── scripts/                # Ingestion pipeline
├── config/                 # Vocabularies and schema
└── .work/                  # Temporary processing files
```

### Controlled Vocabularies

Skills and tags are normalized against controlled vocabularies in:
- `config/skills.json` - Technical, leadership, and domain skills
- `config/tags.json` - Industry tags and categories

### Content Format

Each processed file includes YAML front-matter:

```yaml
---
id: unique-identifier
type: job|project|education|cert|bio
title: Position or Project Name
org: Company/Organization
location: City, State
date_start: 2020-01-01
date_end: 2022-12-31
industry_tags: [Healthcare, AI/ML]
skills: [Program Management, RAG, Cybersecurity]
outcomes: [Reduced costs by 25%, Led team of 12]
summary: Brief overview of role/project
---

# Context
Role background and overview...

## Highlights
- Key achievements with metrics
- Major projects or initiatives

## Technical Details
Technologies, methodologies, tools used
```

### Features

- **Smart chunking**: 120-220 tokens with 60-token overlap
- **Context preservation**: Header prefixes for standalone chunks
- **PII protection**: Automatically strips emails, phones, addresses
- **Duplicate detection**: File hashing prevents reprocessing unchanged content
- **Rate limiting**: Built-in delays for API calls
- **Error handling**: Graceful failures with detailed logging

## Architecture

- **Backend**: Node.js + Express
- **Frontend**: React
- **Database**: Supabase PostgreSQL + pgvector
- **Embeddings**: Cohere embed-english-v3.0
- **AI Model**: OpenAI GPT-4 (for extraction and responses)
- **Search**: Vector similarity + metadata filtering + recency boosting