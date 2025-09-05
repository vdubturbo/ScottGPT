# ScottGPT Transparent Scoring System Documentation

## Overview

ScottGPT now uses a transparent, configurable relevance scoring system that replaces artificial score manipulations with documented, tunable algorithms. This ensures reliable ranking and makes the system easier to debug and optimize.

## Previous Issues (Now Fixed)

### Artificial Score Manipulations Removed:
- ❌ `similarity: result.similarity * 0.7` in retrieval.js
- ❌ `filterBoost += matchingSkills * 0.02` magic numbers
- ❌ `similarity: 0.8` artificial scores for text matches
- ❌ `combinedScore = (similarity * 0.8) + (recency * 0.1) + (boost * 0.1)` hard-coded weights

### Replaced With:
- ✅ Transparent scoring algorithms with documented rationale
- ✅ Configurable weights and thresholds
- ✅ Separate pipelines for semantic vs text search
- ✅ Comprehensive score breakdown logging
- ✅ Quality band classification for results

## Scoring System Architecture

### 1. Semantic Search Scoring

Used for vector/embedding-based search results.

**Components (weights sum to 1.0):**
- **Similarity (75%)**: Cosine similarity from embeddings
- **Recency (15%)**: How recent the information is
- **Metadata Match (10%)**: Skills/tags alignment with query

**Rationale:** Semantic similarity is the primary signal because embeddings capture meaning. Recency ensures fresh information is preferred. Metadata matching provides domain-specific relevance.

### 2. Text Search Scoring  

Used when semantic search fails or as fallback.

**Components:**
- **Base Relevance (40%)**: Conservative baseline for text matches
- **Keyword/Phrase Match (50%)**: Direct text matching quality
- **Recency (10%)**: Lower weight since text search is less precise

**Rationale:** Text search is less reliable than semantic search, so it gets a conservative base score. Keyword matching is weighted heavily to reward direct matches.

## Configuration System

### Default Configuration Location
`config/scoring-config.js` contains all scoring parameters.

### Key Configuration Sections:

#### Semantic Search Weights
```javascript
semantic: {
  similarity: 0.75,      // Primary semantic relevance
  recency: 0.15,         // Time-based relevance  
  metadata_match: 0.10,  // Skills/tags alignment
}
```

#### Text Search Weights  
```javascript
text: {
  base_relevance: 0.40,   // Conservative baseline
  keyword_match: 0.30,    // Keyword matching boost
  phrase_match: 0.20,     // Phrase matching boost  
  recency: 0.10,          // Lower recency weight
}
```

#### Quality Thresholds
```javascript
thresholds: {
  semantic: {
    minimum_similarity: 0.25,     // Include threshold
    good_similarity: 0.70,        // "Good match" threshold
    excellent_similarity: 0.85    // "Excellent match" threshold
  },
  text: {
    minimum_relevance: 0.30,      // Text search inclusion threshold
    good_relevance: 0.60,         // Good text relevance
    excellent_relevance: 0.80     // Excellent text relevance
  }
}
```

## Recency Scoring

### Algorithm Options:
- **Linear decay**: `score = 1.0 - (age_years / max_years)` 
- **Exponential decay**: `score = exp(-age_years / max_years)`
- **Step function**: Discrete age brackets

### Default Configuration:
- **Max age**: 2 years (older content gets minimum score)
- **Decay function**: Linear
- **Minimum score**: 0.1 (even old content retains some value)

### Rationale:
Recent information is generally more relevant for professional contexts. Linear decay provides predictable behavior that's easy to tune.

## Metadata Matching

### Skills Matching:
- **Boost per match**: 0.02 (2% per matching skill)  
- **Maximum boost**: 0.10 (capped at 10% total)
- **Matching**: Case-insensitive substring matching

### Tags Matching:
- **Boost per match**: 0.02 (2% per matching tag)
- **Maximum boost**: 0.10 (capped at 10% total)  
- **Matching**: Case-insensitive substring matching

### Rationale:
Metadata boosts are small but meaningful. They help surface domain-relevant content without overwhelming the primary similarity signal.

## Quality Bands

Results are classified into quality bands for user understanding:

