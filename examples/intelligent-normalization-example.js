/**
 * Intelligent Company Name Normalization Example
 * 
 * Demonstrates the enhanced company grouping service with intelligent 
 * normalization that handles real-world company name variations.
 */

import CompanyGroupingService from '../utils/company-grouping.js';

console.log('=== Intelligent Company Name Normalization Demo ===\n');

// Initialize the service
const groupingService = new CompanyGroupingService();

// Test data covering all requested patterns
const testCases = [
  // 1. Corporate suffixes
  { org: 'Microsoft', title: 'Software Engineer' },
  { org: 'Microsoft Corp', title: 'Senior Engineer' },
  { org: 'Microsoft Corporation', title: 'Principal Engineer' },
  { org: 'Microsoft Inc', title: 'Lead Engineer' },
  
  // 2. Acquisitions
  { org: 'Instagram', title: 'Software Engineer' },
  { org: 'Instagram (Facebook)', title: 'Senior Engineer' },
  { org: 'Meta', title: 'Staff Engineer' },
  { org: 'Facebook', title: 'Principal Engineer' },
  { org: 'WhatsApp', title: 'Senior Engineer' },
  { org: 'WhatsApp Inc', title: 'Staff Engineer' },
  
  // 3. Divisions
  { org: 'Google', title: 'Software Engineer' },
  { org: 'Google Cloud', title: 'Cloud Architect' },
  { org: 'Alphabet Inc', title: 'Senior Engineer' },
  { org: 'YouTube', title: 'Senior Engineer' },
  { org: 'Android', title: 'Mobile Engineer' },
  { org: 'Google Workspace', title: 'Product Manager' },
  
  // 4. Typos and variations
  { org: 'Microsft', title: 'Engineer' }, // Common typo
  { org: 'Mircosoft', title: 'Developer' }, // Another typo
  { org: 'Goggle', title: 'Engineer' }, // Google typo
  { org: 'Googel', title: 'Developer' }, // Another Google typo
  { org: 'Facebok', title: 'Engineer' }, // Facebook typo
  
  // 5. Case variations
  { org: 'microsoft', title: 'Engineer' },
  { org: 'MICROSOFT', title: 'Senior Engineer' },
  { org: 'MicroSoft', title: 'Principal Engineer' },
  { org: 'apple', title: 'Engineer' },
  { org: 'APPLE INC', title: 'Senior Engineer' },
  { org: 'Apple Computer', title: 'Software Engineer' },
  
  // 6. Complex variations with modifiers
  { org: 'The Microsoft Corporation', title: 'Engineer' },
  { org: 'Microsoft Technologies Inc', title: 'Tech Lead' },
  { org: 'Google International', title: 'Engineer' },
  { org: 'Amazon Web Services', title: 'Cloud Engineer' },
  { org: 'AWS', title: 'Solutions Architect' },
  
  // 7. Challenging edge cases
  { org: 'Tesla Motors', title: 'Engineer' },
  { org: 'Tesla Inc', title: 'Senior Engineer' },
  { org: 'Netflix Studios', title: 'Engineer' },
  { org: 'Uber Technologies Inc', title: 'Engineer' },
  { org: 'Uber Eats', title: 'Product Manager' },
  
  // 8. Unknown companies (should pass through)
  { org: 'StartupCorp LLC', title: 'Engineer' },
  { org: 'Small Business Inc', title: 'Developer' },
  { org: 'Consulting Firm', title: 'Consultant' }
];

console.log('1. INDIVIDUAL NORMALIZATION TESTS');
console.log('==================================');

testCases.forEach((testCase, index) => {
  const result = groupingService.normalizeCompanyName(testCase.org);
  const confidence = (result.confidence * 100).toFixed(1);
  const needsReview = result.confidence < 0.85 ? '⚠️' : '✅';
  
  console.log(`${index + 1}. "${testCase.org}" → "${result.canonical}"`);
  console.log(`   Method: ${result.method} | Confidence: ${confidence}% ${needsReview}`);
  
  if (result.metadata && Object.keys(result.metadata).length > 1) {
    const metadata = { ...result.metadata };
    delete metadata.timestamp; // Remove timestamp for cleaner display
    console.log(`   Metadata: ${JSON.stringify(metadata)}`);
  }
  
  console.log('');
});

console.log('2. COMPANY GROUPING RESULTS');
console.log('============================');

const jobs = testCases.map((testCase, index) => ({
  id: `job-${index}`,
  org: testCase.org,
  title: testCase.title,
  date_start: `2023-0${(index % 12) + 1}-01`,
  date_end: index > 30 ? null : `2024-0${(index % 12) + 1}-01`
}));

