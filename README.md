# ScottGPT

An AI-powered interactive resume system that uses Retrieval-Augmented Generation (RAG) to answer questions about Scott Lovett's professional experience, projects, and skills.

## Overview

ScottGPT is a sophisticated AI chatbot built specifically for showcasing professional experience through natural language interactions. It uses:

- **OpenAI GPT-4** for intelligent document extraction and conversational responses
- **Cohere embeddings** (embed-english-v3.0) for semantic search and retrieval
- **Supabase PostgreSQL** with pgvector for vector storage and similarity search
- **Node.js/Express** backend with real-time file processing
- **React** frontend for interactive chat experience

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Document      │    │   AI Extraction   │    │   Vector Store  │
│   Upload        │───▶│   & Processing    │───▶│   (Supabase)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                       │
         │                        │                       │
         ▼                        ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Interface │    │   RAG Pipeline    │    │   Chat Bot      │
│   (React)       │◀───│   (Retrieval)     │◀───│   (GPT-4)       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Features

- **Intelligent Document Processing**: Automatically extracts structured data from resumes, job descriptions, and project documents
- **Semantic Search**: Uses vector embeddings to find relevant content based on question context
- **Real-time Upload**: Drag-and-drop file upload with live processing feedback
- **Contextual Responses**: AI provides detailed, accurate answers about professional experience
- **Content Management**: Organized storage by content type (jobs, projects, education, certifications)

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Supabase account with project created
- OpenAI API key
- Cohere API key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/ScottGPT.git
   cd ScottGPT
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd client && npm install && cd ..
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your API keys:
   ```
   # Supabase Configuration
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   
   # AI API Keys
   OPENAI_API_KEY=your_openai_api_key
   COHERE_API_KEY=your_cohere_api_key
   
   # Server Configuration
   PORT=5000
   NODE_ENV=development
   ```

4. **Set up the database**
   ```bash
   # Run database migrations in your Supabase SQL editor
   # Copy and execute the SQL from migrations/public-schema.sql
   ```

5. **Start the development servers**
   ```bash
   npm run dev        # Backend (port 5000)
   npm run client     # Frontend (port 3000)
   ```

6. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000

## Usage

### Document Upload

1. **Upload Files**: Drag and drop PDF, DOCX, DOC, TXT, or MD files
2. **Processing**: The system automatically:
   - Normalizes documents to markdown
   - Extracts structured data using AI
   - Validates content and removes PII
   - Creates vector embeddings
   - Indexes content for search

### Chat Interface

Ask questions about Scott's experience:
- "What experience does Scott have with AI and machine learning?"
- "Tell me about Scott's project management experience"
- "What industries has Scott worked in?"
- "What are Scott's key technical skills?"

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

## API Documentation

### Upload Endpoints

- `POST /api/upload` - Upload files
- `POST /api/upload/process` - Process uploaded files with real-time updates
- `GET /api/upload/stats` - Get database statistics
- `GET /api/upload/incoming` - List pending files

### Chat Endpoints

- `POST /api/chat` - Send message and get AI response
- `GET /api/chat/history` - Get conversation history

### Search Endpoints

- `GET /api/search?q=query` - Search content by query
- `GET /api/search/similar` - Find similar content

## Development

### File Structure

```
ScottGPT/
├── config/
│   └── database.js         # Supabase client and database functions
├── scripts/
│   ├── normalize.js        # Document normalization
│   ├── extract.js          # AI-powered data extraction
│   ├── validate.js         # Content validation
│   ├── write.js           # File organization
│   └── indexer.cjs        # Vector embedding creation
├── routes/
│   ├── upload.js          # File upload and processing
│   ├── chat.js            # Chat API endpoints
│   └── search.js          # Search functionality
├── public/                # Static files
├── client/                # React frontend
├── sources/               # Organized content by type
│   ├── jobs/             # Employment history
│   ├── projects/         # Project descriptions
│   ├── education/        # Education records
│   └── certs/           # Certifications
├── migrations/           # Database setup scripts
└── .work/               # Temporary processing files
```

### Content Processing Pipeline

1. **Normalize** (`scripts/normalize.js`): Converts documents to markdown using pandoc
2. **Extract** (`scripts/extract.js`): AI extracts structured YAML + content using GPT-4
3. **Validate** (`scripts/validate.js`): Ensures data quality and removes PII
4. **Write** (`scripts/write.js`): Organizes files by type and date
5. **Index** (`scripts/indexer.cjs`): Creates embeddings and stores in vector database

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

### Adding New Content Types

1. Update `scripts/extract.js` with new type in AI prompt
2. Add type handling in `scripts/write.js`
3. Create corresponding directory in `sources/`
4. Update validation rules in `scripts/validate.js`

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Your Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `OPENAI_API_KEY` | OpenAI API key for GPT-4 | Yes |
| `COHERE_API_KEY` | Cohere API key for embeddings | Yes |
| `PORT` | Server port (default: 5000) | No |
| `NODE_ENV` | Environment (development/production) | No |

### AI Configuration

- **Embeddings Model**: Cohere embed-english-v3.0 (1024 dimensions)
- **Chat Model**: OpenAI GPT-4o-mini
- **Chunk Size**: 120-220 tokens with 60 token overlap
- **Rate Limiting**: Built-in delays for API compliance

## Database Schema

### Tables

- **sources**: Document metadata and processing status
- **content_chunks**: Text chunks with vector embeddings
- **search_logs**: Query history and analytics

### Key Features

- Vector similarity search with pgvector
- Full-text search capabilities
- Automatic chunk deduplication
- Performance optimized indexes

## Deployment

### Production Setup

1. **Environment**: Set `NODE_ENV=production`
2. **Database**: Use Supabase production instance
3. **API Keys**: Use production API keys with higher limits
4. **Security**: Configure CORS, rate limiting, and authentication
5. **Monitoring**: Set up logging and error tracking

### Recommended Hosting

- **Backend**: Railway, Render, or Heroku
- **Frontend**: Netlify, Vercel, or GitHub Pages
- **Database**: Supabase (managed PostgreSQL with vector support)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

Scott Lovett - [GitHub](https://github.com/yourusername)

Project Link: https://github.com/yourusername/ScottGPT