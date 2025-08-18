/**
 * Company Grouping Service Usage Example
 * 
 * Demonstrates how to use the CompanyGroupingService to analyze
 * career patterns and company tenure from job data.
 */

import CompanyGroupingService from '../utils/company-grouping.js';

// Example job data with various edge cases
const exampleJobs = [
  // Microsoft - Multiple positions with progression
  {
    id: 'ms1',
    title: 'Software Engineer',
    org: 'Microsoft Corp',
    date_start: '2018-06-01',
    date_end: '2020-03-31',
    skills: ['C#', 'JavaScript', 'SQL Server', 'Azure']
  },
  {
    id: 'ms2',
    title: 'Senior Software Engineer',
    org: 'Microsoft Corporation', // Slight name variation
    date_start: '2020-04-01',
    date_end: '2022-01-31',
    skills: ['C#', 'JavaScript', 'TypeScript', 'Azure', 'React', 'Node.js']
  },
  {
    id: 'ms3',
    title: 'Principal Software Engineer',
    org: 'Microsoft', // Another variation
    date_start: '2022-02-01',
    date_end: null, // Current position
    skills: ['C#', 'JavaScript', 'TypeScript', 'Azure', 'React', 'Node.js', 'Leadership', 'Mentoring']
  },
  
  // Google - Boomerang pattern
  {
    id: 'g1',
    title: 'Software Developer',
    org: 'Google Inc',
    date_start: '2016-01-01',
    date_end: '2017-12-31',
    skills: ['Python', 'Java', 'GCP', 'TensorFlow']
  },
  {
    id: 'g2',
    title: 'Senior Software Engineer',
    org: 'Alphabet Inc', // Parent company (should be grouped with Google)
    date_start: '2023-03-01', // Gap of ~5 years - boomerang pattern
    date_end: null,
    skills: ['Python', 'Go', 'Kubernetes', 'GCP', 'Machine Learning', 'TensorFlow']
  },
  
  // Amazon - Single position
  {
    id: 'a1',
    title: 'Solutions Architect',
    org: 'Amazon Web Services',
    date_start: '2019-01-01',
    date_end: '2020-05-31',
    skills: ['AWS', 'Python', 'Terraform', 'Docker', 'Kubernetes']
  },
  
  // Startup - Missing end date, overlapping with other roles
  {
    id: 's1',
    title: 'Founding Engineer',
    org: 'TechStartup Inc',
    date_start: '2021-06-01',
    date_end: '2022-12-31',
    skills: ['React', 'Node.js', 'PostgreSQL', 'AWS', 'Startup']
  }
];

// Initialize the service
const groupingService = new CompanyGroupingService();

console.log('=== Company Grouping Service Example ===\n');

// Group jobs by company
const companyGroups = groupingService.groupJobsByCompany(exampleJobs);

console.log(`Found ${companyGroups.length} companies:\n`);

companyGroups.forEach((company, index) => {
  console.log(`${index + 1}. Company: ${company.normalizedName}`);
  console.log(`   Original names: ${company.originalNames.join(', ')}`);
  console.log(`   Positions: ${company.totalPositions}`);
  console.log(`   Date range: ${company.dateRange.formatted}`);
  console.log(`   Total tenure: ${company.tenure.formatted}`);
  console.log(`   Unique skills: ${company.aggregatedSkills.skillCount}`);
  
  // Career progression
  if (company.careerProgression.promotions.length > 0) {
    console.log(`   Promotions: ${company.careerProgression.promotions.length}`);
    company.careerProgression.promotions.forEach(promo => {
      console.log(`     • ${promo.from.title} → ${promo.to.title} (${promo.to.date})`);
    });
  }
  
  // Boomerang pattern
  if (company.boomerangPattern.isBoomerang) {
    console.log(`   🔄 Boomerang employee: ${company.boomerangPattern.stints} stints`);
    company.boomerangPattern.gaps.forEach((gap, i) => {
      console.log(`     Gap ${i + 1}: ${gap.durationFormatted} (${gap.start} to ${gap.end})`);
    });
  }
  
  // Top skills
  const topSkills = Object.entries(company.aggregatedSkills.skillFrequency)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([skill, count]) => `${skill}(${count})`);
  
  if (topSkills.length > 0) {
    console.log(`   Top skills: ${topSkills.join(', ')}`);
  }
  
  // Insights
  if (company.insights.length > 0) {
    console.log(`   Insights:`);
    company.insights.forEach(insight => {
      console.log(`     • ${insight}`);
    });
  }
  
  console.log('');
});

// Demonstrate individual methods
console.log('=== Method Examples ===\n');

// Company name normalization examples
console.log('Company Name Normalization:');
const nameExamples = [
  'Microsoft Corporation',
  'Microsoft Corp',
  'Microsoft Inc.',
  'The Microsoft Company',
  'Google Inc',
  'Alphabet Inc',
  'Meta Platforms Inc',
  'Facebook, Inc.'
];

nameExamples.forEach(name => {
  console.log(`  "${name}" → "${groupingService.normalizeCompanyName(name)}"`);
});

console.log('\nCareer Progression Analysis:');
const microsoftPositions = companyGroups.find(g => g.normalizedName === 'microsoft')?.positions || [];
if (microsoftPositions.length > 0) {
  const progression = groupingService.calculateCareerProgression(microsoftPositions);
  console.log(`  Pattern: ${progression.pattern}`);
  console.log(`  Progression Score: ${progression.progressionScore.toFixed(2)}`);
  console.log(`  Promotions: ${progression.promotions.length}`);
  console.log(`  Lateral Moves: ${progression.lateralMoves.length}`);
}

console.log('\nSkills Evolution:');
const googlePositions = companyGroups.find(g => g.normalizedName === 'google')?.positions || [];
if (googlePositions.length > 0) {
  const skills = groupingService.aggregateCompanySkills(googlePositions);
  if (skills.skillEvolution.length > 0) {
    skills.skillEvolution.forEach((evolution, i) => {
      console.log(`  Transition ${i + 1}: ${evolution.fromPosition} → ${evolution.toPosition}`);
      if (evolution.added.length > 0) {
        console.log(`    Added: ${evolution.added.join(', ')}`);
      }
      if (evolution.removed.length > 0) {
        console.log(`    Removed: ${evolution.removed.join(', ')}`);
      }
    });
  }
}

// Performance demonstration
console.log('\n=== Performance Test ===');
const startTime = Date.now();
const largeJobSet = Array.from({ length: 1000 }, (_, i) => ({
  id: `job-${i}`,
  title: `Role ${i % 10}`,
  org: `Company ${Math.floor(i / 50)}`, // 20 companies, 50 jobs each
  date_start: `${2000 + Math.floor(i / 50)}-01-01`,
  date_end: i < 999 ? `${2000 + Math.floor(i / 50) + 1}-01-01` : null,
  skills: [`Skill${i % 20}`, `Tech${i % 15}`, 'Common']
}));

const largeResult = groupingService.groupJobsByCompany(largeJobSet);
const endTime = Date.now();

console.log(`Processed ${largeJobSet.length} jobs into ${largeResult.length} company groups in ${endTime - startTime}ms`);

export { exampleJobs, companyGroups };