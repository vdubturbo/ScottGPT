/**
 * Company Timeline Generation Example
 * 
 * Demonstrates the generateCompanyTimeline() method that creates
 * timeline data optimized for career visualization, showing company
 * tenures as blocks with position progressions and career patterns.
 */

import { DataProcessingService } from '../utils/data-processing.js';

// Example job data with complex career patterns
const mockCareerData = [
  // Early career - Startup
  {
    id: 'startup-dev',
    title: 'Junior Developer',
    org: 'TechStartup Inc',
    date_start: '2018-01-15',
    date_end: '2019-08-30',
    skills: ['JavaScript', 'React', 'Node.js', 'MongoDB']
  },
  
  // Career advancement - Microsoft progression
  {
    id: 'ms-engineer',
    title: 'Software Engineer',
    org: 'Microsoft Corporation',
    date_start: '2019-09-15',
    date_end: '2021-03-31',
    skills: ['C#', 'JavaScript', 'SQL Server', 'Azure', 'TypeScript']
  },
  {
    id: 'ms-senior',
    title: 'Senior Software Engineer',
    org: 'Microsoft Corp', // Name variation
    date_start: '2021-04-01',
    date_end: '2022-12-15',
    skills: ['C#', 'JavaScript', 'TypeScript', 'Azure', 'React', 'Leadership']
  },
  {
    id: 'ms-principal',
    title: 'Principal Software Engineer',
    org: 'Microsoft',
    date_start: '2022-12-16',
    date_end: '2024-06-30',
    skills: ['C#', 'TypeScript', 'Azure', 'Architecture', 'Team Leadership', 'Strategic Planning']
  },
  
  // Job change with brief overlap (consulting transition)
  {
    id: 'google-senior',
    title: 'Senior Staff Engineer',
    org: 'Google LLC',
    date_start: '2024-06-15', // 15-day overlap
    date_end: null, // Current position
    skills: ['Python', 'Go', 'GCP', 'Machine Learning', 'System Design', 'Team Leadership']
  },
  
  // Side consulting work (overlapping)
  {
    id: 'consulting-architect',
    title: 'Solutions Architect',
    org: 'Independent Consulting',
    date_start: '2023-01-01',
    date_end: '2024-05-31',
    skills: ['AWS', 'Architecture', 'Consulting', 'Project Management']
  },
  
  // Gap year for education/travel
  {
    id: 'amazon-architect',
    title: 'Principal Solutions Architect',
    org: 'Amazon Web Services',
    date_start: '2017-03-01',
    date_end: '2017-11-15', // Gap before startup
    skills: ['AWS', 'Python', 'Terraform', 'Cloud Architecture']
  }
];

