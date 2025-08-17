# User Data Management API Documentation

## Overview

The User Data Management API provides safe, validated editing of ScottGPT's resume data with real-time updates to the chat system. It includes comprehensive validation, automated data processing, and embedding regeneration for content changes.

## Base URL
```
http://localhost:3001/api/user
```

## Authentication
Currently, the API uses rate limiting for protection. Authentication may be added in future versions.

## Rate Limiting

| Endpoint Type | Limit | Window | Notes |
|---------------|-------|--------|-------|
| General | 20 requests | 5 minutes | Read operations |
| Updates | 20 requests | 5 minutes | PUT operations |
| Deletions | 5 requests | 1 hour | DELETE operations |

## API Endpoints

### 1. Get Work History

**Endpoint:** `GET /api/user/work-history`

Returns a chronological list of all jobs with summary information and analytics.

#### Response Structure
```json
{
  "success": true,
  "data": {
    "jobs": [
      {
        "id": 1,
        "title": "Operations Manager - OLDP Program",
        "org": "Lockheed Martin",
        "date_start": "2001-06-01",
        "date_end": "2005-05-31",
        "location": "Fort Worth, TX",
        "chunkCount": 5,
        "skillsCount": 8,
        "skills": ["Leadership", "Project Management", "Operations"],
        "duration": 47
      }
    ],
    "analytics": {
      "totalJobs": 15,
      "totalDurationMonths": 240,
      "averageDurationMonths": 16,
      "topSkills": [
        { "skill": "JavaScript", "count": 8 },
        { "skill": "Leadership", "count": 6 }
      ],
      "organizations": 12
    }
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

#### Example Request
```bash
curl -X GET http://localhost:3001/api/user/work-history \
  -H "Content-Type: application/json"
