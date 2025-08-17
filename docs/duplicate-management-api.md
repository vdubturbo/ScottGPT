# Intelligent Duplicate Detection and Merging API Documentation

## Overview

The Intelligent Duplicate Detection and Merging API provides advanced capabilities for identifying and consolidating duplicate job entries in ScottGPT. This system uses sophisticated algorithms including fuzzy matching, confidence scoring, and smart field-specific merging strategies to help users maintain clean, accurate work history data.

## Key Features

- **Advanced Duplicate Detection**: Fuzzy matching with configurable similarity thresholds
- **Smart Merging**: Field-specific strategies for optimal data consolidation
- **Transaction Safety**: Full rollback capabilities with undo support
- **Confidence Scoring**: AI-powered confidence assessment for merge decisions
- **Preview Mode**: See merge results before committing changes
- **Bulk Operations**: Auto-merge high-confidence duplicates in batch
- **Data Lineage**: Complete audit trail for all merge operations

## Base URL
```
http://localhost:3001/api/user/duplicates
```

## Rate Limiting

| Operation Type | Limit | Window | Notes |
|----------------|-------|--------|-------|
| Detection | 10 requests | 5 minutes | Duplicate analysis operations |
| Merge Operations | 20 requests | 10 minutes | Preview and execute merges |
| Auto-Merge | 5 requests | 30 minutes | Bulk auto-merge operations |

---

## Duplicate Detection Endpoints

### 1. Comprehensive Duplicate Detection

**Endpoint:** `GET /api/user/duplicates/detect`

Performs intelligent duplicate detection across all job entries using multiple similarity factors.

#### Query Parameters
```
threshold=0.7          # Similarity threshold (0-1, default: 0.7)
includePreview=false   # Include merge previews (default: false) 
groupBy=similarity     # Group results by: similarity, confidence, type
```

#### Response Structure
```json
{
  "success": true,
  "data": {
    "duplicateGroups": [
      {
        "type": "exact_duplicate",
        "primaryJob": {
          "index": 0,
          "job": {
            "id": 1,
            "title": "Software Engineer",
            "org": "Tech Corp",
            "date_start": "2020-01-01",
            "date_end": "2021-01-01"
          },
          "chunkCount": 5
        },
        "duplicates": [
          {
            "index": 15,
            "job": {
              "id": 16,
              "title": "Senior Software Engineer", 
              "org": "Tech Corp",
              "date_start": "2020-01-01",
              "date_end": "2021-01-01"
            },
            "similarity": {
              "company": 1.0,
              "title": 0.9,
              "dates": 1.0,
              "content": 0.85,
              "skills": 0.8,
              "overall": 0.92,
              "breakdown": [
                {
                  "category": "company",
                  "score": 1.0,
                  "weight": 0.35,
                  "contribution": 0.35
                }
              ]
            },
            "confidence": {
              "score": 0.95,
              "level": "very_high",
              "reasons": [
                "Same company",
                "Similar job title", 
                "Overlapping dates",
                "Similar job description"
              ],
              "autoMergeable": true
            },
            "chunkCount": 3
          }
        ],
        "groupSimilarity": 0.92,
        "mergeRecommendation": {
          "strategy": "auto_merge",
          "confidence": "high",
          "actions": [
            {
              "action": "merge",
              "target": 16,
              "reason": "Very high similarity (92%) - safe to auto-merge",
              "priority": "high"
            }
          ],
          "estimatedTimesSaved": "2 minutes"
        },
        "riskFactors": []
      }
    ],
    "summary": {
      "totalJobs": 20,
      "duplicateGroups": 3,
      "totalDuplicates": 5,
      "exactDuplicates": 1,
      "nearDuplicates": 1,
      "possibleDuplicates": 1,
      "autoMergeable": 2,
      "requiresReview": 2,
      "investigationNeeded": 1,
      "potentialTimeSavings": "6 minutes"
    },
    "recommendations": [
      {
        "type": "auto_merge",
        "priority": "high",
        "count": 2,
        "message": "2 duplicates can be safely auto-merged",
        "action": "Use bulk auto-merge to clean up obvious duplicates",
        "estimatedTime": "1 minutes saved"
      }
    ]
  },
  "metadata": {
    "detectionThreshold": 0.7,
    "includePreview": false,
    "groupBy": "similarity",
    "processingTime": 1250
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

#### Similarity Calculation

The system uses weighted similarity scoring across multiple factors:

- **Company Similarity (35%)**: Fuzzy matching with abbreviation handling
- **Title Similarity (25%)**: Handles seniority variations and role progressions  
- **Date Overlap (20%)**: Calculates temporal overlap between positions
- **Content Similarity (15%)**: Uses embeddings for description comparison
- **Skills Similarity (5%)**: Jaccard similarity of normalized skill sets

#### Example Request
```bash
curl -X GET "http://localhost:3001/api/user/duplicates/detect?threshold=0.8&includePreview=true" \
  -H "Content-Type: application/json"
