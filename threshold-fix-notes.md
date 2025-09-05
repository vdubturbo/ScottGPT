-- Quick threshold fix for application
-- Update the application's default similarity threshold to a realistic value

-- Current issue: Application uses 0.7 threshold, but real similarities are 0.1-0.5
-- Fix: Update the scoring configuration to use appropriate thresholds

-- For immediate testing, you can override in your embeddings service:
-- services/embeddings.js - calculateSimilarityThreshold() method
-- Change return value from 0.7 to 0.25-0.3

-- Or in retrieval.js - retrieveContext() method:
-- const similarityThreshold = minSimilarity || 0.25; // Instead of high default

console.log('Application threshold fix needed:');
console.log('1. In services/embeddings.js:');
console.log('   calculateSimilarityThreshold() -> return 0.25 instead of 0.7');
console.log('');
console.log('2. In services/retrieval.js:');
console.log('   retrieveContext() -> similarityThreshold = minSimilarity || 0.25');
console.log('');
console.log('3. Test with realistic thresholds: 0.1-0.3 for good results');