```

---

### 2. Get Source Details

**Endpoint:** `GET /api/user/sources/:id`

Returns detailed view of a specific job including skills, chunks, and validation status.

#### Parameters
- `id` (path parameter): Source ID (integer)

#### Response Structure
```json
{
  "success": true,
  "data": {
    "source": {
      "id": 1,
      "title": "Operations Manager - OLDP Program",
      "org": "Lockheed Martin",
      "date_start": "2001-06-01",
      "date_end": "2005-05-31",
      "description": "Participated in Lockheed Martin's Operations Leadership Development Program...",
      "skills": ["Leadership", "Project Management", "Operations"],
      "location": "Fort Worth, TX",
      "duration_months": 47,
      "skill_categories": {
        "Management Skills": ["Leadership", "Project Management"],
        "Other": ["Operations"]
      }
    },
    "chunks": [
      {
        "id": 101,
        "title": "OLDP Program Overview",
        "content": "The Operations Leadership Development Program...",
        "skills": ["Leadership", "Operations"],
        "embedding": [0.1, 0.2, ...], // 1024-dimensional array
        "created_at": "2025-01-01T00:00:00.000Z"
      }
    ],
    "skillAnalysis": {
      "Management Skills": ["Leadership", "Project Management"],
      "Other": ["Operations"]
    },
    "metrics": {
      "totalChunks": 5,
      "totalCharacters": 2847,
      "averageChunkSize": 569,
      "hasEmbeddings": 5,
      "embeddingCoverage": 100
    },
    "validation": {
      "isValid": true,
      "errors": [],
      "warnings": []
    }
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

#### Example Request
```bash
curl -X GET http://localhost:3001/api/user/sources/1 \
  -H "Content-Type: application/json"
```

#### Error Responses
- `400`: Invalid source ID
- `404`: Source not found
- `500`: Internal server error

---

### 3. Update Source

**Endpoint:** `PUT /api/user/sources/:id`

Updates job details with comprehensive validation and automatic embedding regeneration.

#### Parameters
- `id` (path parameter): Source ID (integer)

#### Request Body
```json
{
  "title": "Senior Operations Manager - OLDP Program",
  "org": "Lockheed Martin",
  "date_start": "2001-06-01",
  "date_end": "2005-05-31",
  "description": "Led operational excellence initiatives as part of the prestigious OLDP program...",
  "skills": ["Leadership", "Project Management", "Operations", "Process Improvement"],
  "location": "Fort Worth, TX"
}
```

#### Validation Rules

**Hard Validation (Reject Request):**
- `title` and `org` are required
- `date_start` is required and must be valid YYYY-MM-DD format
- `date_end` must be after `date_start` (if provided)
- Start date cannot be more than 6 months in future
- Start date cannot be more than 60 years in past
- Text fields must not exceed maximum lengths:
  - `title`: 200 characters
  - `org`: 150 characters
  - `description`: 5000 characters
  - `location`: 100 characters
- `skills` must be array of strings (max 50 chars each)
- Employment duration must be at least 1 day

**Soft Validation (Warnings Only):**
- Date overlaps with other positions
- Very short duration (< 1 month)
- Very long duration (> 20 years)
- Many skills (> 20)
- Few skills for long positions (< 3 skills for > 1 year)
- Missing or short description (< 50 characters)
- Missing location
- ALL CAPS text
- Duplicate skills

#### Response Structure
```json
{
  "success": true,
  "data": {
    "source": {
      "id": 1,
      "title": "Senior Operations Manager - OLDP Program",
      // ... updated source data
    },
    "validation": {
      "isValid": true,
      "errors": [],
      "warnings": [
        {
          "field": "skills",
          "code": "MANY_SKILLS",
          "message": "25 skills listed - consider consolidating related skills",
          "severity": "info"
        }
      ]
    },
    "embeddingResults": {
      "regenerated": true,
      "affectedChunks": 5,
      "totalChunks": 5,
      "success": true
    },
    "changes": {
      "contentChanged": true,
      "updatedFields": ["title", "skills"],
      "previousValues": {
        "title": "Operations Manager - OLDP Program",
        "skills": ["Leadership", "Project Management", "Operations"]
      }
    }
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

#### Example Request
```bash
curl -X PUT http://localhost:3001/api/user/sources/1 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Senior Operations Manager - OLDP Program",
    "skills": ["Leadership", "Project Management", "Operations", "Process Improvement"]
  }'
```

#### Error Responses
- `400`: Validation failed (see validation object in response)
- `404`: Source not found
- `500`: Internal server error

---

### 4. Delete Source

**Endpoint:** `DELETE /api/user/sources/:id`

Removes a job source and all related chunks with confirmation requirement.

#### Parameters
- `id` (path parameter): Source ID (integer)
- `confirm` (query parameter): Must be "true" to confirm deletion

#### Response Structure
```json
{
  "success": true,
  "data": {
    "deletedSource": {
      "id": 1,
      "title": "Operations Manager - OLDP Program",
      "org": "Lockheed Martin",
      "dateRange": "2001-06-01 to 2005-05-31"
    },
    "impact": {
      "deletedChunks": 5,
      "embeddingsRemoved": 5
    }
  },
  "message": "Job source and all related data deleted successfully",
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

#### Example Request
```bash
curl -X DELETE "http://localhost:3001/api/user/sources/1?confirm=true" \
  -H "Content-Type: application/json"
```

#### Error Responses
- `400`: Invalid ID or missing confirmation
- `404`: Source not found
- `500`: Internal server error

---

### 5. Find Duplicates

**Endpoint:** `GET /api/user/duplicates`

Analyzes all job sources to find potential duplicates and similar entries.

#### Response Structure
```json
{
  "success": true,
  "data": {
    "duplicates": [
      {
        "type": "potential_duplicate",
        "jobs": [
          {
            "index": 0,
            "job": { /* job data */ },
            "chunkCount": 5
          },
          {
            "index": 15,
            "job": { /* similar job data */ },
            "chunkCount": 3
          }
        ],
        "similarity": 0.95,
        "signature": "software engineer|tech company|2020-01-01",
        "recommendations": [
          {
            "action": "merge",
            "priority": "high",
            "message": "Very high similarity - consider merging entries",
            "automated": false
          }
        ]
      },
      {
        "type": "similar_entry",
        "jobs": [/* similar jobs */],
        "similarity": 0.75,
        "reasons": ["Same organization", "Overlapping employment dates"]
      }
    ],
    "summary": {
      "totalJobs": 20,
      "duplicateGroups": 3,
      "potentialDuplicates": 1,
      "similarEntries": 2,
      "highConfidenceDuplicates": 1
    },
    "recommendations": {
      "requiresReview": 2,
      "autoMergeable": 1,
      "needsManualCheck": 1
    }
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

#### Duplicate Detection Criteria

**Similarity Factors:**
- Title similarity (40% weight)
- Organization similarity (30% weight)
- Date overlap (20% weight)
- Skills similarity (10% weight)

**Similarity Thresholds:**
- > 0.95: Auto-mergeable (high confidence duplicate)
- > 0.8: Requires review (likely duplicate)
- > 0.7: Manual check needed (similar entry)

#### Example Request
```bash
curl -X GET http://localhost:3001/api/user/duplicates \
  -H "Content-Type: application/json"
```

---

## Data Processing Features

### Skills Normalization

The API automatically normalizes skills using a comprehensive mapping:

```javascript
// Example normalizations
"javascript" → "JavaScript"
"nodejs" → "Node.js"
"ai", "ml" → "AI/ML"
"aws" → "AWS"
"k8s" → "Kubernetes"
```

### Skills Categorization

Skills are automatically categorized:

- **Programming Languages**: JavaScript, Python, Java, etc.
- **Frontend Frameworks**: React, Vue.js, Angular, etc.
- **Cloud Platforms**: AWS, Microsoft Azure, Google Cloud Platform
- **DevOps Tools**: Docker, Kubernetes, Jenkins, etc.
- **Management Skills**: Leadership, Project Management, etc.
- **AI/ML Frameworks**: TensorFlow, PyTorch, etc.

### Embedding Regeneration

When content changes (title, description, or skills), the API automatically:

1. Identifies affected content chunks
2. Generates new embeddings using Cohere API
3. Updates chunk embeddings in the database
4. Maintains embedding consistency across the system

## Error Handling

### Standard Error Response Format
```json
{
  "error": "Validation failed",
  "message": "The update contains validation errors that must be fixed",
  "validation": {
    "isValid": false,
    "errors": [
      {
        "field": "date_start",
        "code": "INVALID_DATE_FORMAT",
        "message": "Start date must be in YYYY-MM-DD format",
        "severity": "critical"
      }
    ],
    "warnings": []
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

### Error Codes

**Validation Errors:**
- `REQUIRED_FIELD`: Missing required field
- `INVALID_DATE_FORMAT`: Invalid date format
- `INVALID_DATE_RANGE`: End date before start date
- `FUTURE_DATE`: Date too far in future
- `HISTORICAL_DATE`: Date too far in past
- `INVALID_TYPE`: Wrong data type
- `MAX_LENGTH_EXCEEDED`: Field too long
- `INVALID_DURATION`: Employment duration too short

**Warning Codes:**
- `DATE_OVERLAP`: Overlapping employment dates
- `EMPLOYMENT_GAP`: Gap in employment timeline
- `SHORT_DURATION`: Very short employment
- `LONG_DURATION`: Very long employment
- `MANY_SKILLS`: Too many skills listed
- `FEW_SKILLS`: Too few skills for long position
- `SHORT_DESCRIPTION`: Description too short
- `MISSING_LOCATION`: Location not specified
- `ALL_CAPS`: Text in all caps
- `DUPLICATE_SKILLS`: Duplicate skills detected

## Best Practices

### 1. Validation Strategy
- Always handle both `errors` and `warnings` in responses
- Critical errors prevent saving, warnings allow saving with notifications
- Use warnings to guide users toward better data quality

### 2. Embedding Management
- Content changes automatically trigger embedding regeneration
- Non-content changes (like location) don't affect embeddings
- Monitor `embeddingResults` to ensure successful regeneration

### 3. Duplicate Detection
- Run duplicate detection periodically
- Review high-similarity duplicates (> 0.8) manually
- Use recommendations to guide merge/keep decisions

### 4. Error Handling
- Implement retry logic for 500 errors
- Respect rate limits (429 errors)
- Validate data client-side before submission

### 5. Performance
- Batch operations when possible
- Monitor embedding regeneration times
- Consider caching for read-heavy operations

## Testing

### Unit Tests
```bash
npm run test:unit -- tests/unit/data-validation.test.js
npm run test:unit -- tests/unit/data-processing.test.js
```

### Integration Tests
```bash
npm run test:e2e -- tests/e2e/user-data-api.test.js
```

### Manual Testing Script
```bash
# Test work history endpoint
curl -X GET http://localhost:3001/api/user/work-history

# Test source details
curl -X GET http://localhost:3001/api/user/sources/1

# Test update with validation
curl -X PUT http://localhost:3001/api/user/sources/1 \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated Title"}'

# Test duplicate detection
curl -X GET http://localhost:3001/api/user/duplicates
```

## Security Considerations

### Rate Limiting
- Prevents abuse and ensures system stability
- Different limits for read vs. write operations
- Stricter limits on destructive operations (delete)

### Input Validation
- Comprehensive server-side validation
- SQL injection prevention through parameterized queries
- XSS prevention through input sanitization

### Data Integrity
- Transaction-safe operations
- Referential integrity maintained during updates
- Embedding consistency across related chunks

### Logging
- All operations logged with user IP and details
- Error logging with stack traces for debugging
- Performance metrics for monitoring

## Monitoring

### Key Metrics to Monitor
- API response times (target: < 2 seconds)
- Embedding regeneration success rate (target: > 95%)
- Validation error rates
- Duplicate detection accuracy

### Log Files
- `logs/user-data-api.log`: API operations and errors
- `logs/data-validation.log`: Validation results
- `logs/data-processing.log`: Processing operations

## Future Enhancements

### Planned Features
- Bulk import/export functionality
- Version history for job entries
- Advanced analytics and reporting
- Real-time collaboration features
- Integration with external resume services

### Performance Optimizations
- Caching layer for read operations
- Async embedding regeneration
- Bulk embedding updates
- Database query optimization