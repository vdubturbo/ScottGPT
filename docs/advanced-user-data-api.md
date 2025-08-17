# Advanced User Data Management API Documentation

## Overview

The Advanced User Data Management API extends the basic user data API with powerful bulk operations, smart data enhancement, and system management features. This API provides AI-powered suggestions, bulk data operations with transaction safety, and comprehensive data quality management.

## Base URL
```
http://localhost:3001/api/user
```

## Authentication
Rate limiting is applied with different limits for different operation types. See rate limiting section below.

## Rate Limiting

| Operation Type | Limit | Window | Notes |
|----------------|-------|--------|-------|
| Bulk Operations | 5 requests | 10 minutes | Preview, execute, update-skills, fix-dates, merge-duplicates |
| Smart Enhancement | 20 requests | 5 minutes | Gaps analysis, skill suggestions, validation |
| System Operations | 3 requests | 30 minutes | Regenerate embeddings, data quality reports |

---

## Bulk Operations Endpoints

### 1. Preview Bulk Operation

**Endpoint:** `POST /api/user/bulk/preview`

Preview the effects of a bulk operation before execution.

#### Request Body
```json
{
  "operationType": "update-skills",
  "params": {
    "jobIds": [1, 2, 3],
    "operation": "add",
    "skills": ["New Skill 1", "New Skill 2"]
  }
}
```