const companyGroups = groupingService.groupJobsByCompany(jobs);

console.log(`Grouped ${jobs.length} jobs into ${companyGroups.length} companies:\n`);

companyGroups.forEach((company, index) => {
  console.log(`${index + 1}. ${company.normalizedName.toUpperCase()}`);
  console.log(`   Original names: ${company.originalNames.join(', ')}`);
  console.log(`   Positions: ${company.totalPositions}`);
  console.log(`   Normalization method: ${company.primaryNormalizationMethod}`);
  console.log(`   Average confidence: ${(company.averageConfidence * 100).toFixed(1)}%`);
  console.log(`   Needs review: ${company.needsReview ? 'Yes ⚠️' : 'No ✅'}`);
  
  if (company.needsReview) {
    console.log(`   ⚠️  Reason: Low confidence or fuzzy matching detected`);
  }
  
  console.log('');
});

console.log('3. MANUAL OVERRIDE DEMONSTRATION');
console.log('=================================');

// Add manual override for a tricky case
groupingService.addManualOverride('StartupCorp LLC', 'startupX', 'Manual correction - StartupCorp is now StartupX');
groupingService.addManualOverride('Small Business Inc', 'small-biz', 'User specified canonical name');

console.log('Added manual overrides for uncertain matches...\n');

// Test the overrides
const overrideTest1 = groupingService.normalizeCompanyName('StartupCorp LLC');
const overrideTest2 = groupingService.normalizeCompanyName('Small Business Inc');

console.log(`"StartupCorp LLC" → "${overrideTest1.canonical}" (${overrideTest1.method})`);
console.log(`"Small Business Inc" → "${overrideTest2.canonical}" (${overrideTest2.method})`);

console.log('\nManual overrides:');
const overrides = groupingService.getManualOverrides();
overrides.forEach(override => {
  console.log(`  • "${override.original}" → "${override.canonical}" (${override.reason})`);
});

console.log('\n4. LEARNING SYSTEM DEMONSTRATION');
console.log('=================================');

// Simulate user corrections
groupingService.learnFromCorrection('Acme Corp', 'acme-corporation', { 
  userNote: 'This is the canonical name we use internally' 
});

groupingService.learnFromCorrection('ACME Inc', 'acme-corporation', { 
  userNote: 'Same company, different legal structure' 
});

console.log('Learned from user corrections...\n');

// Test learned patterns
const learnedTest1 = groupingService.normalizeCompanyName('Acme Corp');
const learnedTest2 = groupingService.normalizeCompanyName('ACME Inc');

console.log(`"Acme Corp" → "${learnedTest1.canonical}" (${learnedTest1.method})`);
console.log(`"ACME Inc" → "${learnedTest2.canonical}" (${learnedTest2.method})`);

console.log('\n5. STATISTICS AND ANALYSIS');
console.log('===========================');

const stats = groupingService.getNormalizationStats();
console.log(`Total normalizations: ${stats.total_normalizations}`);
console.log(`Success rate: ${(stats.success_rate * 100).toFixed(1)}%`);
console.log(`Knowledge base size: ${stats.knowledge_base_size} companies`);
console.log(`Manual overrides: ${stats.manual_overrides_count}`);
console.log(`Pending confirmations: ${stats.pending_confirmations_count}`);

console.log('\nMethod distribution:');
Object.entries(stats.method_distribution).forEach(([method, count]) => {
  console.log(`  ${method}: ${count}`);
});

console.log('\nConfidence distribution:');
console.log(`  High (≥95%): ${stats.confidence_distribution.high}`);
console.log(`  Medium (≥85%): ${stats.confidence_distribution.medium}`);
console.log(`  Low (<85%): ${stats.confidence_distribution.low}`);

console.log('\n6. LEARNING SUGGESTIONS');
console.log('========================');

const suggestions = groupingService.generateLearningSuggestions();
if (suggestions.length > 0) {
  console.log('Suggested improvements based on usage patterns:\n');
  
  suggestions.slice(0, 3).forEach((suggestion, index) => {
    console.log(`${index + 1}. ${suggestion.type}`);
    console.log(`   Canonical: ${suggestion.canonical}`);
    console.log(`   Variations: ${suggestion.variations.join(', ')}`);
    console.log(`   Frequency: ${suggestion.frequency} occurrences`);
    console.log(`   Avg confidence: ${(suggestion.average_confidence * 100).toFixed(1)}%`);
    console.log(`   Suggestion: ${suggestion.suggestion}`);
    console.log('');
  });
} else {
  console.log('No learning suggestions available yet. More data needed.\n');
}

