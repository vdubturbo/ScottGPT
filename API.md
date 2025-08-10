# ScottGPT API Documentation

## Base URL
```
http://localhost:5000/api
```

## Authentication
Currently, no authentication is required for API endpoints. In production, consider implementing API key authentication.

## Response Format
All API endpoints return JSON responses with the following structure:

### Success Response
```json
{
  "success": true,
  "data": {...},
  "message": "Operation completed successfully"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "details": "Additional error details (optional)"
}
```

## Endpoints

### Upload API

#### Upload Files
Upload documents for processing.

```
POST /api/upload
```

**Content-Type:** `multipart/form-data`

**Request Body:**
- `files`: Array of files (PDF, DOCX, DOC, TXT, MD)
- Max file size: 10MB per file
- Max files: 10 files per request

**Response:**
```json
{
  "success": true,
  "message": "5 files uploaded successfully",
  "files": [
    {
      "originalName": "resume.pdf",
      "filename": "1628123456789-resume.pdf",
      "size": 2048576,
      "mimetype": "application/pdf"
    }
  ]
}
```

**Example:**
```bash
curl -X POST http://localhost:5000/api/upload \
  -F "files=@resume.pdf" \
  -F "files=@cover_letter.docx"
```

#### Process Uploaded Files
Runs the complete ingestion pipeline on uploaded files.

```
POST /api/upload/process
```

**Response:** Server-Sent Events (SSE) stream with real-time processing updates

**Content-Type:** `text/plain`

**Response Stream:**
```
🚀 Starting ingestion pipeline...
📁 Found 2 files to process

📋 Step: Converting documents to markdown...
   📖 Processing: 1628123456789-resume.pdf
   ✅ Converted: resume.pdf -> resume.md
✅ normalize completed

📋 Step: Extracting structured data with AI...
   🔍 Processing: resume.md
   📋 Found 3 content blocks in resume.md
   💾 Extracted: resume.block-0.md
✅ extract completed

📋 Step: Validating content and stripping PII...
   ✅ Valid: resume.block-0.md
✅ validate completed

📋 Step: Organizing files by type...
   📁 Written: sources/jobs/2023-senior-director-delivery.md
✅ write completed

📋 Step: Creating embeddings and indexing...
   🔗 Processing source: sources/jobs/2023-senior-director-delivery.md
   📝 Created 2 chunks from sources/jobs/2023-senior-director-delivery.md
✅ index completed

✅ Ingestion pipeline completed successfully!
```

**Example:**
```bash
curl -X POST http://localhost:5000/api/upload/process
```

#### Get Upload Statistics
Returns database statistics and content summary.

```
GET /api/upload/stats
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalSources": 4,
    "totalChunks": 13,
    "totalTokens": 2847,
    "sourcesByType": {
      "job": 2,
      "project": 2
    },
    "lastUpdated": "2023-08-10T15:30:00.000Z"
  }
}
```

#### List Incoming Files
Lists files waiting to be processed.

```
GET /api/upload/incoming
```

**Response:**
```json
{
  "success": true,
  "files": [
    {
      "name": "1628123456789-resume.pdf",
      "size": 2048576,
      "modified": "2023-08-10T14:25:00.000Z"
    }
  ]
}
```

### Chat API

#### Send Chat Message
Send a message and get an AI response about Scott's experience.

```
POST /api/chat
```

**Request Body:**
```json
{
  "message": "What experience does Scott have with AI and machine learning?",
  "conversation_id": "optional-conversation-id"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "response": "Scott has extensive experience with AI and machine learning, particularly in...",
    "sources": [
      {
        "id": "binary-defense-senior-director",
        "title": "Senior Director, Delivery Support Office",
        "org": "Binary Defense",
        "relevance": 0.92,
        "snippet": "Led AI/ML initiatives across cybersecurity portfolio..."
      }
    ],
    "conversation_id": "conv-123456",
    "message_id": "msg-789012"
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell me about Scott'\''s project management experience"}'
```

#### Get Conversation History
Retrieve chat history for a conversation.

```
GET /api/chat/history/:conversation_id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "conversation_id": "conv-123456",
    "messages": [
      {
        "id": "msg-789012",
        "role": "user",
        "content": "What experience does Scott have with AI?",
        "timestamp": "2023-08-10T15:30:00.000Z"
      },
      {
        "id": "msg-789013",
        "role": "assistant",
        "content": "Scott has extensive experience with AI...",
        "sources": [...],
        "timestamp": "2023-08-10T15:30:15.000Z"
      }
    ]
  }
}
```