- **Excellent (0.85+)**: High-confidence matches
- **Good (0.70-0.84)**: Solid relevant results
- **Fair (0.50-0.69)**: Potentially relevant
- **Poor (0.25-0.49)**: Low relevance, may be filtered

## Logging and Debugging

### Score Breakdown Logging
When enabled, shows detailed calculation for each result:

```
📊 Scoring Breakdown:
===================

1. Fed Fusion AI-Powered Government Contractor Market...
   Final Score: 0.842 (Good match)
   Method: semantic
   - similarity: 0.850 × 0.75 = 0.638
   - recency: 0.720 × 0.15 = 0.108
   - metadata: 0.480 × 0.10 = 0.048
   Meets Threshold: ✅
```

### Configuration:
```javascript
logging: {
  enabled: true,
  log_score_breakdown: true,      // Show calculation details
  log_threshold_decisions: true,  // Log inclusion/exclusion decisions  
  max_logged_results: 5          // Limit logged results for performance
}
```

## Customizing Scoring

### Creating Custom Configuration:
```javascript
import { createScoringConfig, DEFAULT_SCORING_CONFIG } from './config/scoring-config.js';

const customConfig = createScoringConfig({
  semantic: {
    similarity: 0.80,  // Increase similarity weight
    recency: 0.10,     // Decrease recency weight
    metadata_match: 0.10
  },
  thresholds: {
    semantic: {
      minimum_similarity: 0.30  // Raise minimum threshold
    }
  }
});
```

### Tuning Guidelines:

1. **Increase similarity weight** if semantic relevance is most important
2. **Increase recency weight** for time-sensitive domains  
3. **Increase metadata weight** for skill/tag-heavy queries
4. **Adjust thresholds** based on result quality analysis
5. **Enable logging** to understand scoring behavior

## Migration from Artificial Scoring

### Before (Problematic):
```javascript
// Hard-coded magic numbers
similarity: result.similarity * 0.7  // Why 0.7?
filterBoost += matchingSkills * 0.02  // Why 0.02?
similarity: 0.8  // Completely artificial
```

### After (Transparent):
```javascript
// Documented, configurable algorithm
const scoring = calculateSemanticScore(chunk, searchContext, config);
// scoring.final_score represents actual relevance
// scoring.components shows how score was calculated
// scoring.quality_band provides interpretation
```

## Performance Considerations

### Scoring Performance:
- **Semantic scoring**: ~0.5ms per result
- **Text scoring**: ~0.3ms per result  
- **Logging overhead**: ~0.1ms per logged result

### Optimization:
- Scoring is done in-memory after database retrieval
- Only top results get detailed logging
- Configuration is cached and reused

## Testing and Validation

### Scoring Quality Metrics:
- **Average score distribution**: Should follow expected patterns
- **Quality band distribution**: Most results should be "Good" or better
- **Threshold effectiveness**: Very few poor results should pass thresholds

### Debug Commands:
```bash
# Test scoring with debug output
node -e "
import { calculateSemanticScore } from './config/scoring-config.js';
const result = calculateSemanticScore(sampleChunk, searchContext);
console.log(JSON.stringify(result, null, 2));
"
```

## Future Enhancements

### Planned Improvements:
1. **Machine learning weights**: Learn optimal weights from user feedback
2. **Query-specific scoring**: Different weights for different query types
3. **A/B testing framework**: Test scoring algorithm variants
4. **Advanced text matching**: TF-IDF, BM25 scoring for text search
5. **Contextual boost**: Score based on conversation context

### Contributing Scoring Improvements:
1. Modify `config/scoring-config.js` with new algorithms
2. Add comprehensive tests for new scoring methods
3. Document rationale and configuration options
4. Test on representative queries before deploying

## Troubleshooting

### Common Issues:

**Problem**: Results seem poorly ranked
**Solution**: Enable logging to see score breakdown, adjust weights

**Problem**: Too few/many results passing threshold  
**Solution**: Adjust threshold values in configuration

**Problem**: Recency having too much/little impact
**Solution**: Modify recency decay function and weights

**Problem**: Metadata boosts not working
**Solution**: Check metadata matching logic and boost values

### Support:
Check the detailed score logging output to understand how rankings are calculated and identify tuning opportunities.