async function demonstrateTimelineGeneration() {
  console.log('=== Company Timeline Generation Demo ===\\n');
  
  const dataProcessor = new DataProcessingService();
  
  try {
    // Generate comprehensive timeline data
    const timelineData = dataProcessor.generateCompanyTimeline(mockCareerData);
    
    console.log('📊 TIMELINE OVERVIEW');
    console.log('===================');
    console.log(`Total Career Span: ${timelineData.patterns.careerStart} - ${timelineData.patterns.careerEnd}`);
    console.log(`Total Career Months: ${timelineData.patterns.totalCareerMonths} (${Math.round(timelineData.patterns.totalCareerMonths / 12 * 10) / 10} years)`);
    console.log(`Companies: ${timelineData.metadata.totalCompanies}`);
    console.log(`Career Pattern: ${timelineData.patterns.careerPattern}`);
    console.log('');
    
    console.log('🏢 COMPANY TIMELINE BLOCKS');
    console.log('==========================');
    timelineData.timeline.forEach((company, index) => {
      console.log(`${index + 1}. ${company.company}`);
      console.log(`   📅 Period: ${company.startDate} - ${company.endDate}`);
      console.log(`   ⏱️  Duration: ${company.totalMonthsFormatted} (${company.totalMonths} months)`);
      console.log(`   📈 Career %: ${company.careerPercentage}%`);
      console.log(`   🎯 Pattern: ${company.progression.pattern}`);
      
      if (company.isBoomerang) {
        console.log(`   🔄 Boomerang: ${company.stints} stints`);
        company.gaps.forEach((gap, i) => {
          console.log(`      Gap ${i + 1}: ${gap.durationFormatted} (${gap.start} to ${gap.end})`);
        });
      }
      
      console.log(`   👤 Positions (${company.positions.length}):`);
      company.positions.forEach((position, i) => {
        const indicator = i === company.positions.length - 1 ? '└──' : '├──';
        const current = position.isCurrentPosition ? ' (CURRENT)' : '';
        console.log(`      ${indicator} ${position.title} (${position.start} - ${position.end || 'Present'})${current}`);
        console.log(`           Duration: ${position.durationFormatted}`);
      });
      
      if (company.progression.promotions > 0) {
        console.log(`   🚀 Promotions: ${company.progression.promotions}`);
      }
      if (company.progression.lateralMoves > 0) {
        console.log(`   ↔️  Lateral Moves: ${company.progression.lateralMoves}`);
      }
      
      if (company.topSkills.length > 0) {
        const skillsStr = company.topSkills.map(s => `${s.skill}(${s.count})`).join(', ');
        console.log(`   🛠️  Top Skills: ${skillsStr}`);
      }
      
      // Visual styling hints
      console.log(`   🎨 Display: Color=${company.displayHints.color}, Intensity=${company.displayHints.intensity}`);
      if (company.displayHints.isHighlight) {
        console.log(`   ⭐ Major Employer (${company.careerPercentage}% of career)`);
      }
      
      console.log('');
    });
    
    console.log('📊 CAREER PATTERN ANALYSIS');
    console.log('==========================');
    console.log(`Job Hopping Score: ${timelineData.patterns.jobHoppingScore} (0=stable, 1=frequent changes)`);
    console.log(`Progression Score: ${timelineData.patterns.progressionScore} (0=no advancement, 1=strong advancement)`);
    console.log(`Stability Index: ${timelineData.patterns.stabilityIndex} (0=unstable, 1=highly stable)`);
    console.log(`Growth Velocity: ${timelineData.patterns.growthVelocity} (promotions+roles per year)`);
    console.log(`Longest Tenure: ${Math.round(timelineData.patterns.longestTenure / 12 * 10) / 10} years`);
    console.log(`Average Tenure: ${timelineData.patterns.averageTenure} months`);
    console.log('');
    
    console.log('📈 TENURE BREAKDOWN');
    console.log('===================');
    console.log(`Short-term jobs (<1 year): ${timelineData.patterns.shortTermJobs}`);
    console.log(`Medium-term jobs (1-3 years): ${timelineData.patterns.mediumTermJobs}`);
    console.log(`Long-term jobs (3+ years): ${timelineData.patterns.longTermJobs}`);
    console.log('');
    
    if (timelineData.patterns.companySizeProgression) {
      console.log('🏭 COMPANY SIZE PROGRESSION');
      console.log('============================');
      console.log(`Pattern: ${timelineData.patterns.companySizeProgression.pattern}`);
      console.log(`Summary: ${timelineData.patterns.companySizeProgression.summary}`);
      
      timelineData.patterns.companySizeProgression.progression.forEach(company => {
        console.log(`  ${company.order}. ${company.company}: ${company.size} (${company.timeframe})`);
      });
      console.log('');
    }
    
    if (timelineData.gaps.length > 0) {
      console.log('⏳ CAREER GAPS');
      console.log('==============');
      timelineData.gaps.forEach((gap, index) => {
        console.log(`${index + 1}. ${gap.after} → ${gap.before}`);
        console.log(`   Duration: ${gap.durationFormatted} (${gap.type})`);
        console.log(`   Period: ${gap.start} to ${gap.end}`);
      });
      console.log('');
    }
    
    if (timelineData.overlaps.length > 0) {
      console.log('🔄 EMPLOYMENT OVERLAPS');
      console.log('======================');
      timelineData.overlaps.forEach((overlap, index) => {
        console.log(`${index + 1}. ${overlap.companies.join(' ↔ ')}`);
        console.log(`   Duration: ${overlap.durationFormatted}`);
        console.log(`   Period: ${overlap.overlapStart} to ${overlap.overlapEnd}`);
        console.log(`   Type: ${overlap.type}`);
      });
      console.log('');
    }
    
    console.log('💡 CAREER INSIGHTS');
    console.log('==================');
    timelineData.insights.forEach(insight => {
      console.log(`• ${insight}`);
    });
    console.log('');
    
    console.log('📋 TIMELINE DATA STRUCTURE SAMPLE');
    console.log('==================================');
    console.log('// Example output structure:');
    console.log('{');
    console.log('  timeline: [');
    timelineData.timeline.slice(0, 1).forEach(company => {
      console.log('    {');
      console.log(`      company: "${company.company}",`);
      console.log(`      startDate: "${company.startDate}",`);
      console.log(`      endDate: "${company.endDate}",`);
      console.log(`      totalMonths: ${company.totalMonths},`);
      console.log(`      careerPercentage: ${company.careerPercentage},`);
      console.log('      positions: [');
      company.positions.forEach(pos => {
        console.log(`        { title: "${pos.title}", start: "${pos.start}", end: "${pos.end || 'null'}" },`);
      });
      console.log('      ],');
      console.log('      progression: {');
      console.log(`        pattern: "${company.progression.pattern}",`);
      console.log(`        promotions: ${company.progression.promotions},`);
      console.log(`        progressionScore: ${company.progression.progressionScore}`);
      console.log('      }');
      console.log('    }');
    });
    console.log('  ],');
    console.log('  patterns: {');
    console.log(`    longestTenure: ${timelineData.patterns.longestTenure},`);
    console.log(`    averageTenure: ${timelineData.patterns.averageTenure},`);
    console.log(`    jobHoppingScore: ${timelineData.patterns.jobHoppingScore},`);
    console.log(`    progressionScore: ${timelineData.patterns.progressionScore},`);
    console.log(`    careerPattern: "${timelineData.patterns.careerPattern}"`);
    console.log('  }');
    console.log('}');
    
    console.log('\\n✅ Timeline Generation Demo Complete!');
    console.log('\\n🎯 Key Benefits for Visualization:');
    console.log('• Company blocks with precise date ranges and durations');
    console.log('• Position progression within each company');
    console.log('• Career percentage calculations for proportional displays');
    console.log('• Gap and overlap detection for timeline accuracy');
    console.log('• Visual styling hints (colors, intensity, highlights)');
    console.log('• Comprehensive career pattern classification');
    console.log('• Rich insights for narrative generation');
    
  } catch (error) {
    console.error('Timeline generation error:', error.message);
    console.error(error.stack);
  }
}