### Search API

#### Search Content
Search through Scott's professional content.

```
GET /api/search?q={query}&limit={limit}&type={type}
```

**Query Parameters:**
- `q` (required): Search query
- `limit` (optional): Number of results (default: 10, max: 50)
- `type` (optional): Filter by content type (job, project, education, cert)

**Response:**
```json
{
  "success": true,
  "data": {
    "query": "cybersecurity program management",
    "results": [
      {
        "id": "binary-defense-senior-director",
        "type": "job",
        "title": "Senior Director, Delivery Support Office",
        "org": "Binary Defense",
        "summary": "Led cybersecurity PMO for $30M portfolio...",
        "relevance": 0.95,
        "snippet": "...cybersecurity solution portfolio management...",
        "date_start": "2023-01-01",
        "skills": ["Program Management", "Cybersecurity"],
        "industry_tags": ["Cybersecurity", "Government"]
      }
    ],
    "total": 1,
    "took": 45
  }
}
```

**Example:**
```bash
curl "http://localhost:5000/api/search?q=AI%20machine%20learning&limit=5"
```

#### Find Similar Content
Find content similar to a specific piece.

```
GET /api/search/similar/:content_id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "source_id": "binary-defense-senior-director",
    "similar": [
      {
        "id": "middleware-project-lead",
        "type": "project",
        "title": "Middleware Project Lead",
        "similarity": 0.87,
        "snippet": "Led cross-functional team for enterprise middleware..."
      }
    ],
    "total": 5
  }
}
```

## Error Codes

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| 400 | BAD_REQUEST | Invalid request parameters |
| 404 | NOT_FOUND | Resource not found |
| 413 | PAYLOAD_TOO_LARGE | File size exceeds limit |
| 415 | UNSUPPORTED_MEDIA_TYPE | Invalid file type |
| 429 | TOO_MANY_REQUESTS | Rate limit exceeded |
| 500 | INTERNAL_SERVER_ERROR | Server error |

## Rate Limiting

- Upload endpoints: 10 requests per minute
- Chat endpoints: 30 requests per minute
- Search endpoints: 60 requests per minute

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 29
X-RateLimit-Reset: 1628123456
```

## Webhooks (Future Feature)

Planned webhook endpoints for processing notifications:

```
POST /api/webhooks/processing-complete
POST /api/webhooks/new-content-indexed
POST /api/webhooks/error-occurred
```

## SDK Examples

### JavaScript/Node.js

```javascript
const ScottGPT = require('scottgpt-client');

const client = new ScottGPT({
  baseUrl: 'http://localhost:5000/api'
});

// Upload and process files
await client.upload.files(['resume.pdf', 'portfolio.docx']);
await client.upload.process();

// Chat with ScottGPT
const response = await client.chat.send("Tell me about Scott's experience");
console.log(response.message);

// Search content
const results = await client.search.query("project management");
```

### Python

```python
import scottgpt

client = scottgpt.Client(base_url='http://localhost:5000/api')

# Upload files
client.upload.files(['resume.pdf', 'portfolio.docx'])
client.upload.process()

# Chat
response = client.chat.send("What are Scott's key skills?")
print(response['data']['response'])

# Search
results = client.search.query("cybersecurity", limit=10)
```

### cURL Examples

Complete workflow example:

```bash
# 1. Upload files
curl -X POST http://localhost:5000/api/upload \
  -F "files=@resume.pdf"

# 2. Process files
curl -X POST http://localhost:5000/api/upload/process

# 3. Check stats
curl http://localhost:5000/api/upload/stats

# 4. Chat with ScottGPT
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What industries has Scott worked in?"}'

# 5. Search content
curl "http://localhost:5000/api/search?q=leadership%20experience"
```

## Development Notes

- All file uploads are temporarily stored in `incoming/` directory
- Processed files are moved to `processed/` directory
- Vector embeddings are stored in Supabase with pgvector
- Content chunks are 120-220 tokens with 60-token overlap
- Rate limiting uses Redis for production deployments

For additional technical details, see the main [README.md](README.md).