```

### 2. Quick Duplicate Summary

**Endpoint:** `GET /api/user/duplicates/summary`

Fast overview of duplicate status without full analysis.

#### Response Structure
```json
{
  "success": true,
  "data": {
    "totalJobs": 20,
    "estimatedDuplicates": 3,
    "highConfidenceDuplicates": 1,
    "potentialTimeSavings": "6 minutes",
    "recommendations": [
      {
        "type": "run_full_analysis",
        "message": "3 potential duplicates found - run full analysis for detailed recommendations"
      }
    ],
    "needsFullAnalysis": true
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

---

## Merge Preview and Execution

### 3. Preview Merge Operation

**Endpoint:** `POST /api/user/duplicates/preview-merge`

Preview the result of merging two specific job entries before execution.

#### Request Body
```json
{
  "sourceId": 1,
  "targetId": 2,
  "options": {
    "fieldStrategies": {
      "title": "prefer_detailed",
      "description": "prefer_longest"
    },
    "strategy": "smart_merge"
  }
}
```

#### Response Structure
```json
{
  "success": true,
  "data": {
    "preview": {
      "sourceJob": {
        "id": 1,
        "title": "Software Engineer",
        "org": "Tech Corp",
        "description": "Built web applications",
        "skills": ["JavaScript", "React"],
        "chunkCount": 3
      },
      "targetJob": {
        "id": 2,
        "title": "Senior Software Engineer",
        "org": "Tech Corporation",
        "description": "Led development of scalable web applications",
        "skills": ["JavaScript", "React", "Leadership"],
        "chunkCount": 5
      },
      "mergedResult": {
        "id": 2,
        "title": "Senior Software Engineer",
        "org": "Tech Corporation", 
        "description": "Led development of scalable web applications",
        "skills": ["JavaScript", "React", "Leadership"],
        "date_start": "2020-01-01",
        "date_end": "2021-06-01",
        "merge_source_id": 1,
        "merge_timestamp": "2025-08-17T10:30:00.000Z",
        "merge_strategy": "smart_merge"
      },
      "changes": {
        "changedFields": ["skills", "date_end"],
        "changes": {
          "skills": {
            "from": ["JavaScript", "React"],
            "to": ["JavaScript", "React", "Leadership"], 
            "changeType": "expanded"
          },
          "date_end": {
            "from": "2021-01-01",
            "to": "2021-06-01",
            "changeType": "modified"
          }
        },
        "hasSignificantChanges": false
      },
      "fieldMappings": {
        "title": {
          "source": "Software Engineer",
          "target": "Senior Software Engineer",
          "merged": "Senior Software Engineer",
          "strategy": "prefer_detailed",
          "changed": false,
          "sourceUsed": false
        },
        "skills": {
          "source": ["JavaScript", "React"],
          "target": ["JavaScript", "React"],
          "merged": ["JavaScript", "React", "Leadership"],
          "strategy": "merge_unique", 
          "changed": true,
          "sourceUsed": false
        }
      }
    },
    "analysis": {
      "quality": {
        "score": 0.85,
        "grade": "Good",
        "factors": [
          "Enhanced content detail",
          "Expanded skill set",
          "Optimized date range"
        ]
      },
      "risks": [
        {
          "type": "title_progression",
          "severity": "low",
          "message": "Same company but different titles - may be career progression",
          "details": "Software Engineer vs Senior Software Engineer"
        }
      ],
      "impact": {
        "contentChunks": {
          "current": 5,
          "additional": 3,
          "total": 8
        },
        "embeddingRegeneration": {
          "chunksToUpdate": 5,
          "estimatedTime": "3 seconds"
        },
        "storageImpact": {
          "chunksToDelete": 0,
          "jobsToDelete": 1,
          "netReduction": 1
        },
        "searchImpact": {
          "improvedRecall": "More comprehensive content for search queries",
          "betterContext": "Combined context provides richer search results"
        }
      },
      "recommendations": [
        {
          "type": "proceed",
          "priority": "high", 
          "message": "High-quality merge - safe to proceed",
          "reasoning": "Merge will improve data without significant risks"
        }
      ]
    },
    "operations": {
      "chunksToMerge": 3,
      "chunksToUpdate": 5,
      "embeddingsToRegenerate": 5,
      "estimatedDuration": "5 seconds"
    },
    "reversible": true,
    "mergeId": "uuid-generated-id"
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

### 4. Execute Merge Operation

**Endpoint:** `POST /api/user/duplicates/merge`

Execute the merge operation between two job entries with full transaction safety.

#### Request Body
```json
{
  "sourceId": 1,
  "targetId": 2,
  "options": {
    "strategy": "smart_merge",
    "fieldStrategies": {
      "description": "prefer_longest"
    }
  },
  "confirmed": true
}
```

#### Response Structure
```json
{
  "success": true,
  "data": {
    "mergeId": "uuid-merge-operation-id",
    "status": "completed",
    "result": {
      "mergedJobId": 2,
      "deletedJobId": 1,
      "mergedData": {
        "title": "Senior Software Engineer",
        "org": "Tech Corporation",
        "skills": ["JavaScript", "React", "Leadership"]
      },
      "chunksProcessed": 8,
      "embeddingsRegenerated": 5
    },
    "duration": 4500,
    "undoAvailable": true,
    "undoExpiresAt": "2025-08-18T10:30:00.000Z"
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

### 5. Get Merge Status

**Endpoint:** `GET /api/user/duplicates/merge-status/:mergeId`

Monitor the status of a merge operation.

#### Response Structure
```json
{
  "success": true,
  "data": {
    "id": "uuid-merge-operation-id",
    "status": "completed",
    "sourceId": 1,
    "targetId": 2,
    "startTime": "2025-08-17T10:30:00.000Z",
    "endTime": "2025-08-17T10:30:05.000Z",
    "duration": 5000
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

### 6. Undo Merge Operation

**Endpoint:** `POST /api/user/duplicates/undo-merge`

Reverse a completed merge operation and restore original jobs.

#### Request Body
```json
{
  "mergeId": "uuid-merge-operation-id",
  "confirmed": true
}
```

#### Response Structure
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Merge successfully undone",
    "restoredJobId": 1,
    "revertedJobId": 2
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

---

## Bulk Operations

### 7. Auto-Merge High-Confidence Duplicates

**Endpoint:** `POST /api/user/duplicates/auto-merge`

Automatically merge multiple high-confidence duplicate pairs in a single operation.

#### Request Body
```json
{
  "confidenceThreshold": 0.95,
  "maxMerges": 10,
  "preview": false,
  "confirmed": true
}
```

#### Response Structure (Execution)
```json
{
  "success": true,
  "data": {
    "results": {
      "attempted": 3,
      "successful": 2,
      "failed": 1,
      "merges": [
        {
          "sourceJobId": 5,
          "targetJobId": 3,
          "mergeId": "uuid-merge-1",
          "confidence": 0.96
        },
        {
          "sourceJobId": 8,
          "targetJobId": 7,
          "mergeId": "uuid-merge-2", 
          "confidence": 0.98
        }
      ],
      "errors": [
        {
          "sourceJobId": 12,
          "error": "Job not found"
        }
      ]
    },
    "summary": {
      "duplicatesRemoved": 2,
      "timeSaved": "4 minutes",
      "qualityImproved": true
    }
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

#### Response Structure (Preview)
```json
{
  "success": true,
  "data": {
    "candidateCount": 3,
    "previews": [
      {
        "sourceJob": {
          "id": 5,
          "title": "Software Engineer",
          "org": "Tech Corp"
        },
        "targetJob": {
          "id": 3,
          "title": "Software Engineer",
          "org": "Tech Corp"
        },
        "quality": {
          "score": 0.9,
          "grade": "Excellent"
        },
        "confidence": 0.96
      }
    ],
    "estimatedTimeSavings": "6 minutes",
    "settings": {
      "confidenceThreshold": 0.95,
      "maxMerges": 10
    }
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

### 8. Get Merge Candidates

**Endpoint:** `GET /api/user/duplicates/merge-candidates`

Retrieve a list of potential merge candidates with detailed recommendations.

#### Query Parameters
```
confidenceLevel=all    # Filter by: all, very_high, high, medium, low
includeRisks=true     # Include risk assessment (default: true)
sortBy=confidence     # Sort by: confidence, similarity, risk
```

#### Response Structure
```json
{
  "success": true,
  "data": {
    "candidates": [
      {
        "id": "1_2",
        "sourceJob": {
          "id": 1,
          "title": "Software Engineer",
          "org": "Tech Corp",
          "dateRange": "2020-01-01 to 2021-01-01"
        },
        "targetJob": {
          "id": 2,
          "title": "Senior Software Engineer", 
          "org": "Tech Corp",
          "dateRange": "2020-01-01 to 2021-01-01"
        },
        "similarity": {
          "overall": 0.92,
          "company": 1.0,
          "title": 0.9,
          "dates": 1.0,
          "content": 0.85
        },
        "confidence": {
          "score": 0.95,
          "level": "very_high",
          "reasons": ["Same company", "Similar job title", "Overlapping dates"]
        },
        "recommendation": {
          "strategy": "auto_merge",
          "confidence": "high"
        },
        "risks": [],
        "autoMergeable": true,
        "groupType": "exact_duplicate"
      }
    ],
    "summary": {
      "totalCandidates": 5,
      "autoMergeable": 2,
      "highConfidence": 3,
      "requiresReview": 1
    },
    "filters": {
      "confidenceLevel": "all",
      "includeRisks": true,
      "sortBy": "confidence"
    }
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

---

## Field Merge Strategies

The system uses intelligent field-specific strategies for optimal data consolidation:

### Strategy Types

| Strategy | Description | Use Cases |
|----------|-------------|-----------|
| `prefer_detailed` | Choose longer, more descriptive value | Job titles, descriptions |
| `prefer_complete` | Choose most complete/specific value | Company names, locations |
| `prefer_longest` | Choose longest text value | Descriptions, summaries |
| `merge_unique` | Combine arrays, remove duplicates | Skills, tags |
| `use_earliest` | Choose earliest date | Start dates |
| `use_latest` | Choose latest date (null for current) | End dates |
| `prefer_source` | Always use source value | Custom overrides |
| `prefer_target` | Always use target value | Default behavior |

### Default Field Mappings

```javascript
{
  title: 'prefer_detailed',      // Use longer, more descriptive title
  org: 'prefer_complete',        // Use most complete organization name
  description: 'prefer_longest', // Use longest description
  skills: 'merge_unique',        // Combine and deduplicate skills
  location: 'prefer_complete',   // Use most complete location
  date_start: 'use_earliest',    // Use earliest start date
  date_end: 'use_latest',        // Use latest end date
  created_at: 'use_earliest',    // Keep earliest creation timestamp
  updated_at: 'use_current'      // Use current timestamp
}
```

---

## Confidence Scoring System

### Confidence Levels

| Level | Score Range | Auto-Mergeable | Description |
|-------|-------------|----------------|-------------|
| `very_high` | 0.95+ | Yes (if company match) | Virtually identical entries |
| `high` | 0.85-0.94 | No | Very likely duplicates, manual review recommended |
| `medium` | 0.70-0.84 | No | Possible duplicates, investigation needed |
| `low` | 0.50-0.69 | No | Weak similarity, likely different positions |

### Confidence Boosters

The system applies confidence boosts for strong similarity indicators:

- **Same Company** (+0.05): Exact company name match
- **Similar Title** (+0.05): High title similarity (>0.8)
- **Overlapping Dates** (+0.05): Significant date overlap (>0.8)
- **Similar Content** (+0.03): High description similarity (>0.75)

### Risk Assessment

Risk factors that may impact merge decision:

| Risk Type | Severity | Description |
|-----------|----------|-------------|
| `content_divergence` | Medium | Significantly different job descriptions |
| `skills_mismatch` | Low | Different skill sets may indicate different roles |
| `date_mismatch` | High | Start dates differ by more than a year |
| `title_progression` | Low | Different titles may indicate career advancement |
| `content_volume` | Low | Significant difference in content detail |

---

## Data Lineage and Audit Trail

### Merge Audit Records

Every merge operation creates a comprehensive audit record:

```sql
CREATE TABLE merge_audit (
  id UUID PRIMARY KEY,
  operation_type VARCHAR(50) DEFAULT 'merge',
  source_job_id INTEGER NOT NULL,
  target_job_id INTEGER NOT NULL,
  source_data JSONB NOT NULL,
  target_data JSONB NOT NULL, 
  merged_data JSONB NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  reversible BOOLEAN DEFAULT true,
  undone BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);
```

### Content Chunk Tracking

Chunks are updated to maintain lineage:

```sql
ALTER TABLE content_chunks ADD COLUMN merge_id UUID;
ALTER TABLE content_chunks ADD COLUMN merge_original_source_id INTEGER;
```

### Undo Capability

- **24-Hour Window**: Merges can be undone within 24 hours
- **Complete Restoration**: Original jobs and chunks fully restored
- **Automatic Cleanup**: Expired audit records cleaned automatically

---

## Example Workflows

### Workflow 1: Smart Duplicate Cleanup

```bash
# 1. Get duplicate summary
curl -X GET http://localhost:3001/api/user/duplicates/summary

# 2. Run full detection with previews
curl -X GET "http://localhost:3001/api/user/duplicates/detect?includePreview=true&threshold=0.8"

# 3. Auto-merge high-confidence duplicates
curl -X POST http://localhost:3001/api/user/duplicates/auto-merge \
  -H "Content-Type: application/json" \
  -d '{
    "confidenceThreshold": 0.95,
    "maxMerges": 5,
    "confirmed": true
  }'

# 4. Review remaining candidates
curl -X GET "http://localhost:3001/api/user/duplicates/merge-candidates?confidenceLevel=high"
```

### Workflow 2: Manual Merge with Preview

```bash
# 1. Preview specific merge
curl -X POST http://localhost:3001/api/user/duplicates/preview-merge \
  -H "Content-Type: application/json" \
  -d '{
    "sourceId": 5,
    "targetId": 8,
    "options": {
      "fieldStrategies": {
        "description": "prefer_longest",
        "skills": "merge_unique"
      }
    }
  }'

# 2. Execute merge if satisfied with preview
curl -X POST http://localhost:3001/api/user/duplicates/merge \
  -H "Content-Type: application/json" \
  -d '{
    "sourceId": 5, 
    "targetId": 8,
    "confirmed": true
  }'

# 3. Undo if needed (within 24 hours)
curl -X POST http://localhost:3001/api/user/duplicates/undo-merge \
  -H "Content-Type: application/json" \
  -d '{
    "mergeId": "uuid-from-merge-response",
    "confirmed": true
  }'
```

### Workflow 3: Batch Processing with Filtering

```bash
# 1. Get all merge candidates sorted by confidence
curl -X GET "http://localhost:3001/api/user/duplicates/merge-candidates?sortBy=confidence&confidenceLevel=high"

# 2. Preview auto-merge to see what would happen
curl -X POST http://localhost:3001/api/user/duplicates/auto-merge \
  -H "Content-Type: application/json" \
  -d '{
    "preview": true,
    "confidenceThreshold": 0.9,
    "maxMerges": 10
  }'

# 3. Execute selective auto-merge
curl -X POST http://localhost:3001/api/user/duplicates/auto-merge \
  -H "Content-Type: application/json" \
  -d '{
    "confirmed": true,
    "confidenceThreshold": 0.95,
    "maxMerges": 5
  }'
```

---

## Performance Considerations

### Optimization Strategies

1. **Batch Processing**: Large datasets processed in batches to prevent timeouts
2. **Similarity Caching**: Results cached for repeated operations
3. **Async Operations**: Long-running merges execute asynchronously
4. **Progressive Loading**: Large result sets loaded progressively

### Database Performance

- **Indexed Fields**: All merge-related fields properly indexed
- **Query Optimization**: Efficient queries for similarity calculations
- **Connection Pooling**: Database connections managed efficiently
- **Transaction Management**: Minimal transaction scope for safety

### Rate Limiting Strategy

- **Detection Operations**: Limited to prevent system overload
- **Merge Operations**: Balanced limits for data safety
- **Auto-Merge**: Strict limits for bulk operations

---

## Error Handling

### Standard Error Format

```json
{
  "error": "Error type",
  "message": "Detailed error message",
  "context": {
    "sourceId": 1,
    "targetId": 2,
    "operation": "merge"
  },
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

### Common Error Scenarios

| Error | Status | Description | Resolution |
|-------|--------|-------------|------------|
| `Job not found` | 404 | Referenced job doesn't exist | Verify job IDs |
| `Merge not confirmed` | 400 | Missing confirmation flag | Add `confirmed: true` |
| `Operation not found` | 404 | Merge ID not found or expired | Check merge ID and timing |
| `Not reversible` | 400 | Merge cannot be undone | Operation completed or expired |
| `Too many requests` | 429 | Rate limit exceeded | Wait and retry |

---

## Security Considerations

### Data Protection

- **Transaction Safety**: All operations atomic with rollback
- **Audit Trail**: Complete history of all changes
- **Access Control**: Rate limiting prevents abuse
- **Data Validation**: All inputs validated and sanitized

### Privacy Considerations

- **Data Retention**: Audit records auto-expire after 24 hours
- **Sensitive Data**: No sensitive information in logs
- **User Control**: Users control all merge decisions

---

## Monitoring and Analytics

### Key Metrics

- **Detection Accuracy**: Precision and recall of duplicate detection
- **Merge Success Rate**: Successful vs failed merge operations
- **User Satisfaction**: Undo rate as quality indicator
- **Performance**: Response times and throughput

### Logging

All operations logged with structured data:

```javascript
{
  "operation": "duplicate_detection",
  "jobCount": 25,
  "duplicatesFound": 3,
  "processingTime": 1250,
  "threshold": 0.8,
  "userId": "user-id",
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

---

## Future Enhancements

### Planned Features

- **Machine Learning**: Improve detection accuracy with usage data
- **Advanced Filtering**: More sophisticated similarity algorithms
- **Bulk Import**: Handle duplicate detection during data import
- **Integration**: Connect with external resume platforms
- **Analytics Dashboard**: Visual insights into data quality

### API Evolution

- **Versioning**: Backward-compatible API versioning
- **GraphQL**: Consider GraphQL for complex queries
- **Real-time**: WebSocket support for live updates
- **Webhooks**: Notifications for completed operations

This comprehensive duplicate management system provides users with powerful tools to maintain clean, accurate work history data while ensuring complete safety and reversibility of all operations.