#### Response Structure
```json
{
  "success": true,
  "data": {
    "operationType": "update-skills",
    "preview": {
      "affectedJobs": 3,
      "changes": [
        {
          "jobId": 1,
          "title": "Software Engineer",
          "org": "Tech Company",
          "before": ["JavaScript", "React"],
          "after": ["JavaScript", "React", "New Skill 1", "New Skill 2"],
          "added": ["New Skill 1", "New Skill 2"],
          "removed": []
        }
      ],
      "estimatedEmbeddingUpdates": 3,
      "estimatedDuration": 6
    },
    "estimatedDuration": "6 seconds",
    "risks": [],
    "canProceed": true
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

### 2. Execute Bulk Operation

**Endpoint:** `POST /api/user/bulk/execute`

Execute a bulk operation with full transaction safety and rollback capabilities.

#### Request Body
```json
{
  "operationType": "update-skills",
  "params": {
    "jobIds": [1, 2, 3],
    "operation": "add",
    "skills": ["TypeScript", "GraphQL"]
  },
  "preview": false
}
```

#### Response Structure
```json
{
  "success": true,
  "data": {
    "operationId": "uuid-operation-id",
    "status": "started",
    "message": "Bulk operation started successfully",
    "statusUrl": "/api/user/bulk/status/uuid-operation-id"
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

### 3. Check Operation Status

**Endpoint:** `GET /api/user/bulk/status/:operationId`

Monitor the progress and results of a running bulk operation.

#### Response Structure
```json
{
  "success": true,
  "data": {
    "id": "uuid-operation-id",
    "type": "update-skills",
    "status": "completed",
    "progress": 100,
    "results": {
      "processed": 3,
      "successful": 3,
      "failed": 0,
      "errors": [],
      "changes": [
        {
          "jobId": 1,
          "type": "skills_update",
          "skillsAdded": ["TypeScript", "GraphQL"],
          "skillsRemoved": []
        }
      ]
    },
    "startTime": "2025-08-17T10:30:00.000Z",
    "duration": 4500
  },
  "timestamp": "2025-08-17T10:30:30.000Z"
}
```

### 4. Bulk Skills Update

**Endpoint:** `POST /api/user/bulk/update-skills`

Perform bulk skills operations across multiple jobs.

#### Request Body
```json
{
  "jobIds": [1, 2, 3],
  "operation": "add",
  "skills": ["Docker", "Kubernetes"],
  "preview": false
}
```

#### Operations Supported
- `add`: Add skills to existing skill sets
- `remove`: Remove specific skills from job entries
- `replace`: Replace entire skill set with new skills
- `normalize`: Standardize skill names using built-in mappings

### 5. Bulk Date Fixes

**Endpoint:** `POST /api/user/bulk/fix-dates`

Batch correction of employment dates with conflict detection.

#### Request Body
```json
{
  "fixes": [
    {
      "jobId": 1,
      "date_start": "2020-01-15",
      "date_end": "2022-01-15"
    },
    {
      "jobId": 2,
      "date_start": "2022-02-01"
    }
  ],
  "preview": false
}
```

### 6. Bulk Duplicate Merge

**Endpoint:** `POST /api/user/bulk/merge-duplicates`

Intelligently merge duplicate job entries with rollback safety.

#### Request Body
```json
{
  "mergeGroups": [
    {
      "primaryJobId": 1,
      "duplicateJobIds": [2, 3],
      "mergeStrategy": "merge_comprehensive"
    }
  ],
  "preview": false
}
```

#### Merge Strategies
- `keep_primary`: Keep primary job data, merge only skills
- `merge_comprehensive`: Intelligent merge of all data fields
- `prefer_recent`: Use data from most recent job entry

### 7. Cancel Operation

**Endpoint:** `DELETE /api/user/bulk/cancel/:operationId`

Cancel a running bulk operation and rollback any completed changes.

---

## Smart Data Enhancement Endpoints

### 1. Timeline Gap Analysis

**Endpoint:** `GET /api/user/gaps`

Identify employment gaps and overlaps with enhancement suggestions.

#### Response Structure
```json
{
  "success": true,
  "data": {
    "gaps": [
      {
        "start": "2020-06-01",
        "end": "2021-01-01",
        "durationDays": 214,
        "durationMonths": 7,
        "beforeJob": {
          "id": 1,
          "title": "Junior Developer",
          "org": "Startup Co"
        },
        "afterJob": {
          "id": 2,
          "title": "Senior Developer",
          "org": "Big Corp"
        },
        "severity": "medium",
        "suggestions": [
          {
            "type": "education",
            "activity": "Formal Education",
            "description": "Consider adding any degrees, certifications, or courses completed during this period",
            "priority": "medium"
          },
          {
            "type": "freelance",
            "activity": "Freelance/Consulting Work",
            "description": "Add any independent projects, consulting, or contract work",
            "priority": "medium"
          }
        ]
      }
    ],
    "overlaps": [],
    "impact": {
      "level": "medium",
      "totalGapMonths": 7,
      "maxGapMonths": 7,
      "gapCount": 1,
      "narrativeImpact": "Recent significant gaps may require explanation"
    },
    "recommendations": [
      {
        "priority": "medium",
        "action": "Explain recent gaps",
        "details": "Provide context for gaps in the last 2 years",
        "impact": "Addresses potential recruiter concerns"
      }
    ],
    "summary": {
      "totalGaps": 1,
      "totalGapMonths": 7,
      "criticalGaps": 0,
      "averageGapMonths": 7
    }
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

### 2. AI-Powered Skill Suggestions

**Endpoint:** `POST /api/user/suggest-skills`

Generate intelligent skill suggestions using AI analysis.

#### Request Body (Option 1 - Existing Job)
```json
{
  "jobId": 1,
  "options": {
    "includeAI": true,
    "maxSuggestions": 10,
    "confidenceThreshold": 0.7
  }
}
```

#### Request Body (Option 2 - Job Data)
```json
{
  "jobData": {
    "title": "Full Stack Developer",
    "org": "Tech Startup",
    "description": "Building modern web applications using React and Node.js...",
    "skills": ["JavaScript", "React"]
  },
  "options": {
    "includeAI": true,
    "maxSuggestions": 15
  }
}
```

#### Response Structure
```json
{
  "success": true,
  "data": {
    "job": {
      "id": 1,
      "title": "Full Stack Developer",
      "org": "Tech Startup",
      "currentSkills": ["JavaScript", "React"]
    },
    "suggestions": [
      {
        "skill": "Node.js",
        "confidence": 0.92,
        "source": "ai",
        "reasoning": "Commonly used backend framework for full stack developers",
        "category": "Backend Framework"
      },
      {
        "skill": "TypeScript",
        "confidence": 0.85,
        "source": "ai",
        "reasoning": "Type-safe JavaScript for large applications",
        "category": "Programming Language"
      },
      {
        "skill": "Express.js",
        "confidence": 0.78,
        "source": "industry",
        "reasoning": "Common skill in software industry",
        "category": "Backend Framework"
      }
    ],
    "categorized": {
      "Programming Languages": ["TypeScript"],
      "Backend Frameworks": ["Node.js", "Express.js"],
      "Frontend Frameworks": ["Vue.js"],
      "DevOps Tools": ["Docker"],
      "Cloud Platforms": ["AWS"]
    },
    "analysis": {
      "currentSkillsCount": 2,
      "suggestedSkillsCount": 8,
      "confidence": 0.83,
      "sources": {
        "ai": 5,
        "ruleBased": 3
      }
    },
    "recommendations": [
      {
        "type": "high_confidence",
        "priority": "high",
        "message": "5 highly relevant skills identified",
        "skills": ["Node.js", "TypeScript", "Express.js", "MongoDB", "Docker"]
      }
    ]
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

### 3. Comprehensive Data Validation

**Endpoint:** `POST /api/user/validate`

Generate detailed data quality report with enhancement suggestions.

#### Request Body
```json
{
  "includeEnhancements": true
}
```

#### Response Structure
```json
{
  "success": true,
  "data": {
    "overall": {
      "score": 0.78,
      "grade": "Good",
      "issues": [
        {
          "severity": "warning",
          "category": "duplicates",
          "message": "2 potential duplicate entries detected"
        }
      ],
      "recommendations": [
        {
          "priority": "medium",
          "category": "quality",
          "action": "Improve data quality for 3 job entries",
          "details": "Focus on expanding descriptions and adding missing skills"
        }
      ]
    },
    "jobs": [
      {
        "index": 0,
        "id": 1,
        "title": "Software Engineer",
        "org": "Tech Company",
        "validation": {
          "isValid": true,
          "errors": [],
          "warnings": []
        },
        "quality": {
          "score": 0.85,
          "grade": "Good",
          "scores": {
            "description": 0.8,
            "skills": 0.9,
            "duration": 1.0,
            "completeness": 0.8,
            "consistency": 0.9
          },
          "issues": [],
          "recommendations": []
        }
      }
    ],
    "enhancements": {
      "skills": [
        {
          "jobId": 2,
          "title": "Backend Developer",
          "currentSkillsCount": 2,
          "suggestions": [
            {
              "skill": "Docker",
              "confidence": 0.85,
              "reasoning": "Container technology for deployment"
            }
          ]
        }
      ],
      "descriptions": [
        {
          "jobId": 3,
          "title": "Frontend Developer",
          "currentLength": 45,
          "suggestions": [
            "Add specific achievements and metrics",
            "Include key responsibilities and technologies used",
            "Describe the impact and scope of your work"
          ]
        }
      ]
    },
    "improvementPotential": {
      "current": 78,
      "potential": 92,
      "improvement": 14,
      "grade": "Excellent"
    },
    "actionPlan": [
      {
        "priority": 1,
        "category": "Skills Enhancement",
        "action": "Add suggested skills to 2 positions",
        "impact": "medium",
        "estimatedTime": "10 minutes"
      }
    ]
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

---

## System Operations Endpoints

### 1. Regenerate All Embeddings

**Endpoint:** `POST /api/user/regenerate-all-embeddings`

Refresh the entire search index with new embeddings.

#### Request Body
```json
{
  "batchSize": 10,
  "skipValidation": false
}
```

#### Response Structure
```json
{
  "success": true,
  "data": {
    "operationId": "uuid-operation-id",
    "status": "completed",
    "duration": 45,
    "results": {
      "totalChunks": 150,
      "processed": 150,
      "successful": 148,
      "failed": 2,
      "successRate": 99,
      "errors": [
        {
          "success": false,
          "chunkId": 123,
          "error": "Failed to generate embedding"
        }
      ]
    }
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

### 2. Data Quality Report

**Endpoint:** `GET /api/user/data-quality`

Generate comprehensive data health metrics and recommendations.

#### Response Structure
```json
{
  "success": true,
  "data": {
    "healthMetrics": {
      "jobs": {
        "total": 20,
        "withDescriptions": 18,
        "withSkills": 19,
        "withLocations": 15,
        "recentJobs": 8
      },
      "embeddings": {
        "totalChunks": 95,
        "coverage": 5
      }
    },
    "completenessScore": 85,
    "qualitySummary": {
      "overallScore": 78,
      "grade": "Good",
      "criticalIssues": 0,
      "warnings": 3,
      "excellentJobs": 5,
      "poorJobs": 2
    },
    "recommendations": [
      {
        "priority": "medium",
        "category": "quality",
        "action": "Improve data quality for 2 job entries",
        "details": "Focus on expanding descriptions and adding missing skills"
      },
      {
        "priority": "low",
        "category": "skills",
        "action": "Normalize 5 inconsistent skill names",
        "details": "Standardize skill naming for better consistency"
      }
    ],
    "lastUpdated": "2025-08-17T10:30:00.000Z"
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

---

## Advanced Features

### AI-Powered Skill Suggestions

The system uses OpenAI GPT-4 to analyze job descriptions and suggest relevant skills:

- **Context Analysis**: Considers job title, company, industry, and description
- **Industry Mapping**: Uses predefined skill mappings for different industries
- **Confidence Scoring**: AI suggestions are capped at 95% confidence for safety
- **Fallback Support**: Rule-based suggestions when AI is unavailable
- **Skill Normalization**: Automatic standardization of skill names

### Transaction Safety

All bulk operations include comprehensive rollback capabilities:

- **Operation Tracking**: Each operation gets unique ID and status tracking
- **Rollback Data**: Original data stored before any changes
- **Automatic Rollback**: Failed operations automatically trigger rollback
- **Manual Cancellation**: Operations can be cancelled with rollback
- **Progress Monitoring**: Real-time progress updates and status

### Quality Scoring System

Advanced content quality analysis with weighted scoring:

- **Description Quality** (30%): Length, action verbs, metrics, structure
- **Skills Quality** (25%): Quantity, diversity, categorization
- **Duration Appropriateness** (20%): Optimal employment duration scoring
- **Data Completeness** (15%): Presence of required and optional fields
- **Consistency** (10%): Formatting, casing, and data integrity

### Smart Enhancement Features

- **Gap Analysis**: Timeline gap identification with contextual suggestions
- **Duplicate Detection**: Advanced similarity analysis with merge recommendations
- **Skills Normalization**: Automatic standardization using comprehensive mapping
- **Industry Context**: Role and seniority-based enhancement suggestions

---

## Error Handling

### Bulk Operation Errors

```json
{
  "error": "Bulk operation failed",
  "message": "Operation failed during execution",
  "operationId": "uuid-operation-id",
  "rollbackStatus": "completed",
  "partialResults": {
    "processed": 5,
    "successful": 3,
    "failed": 2,
    "errors": [
      {
        "jobId": 4,
        "error": "Job not found"
      }
    ]
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

### Rate Limiting Response

```json
{
  "error": "Too many bulk operations, please try again later",
  "retryAfter": 600,
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

---

## Best Practices

### 1. Bulk Operations
- Always preview operations before execution
- Monitor operation status for long-running tasks
- Use appropriate batch sizes for large datasets
- Plan operations during low-traffic periods

### 2. AI Skill Suggestions
- Provide detailed job descriptions for better suggestions
- Review AI suggestions before applying
- Combine with rule-based suggestions for completeness
- Set appropriate confidence thresholds

### 3. Data Quality Management
- Run regular quality reports
- Address critical issues immediately
- Use bulk operations for systematic improvements
- Monitor embedding regeneration success rates

### 4. Performance Optimization
- Use batch operations for multiple changes
- Regenerate embeddings during off-peak hours
- Monitor operation duration and adjust batch sizes
- Cache quality reports for dashboard use

---

## Example Workflows

### Workflow 1: Skills Enhancement

```bash
# 1. Get skill suggestions for a job
curl -X POST http://localhost:3001/api/user/suggest-skills \
  -H "Content-Type: application/json" \
  -d '{"jobId": 1}'

# 2. Preview bulk skills update
curl -X POST http://localhost:3001/api/user/bulk/preview \
  -H "Content-Type: application/json" \
  -d '{
    "operationType": "update-skills",
    "params": {
      "jobIds": [1, 2, 3],
      "operation": "add",
      "skills": ["Docker", "Kubernetes"]
    }
  }'

# 3. Execute bulk update
curl -X POST http://localhost:3001/api/user/bulk/update-skills \
  -H "Content-Type: application/json" \
  -d '{
    "jobIds": [1, 2, 3],
    "operation": "add",
    "skills": ["Docker", "Kubernetes"]
  }'
```

### Workflow 2: Data Quality Improvement

```bash
# 1. Generate quality report
curl -X GET http://localhost:3001/api/user/data-quality

# 2. Get comprehensive validation
curl -X POST http://localhost:3001/api/user/validate \
  -H "Content-Type: application/json" \
  -d '{"includeEnhancements": true}'

# 3. Identify timeline gaps
curl -X GET http://localhost:3001/api/user/gaps

# 4. Execute improvements based on recommendations
```

### Workflow 3: Duplicate Management

```bash
# 1. Get duplicates from basic API
curl -X GET http://localhost:3001/api/user/duplicates

# 2. Preview merge operation
curl -X POST http://localhost:3001/api/user/bulk/preview \
  -H "Content-Type: application/json" \
  -d '{
    "operationType": "merge-duplicates",
    "params": {
      "mergeGroups": [{
        "primaryJobId": 1,
        "duplicateJobIds": [2],
        "mergeStrategy": "merge_comprehensive"
      }]
    }
  }'

# 3. Execute merge
curl -X POST http://localhost:3001/api/user/bulk/merge-duplicates \
  -H "Content-Type: application/json" \
  -d '{
    "mergeGroups": [{
      "primaryJobId": 1,
      "duplicateJobIds": [2],
      "mergeStrategy": "merge_comprehensive"
    }]
  }'
```

---

## Security Considerations

### Rate Limiting Strategy
- Bulk operations: Heavily limited to prevent system overload
- Enhancement operations: Moderate limits for AI API cost control
- System operations: Strict limits for infrastructure protection

### Transaction Safety
- All operations are atomic - either fully succeed or fully rollback
- Rollback data preserved for operation duration
- Operation cancellation available for long-running tasks

### Input Validation
- Comprehensive parameter validation for all endpoints
- SQL injection prevention through parameterized queries
- AI prompt injection protection in skill suggestions

### Monitoring and Logging
- All operations logged with full context
- Performance metrics tracked for optimization
- Error rates monitored for system health
- AI usage tracked for cost management

---

## Future Enhancements

### Planned Features
- **Real-time Collaboration**: Multiple users editing with conflict resolution
- **Advanced Analytics**: Detailed insights and trend analysis
- **ML Model Training**: Custom models for better skill suggestions
- **Integration APIs**: External resume platforms and job boards
- **Workflow Automation**: Scheduled quality improvements and maintenance

### Performance Optimizations
- **Async Processing**: Background operations for large datasets
- **Caching Layer**: Redis cache for frequently accessed data
- **Database Optimization**: Advanced indexing and query optimization
- **CDN Integration**: Static asset delivery optimization