console.log('7. CONSERVATIVE MATCHING VERIFICATION');
console.log('======================================');

// Test edge cases where service should be conservative
const conservativeTests = [
  'Apple Computers Inc', // Should match Apple
  'Microsoft Research', // Should match Microsoft
  'Google DeepMind', // Division vs acquisition
  'Facebook Reality Labs', // Division
  'Amazon Prime Video', // Division
  'Completely Unknown Corp', // Should pass through
  'XYZ Startup', // Should pass through
  'ABC Company Ltd' // Should pass through
];

console.log('Testing conservative behavior on edge cases:\n');

conservativeTests.forEach(testName => {
  const result = groupingService.normalizeCompanyName(testName);
  const isConservative = result.confidence < 0.85 || result.method === 'passthrough';
  const flag = isConservative ? '🛡️ Conservative' : '✅ Confident';
  
  console.log(`"${testName}" → "${result.canonical}"`);
  console.log(`  Method: ${result.method} | Confidence: ${(result.confidence * 100).toFixed(1)}% | ${flag}`);
  console.log('');
});

console.log('8. EXPORT/IMPORT FUNCTIONALITY');
console.log('===============================');

// Export normalization data
const exportData = groupingService.exportNormalizationData();
console.log('Exported normalization data:');
console.log(`  Knowledge base entries: ${Object.keys(exportData.knowledge_base).length}`);
console.log(`  Manual overrides: ${Object.keys(exportData.manual_overrides).length}`);
console.log(`  History entries: ${exportData.normalization_history.length}`);
console.log(`  Learning suggestions: ${exportData.learning_suggestions.length}`);

console.log('\n9. REAL-WORLD PATTERN VERIFICATION');
console.log('===================================');

const realWorldTests = [
  // Corporate suffixes variations
  { input: 'Apple Inc.', expected: 'apple', pattern: 'suffix_normalization' },
  { input: 'Microsoft Corporation', expected: 'microsoft', pattern: 'suffix_normalization' },
  
  // Acquisition chains
  { input: 'Instagram', expected: 'meta', pattern: 'acquisition_match' },
  { input: 'WhatsApp', expected: 'meta', pattern: 'acquisition_match' },
  
  // Division mappings
  { input: 'Google Cloud', expected: 'google', pattern: 'division_match' },
  { input: 'YouTube', expected: 'google', pattern: 'division_match' },
  { input: 'AWS', expected: 'amazon', pattern: 'division_match' },
  
  // Typo corrections
  { input: 'Microsft', expected: 'microsoft', pattern: 'typo_correction' },
  { input: 'Goggle', expected: 'google', pattern: 'typo_correction' }
];

console.log('Verifying real-world pattern handling:\n');

let passedTests = 0;
realWorldTests.forEach((test, index) => {
  const result = groupingService.normalizeCompanyName(test.input);
  const passed = result.canonical === test.expected;
  const status = passed ? '✅ PASS' : '❌ FAIL';
  
  if (passed) passedTests++;
  
  console.log(`${index + 1}. ${status} "${test.input}" → "${result.canonical}"`);
  console.log(`   Expected: "${test.expected}" | Method: ${result.method}`);
  if (!passed) {
    console.log(`   ⚠️ Expected pattern: ${test.pattern}, Got: ${result.method}`);
  }
  console.log('');
});

const successRate = ((passedTests / realWorldTests.length) * 100).toFixed(1);
console.log(`Pattern verification: ${passedTests}/${realWorldTests.length} tests passed (${successRate}%)`);

console.log('\n✅ INTELLIGENT NORMALIZATION DEMO COMPLETE!');
console.log('\nKey Features Demonstrated:');
console.log('🏢 Corporate suffix handling (Inc, Corp, Corporation, LLC, etc.)');
console.log('🔄 Acquisition tracking (Instagram → Meta, WhatsApp → Meta)');
console.log('📁 Division mapping (Google Cloud → Google, AWS → Amazon)');
console.log('✏️  Typo correction (Microsft → Microsoft, Goggle → Google)');
console.log('📝 Case normalization (microsoft, MICROSOFT → Microsoft)');
console.log('🛡️ Conservative matching (better to keep separate than incorrectly merge)');
console.log('🎯 Manual override system (user corrections and confirmations)');
console.log('📊 Decision logging and analysis');
console.log('🧠 Learning system (improves from user feedback)');
console.log('📈 Statistics and pattern recognition');

export { groupingService };