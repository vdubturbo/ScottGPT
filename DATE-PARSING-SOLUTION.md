# Date Parsing Solution for ScottGPT

## Problem Solved

Fixed PostgreSQL date storage errors caused by international and varied date formats in resume data:

```
Error upserting source: invalid input syntax for type date: "2013"
Error upserting source: invalid input syntax for type date: "6/2025"
```

## Solution Implementation

### 1. Comprehensive Date Parser (`utils/date-parser.js`)

Created a robust utility that handles:

- **Year-only formats**: `"2013"` → `"2013-01-01"` (start) / `"2013-12-31"` (end)
- **Month/Year formats**: `"6/2025"` → `"2025-06-01"` (start) / `"2025-06-30"` (end)
- **European formats**: `"31/12/2023"` → `"2023-12-31"`
- **US formats**: `"12/31/2023"` → `"2023-12-31"`
- **ISO formats**: `"2023-12-31"`, `"2023-12-01T00:00:00.000Z"` → `"2023-12-31"`
- **Text formats**: `"December 2023"`, `"Jun 2025"` → proper PostgreSQL dates
- **Ongoing positions**: `"Present"`, `"Current"` → `null`

### 2. Integration with Indexer (`scripts/indexer.js`)

Updated the `upsertSource` function to:
- Parse dates before database insertion
- Log parsing results for debugging
- Handle parsing failures gracefully
- Maintain existing functionality

### 3. Database Schema Validation (`add-date-validation-constraints.sql`)

Added PostgreSQL constraints to ensure:
- Reasonable date ranges (1960 to current + 10 years)
- Logical date ordering (start ≤ end)
- Proper NULL handling for ongoing positions

### 4. Enhanced Extraction Prompt (`scripts/extract.js`)

Updated system prompt with date formatting guidelines:
- Clear instructions for various date formats
- Examples of acceptable formats
- Guidance for ongoing positions

### 5. Comprehensive Test Suite (`tests/unit/date-parser.test.js`)

Created 50+ test cases covering:
- All supported date formats
- Edge cases and error handling
- Integration scenarios
- Real-world career data patterns

## Results

### Before Fix:
```
Error upserting source: invalid input syntax for type date: "2013"
6 out of 7 job records failed to store
```

### After Fix:
```
✅ Parsed start date: "2013" → "2013-01-01"
✅ Parsed end date: "6/2025" → "2025-06-30" 
✅ All 7 job records successfully stored and indexed
```

## Format Support Matrix

| Input Format | Example | Output | Notes |
|-------------|---------|---------|--------|
| Year only | `2013` | `2013-01-01` / `2013-12-31` | Smart start/end defaults |
| Month/Year | `6/2025` | `2025-06-01` / `2025-06-30` | Handles partial dates |
| European DD/MM/YYYY | `31/12/2023` | `2023-12-31` | Day > 12 detection |
| US MM/DD/YYYY | `12/31/2023` | `2023-12-31` | Standard US format |
| ISO YYYY-MM-DD | `2023-12-31` | `2023-12-31` | With timezone support |
| ISO with time | `2023-12-01T00:00:00.000Z` | `2023-12-01` | UTC handling |
| Text month/year | `December 2023` | `2023-12-01` / `2023-12-31` | Natural language |
| Text abbreviated | `Jun 2025` | `2025-06-01` / `2025-06-30` | Common abbreviations |
| Ongoing positions | `Present`, `Current` | `null` | Database NULL |
| Invalid formats | `invalid`, `99/99/9999` | `null` | Graceful handling |

## Key Features

1. **International Compatibility**: Handles both US and European date formats automatically
2. **Smart Defaults**: Uses appropriate start/end of period for partial dates
3. **Career Validation**: Ensures dates fall within reasonable employment ranges (1960-2035)
4. **Timezone Handling**: Properly processes ISO dates with timezone information
5. **Graceful Fallback**: Returns NULL for unparseable dates instead of crashing
6. **Comprehensive Logging**: Detailed parsing information for debugging
7. **Flexible Input**: Accepts whitespace, mixed case, and varied formats

## Usage

```javascript
import { DateParser } from './utils/date-parser.js';

// Basic parsing
const result = DateParser.parseToPostgresDate('6/2025', false); // "2025-06-01"

// With end date flag for period defaults
const endDate = DateParser.parseToPostgresDate('2023', true); // "2023-12-31"

// Validation
const isValid = DateParser.validateCareerDate('2023'); // true

// Debug information
const debugInfo = DateParser.getParsingDebugInfo('invalid'); // Detailed breakdown
```

## Benefits

- ✅ **Fixed PostgreSQL insertion errors** for international date formats
- ✅ **Zero data loss** - all parseable dates are preserved
- ✅ **International support** - works with global resume formats  
- ✅ **Future-proof** - extensible for new date formats
- ✅ **Performance optimized** - efficient parsing strategies
- ✅ **Developer friendly** - comprehensive debugging and logging

This solution enables ScottGPT to process resumes from international candidates without date format conflicts, ensuring reliable data storage and retrieval.