// API Usage Examples
function showTimelineAPIUsage() {
  console.log('\\n=== Timeline API Usage Examples ===\\n');
  
  console.log('// Basic timeline generation');
  console.log('const dataProcessor = new DataProcessingService();');
  console.log('const timelineData = dataProcessor.generateCompanyTimeline(jobs);');
  console.log('');
  
  console.log('// Access timeline blocks for visualization');
  console.log('timelineData.timeline.forEach(company => {');
  console.log('  console.log(`${company.company}: ${company.careerPercentage}%`);');
  console.log('  company.positions.forEach(position => {');
  console.log('    console.log(`  ${position.title} (${position.durationFormatted})`);');
  console.log('  });');
  console.log('});');
  console.log('');
  
  console.log('// Career pattern analysis');
  console.log('const { jobHoppingScore, progressionScore, careerPattern } = timelineData.patterns;');
  console.log('if (jobHoppingScore > 0.7) {');
  console.log('  console.log("High job mobility detected");');
  console.log('} else if (progressionScore > 0.8) {');
  console.log('  console.log("Strong career advancement pattern");');
  console.log('}');
  console.log('');
  
  console.log('// Timeline visualization data extraction');
  console.log('const visualizationData = timelineData.timeline.map(company => ({');
  console.log('  label: company.company,');
  console.log('  start: new Date(company.startDate),');
  console.log('  end: new Date(company.endDate),');
  console.log('  color: company.displayHints.color,');
  console.log('  intensity: company.displayHints.intensity,');
  console.log('  isHighlight: company.displayHints.isHighlight,');
  console.log('  positions: company.positions.length,');
  console.log('  percentage: company.careerPercentage');
  console.log('}));');
  console.log('');
  
  console.log('// Gap and overlap handling for accurate timelines');
  console.log('const gaps = timelineData.gaps.filter(gap => gap.type !== "short_gap");');
  console.log('const overlaps = timelineData.overlaps;');
  console.log('console.log(`Timeline has ${gaps.length} significant gaps and ${overlaps.length} overlaps`);');
}

// Performance testing
function performanceTest() {
  console.log('\\n=== Performance Test ===');
  
  const dataProcessor = new DataProcessingService();
  
  // Generate larger dataset for performance testing
  const largeJobSet = Array.from({ length: 200 }, (_, i) => ({
    id: `job-${i}`,
    title: `Role ${i % 20}`,
    org: `Company ${Math.floor(i / 10)}`, // 20 companies, 10 jobs each
    date_start: `${2000 + Math.floor(i / 20)}-${String((i % 12) + 1).padStart(2, '0')}-01`,
    date_end: i < 199 ? `${2000 + Math.floor(i / 20) + 1}-${String((i % 12) + 1).padStart(2, '0')}-01` : null,
    skills: [`Skill${i % 30}`, `Tech${i % 25}`, `Tool${i % 15}`]
  }));
  
  const startTime = Date.now();
  const result = dataProcessor.generateCompanyTimeline(largeJobSet);
  const endTime = Date.now();
  
  console.log(`Processed ${largeJobSet.length} jobs into ${result.timeline.length} timeline blocks in ${endTime - startTime}ms`);
  console.log(`Career pattern identified: ${result.patterns.careerPattern}`);
  console.log(`Timeline insights generated: ${result.insights.length}`);
}

// Run the demonstration
await demonstrateTimelineGeneration();
showTimelineAPIUsage();
performanceTest();

export { demonstrateTimelineGeneration, showTimelineAPIUsage, performanceTest };