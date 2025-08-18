/**
 * Company-Grouped Data Export Example
 * 
 * Demonstrates the enhanced resume export functionality with company grouping,
 * career progression analysis, and hierarchical resume formatting.
 */

import { DataExportService } from '../services/data-export.js';

// Example job data with multiple positions at the same companies
const mockJobData = [
  // Microsoft - Career progression
  {
    id: 'ms-engineer',
    title: 'Software Engineer',
    organization: 'Microsoft Corp',
    startDate: '2018-06-01',
    endDate: '2020-03-31',
    duration: '1 year 10 months',
    skills: ['C#', 'JavaScript', 'SQL Server', 'Azure'],
    keyAchievements: [
      'Built microservices architecture serving 1M+ users',
      'Reduced deployment time by 40% through automation',
      'Mentored 3 junior developers'
    ],
    isCurrentPosition: false
  },
  {
    id: 'ms-senior',
    title: 'Senior Software Engineer',
    organization: 'Microsoft Corporation', // Slight variation
    startDate: '2020-04-01',
    endDate: '2022-01-31',
    duration: '1 year 10 months',
    skills: ['C#', 'JavaScript', 'TypeScript', 'Azure', 'React', 'Node.js'],
    keyAchievements: [
      'Led team of 5 engineers on critical product features',
      'Architected scalable API serving 10M+ requests/day',
      'Improved system performance by 60%'
    ],
    isCurrentPosition: false
  },
  {
    id: 'ms-principal',
    title: 'Principal Software Engineer',
    organization: 'Microsoft', // Another variation
    startDate: '2022-02-01',
    endDate: null,
    duration: '2 years 8 months',
    skills: ['C#', 'JavaScript', 'TypeScript', 'Azure', 'React', 'Node.js', 'Leadership', 'Architecture'],
    keyAchievements: [
      'Technical lead for cross-functional initiatives',
      'Established engineering best practices across teams',
      'Drove adoption of cloud-native architecture'
    ],
    isCurrentPosition: true
  },
  
  // Google - Boomerang pattern
  {
    id: 'google-dev1',
    title: 'Software Developer',
    organization: 'Google Inc',
    startDate: '2016-01-01',
    endDate: '2017-12-31',
    duration: '2 years',
    skills: ['Python', 'Java', 'GCP', 'TensorFlow'],
    keyAchievements: [
      'Developed ML models for search ranking',
      'Optimized data processing pipelines',
      'Contributed to open-source TensorFlow'
    ],
    isCurrentPosition: false
  },
  {
    id: 'google-senior',
    title: 'Senior Software Engineer',
    organization: 'Alphabet Inc', // Parent company
    startDate: '2023-03-01',
    endDate: null,
    duration: '1 year 7 months',
    skills: ['Python', 'Go', 'Kubernetes', 'GCP', 'Machine Learning', 'TensorFlow'],
    keyAchievements: [
      'Built distributed ML training infrastructure',
      'Reduced model training time by 50%',
      'Led AI ethics initiative'
    ],
    isCurrentPosition: true
  },
  
  // Amazon - Single position
  {
    id: 'amazon-architect',
    title: 'Solutions Architect',
    organization: 'Amazon Web Services',
    startDate: '2019-01-01',
    endDate: '2020-05-31',
    duration: '1 year 5 months',
    skills: ['AWS', 'Python', 'Terraform', 'Docker', 'Kubernetes'],
    keyAchievements: [
      'Designed cloud architecture for Fortune 500 clients',
      'Generated $2M+ in new AWS revenue',
      'Achieved AWS Solutions Architect Professional certification'
    ],
    isCurrentPosition: false
  }
];

async function demonstrateCompanyGroupedExport() {
  console.log('=== Company-Grouped Resume Export Demo ===\n');
  
  const exportService = new DataExportService();
  
  try {
    // Mock the supabase call to return our example data
    // (In real usage, this would come from the database)
    const mockSupabaseResponse = { data: mockJobData, error: null };
    
    // Test 1: Standard resume data with company grouping
    console.log('1. Enhanced Resume Data with Company Grouping:');
    console.log('---------------------------------------------');
    
    // This would normally call the database, but we'll simulate the structure
    const standardResumeData = {
      metadata: {
        exportFormat: 'resume-data',
        includesCompanyGrouping: true,
        totalJobs: mockJobData.length
      },
      positions: mockJobData,
      companyGroups: [
        {
          name: 'microsoft',
          originalNames: ['Microsoft Corp', 'Microsoft Corporation', 'Microsoft'],
          totalTenure: '5 years 6 months',
          positionCount: 3,
          careerProgression: 'strong_upward',
          isBoomerang: false,
          keySkills: ['C#', 'JavaScript', 'TypeScript', 'Azure', 'React', 'Leadership'],
          insights: ['Held 3 different positions at this company', '2 promotions identified', 'Strong upward career trajectory']
        },
        {
          name: 'google',
          originalNames: ['Google Inc', 'Alphabet Inc'],
          totalTenure: '3 years 7 months',
          positionCount: 2,
          careerProgression: 'upward',
          isBoomerang: true,
          keySkills: ['Python', 'Java', 'GCP', 'TensorFlow', 'Machine Learning'],
          insights: ['Boomerang employee: 2 separate employment periods', '1 promotion identified']
        }
      ]
    };
    
    console.log('Standard Export with Company Groups:');
    console.log(`- Total Jobs: ${standardResumeData.metadata.totalJobs}`);
    console.log(`- Companies: ${standardResumeData.companyGroups.length}`);
    standardResumeData.companyGroups.forEach(company => {
      console.log(`  • ${company.originalNames[0]}: ${company.totalTenure}, ${company.positionCount} positions`);
      console.log(`    Career Pattern: ${company.careerProgression}${company.isBoomerang ? ' (Boomerang)' : ''}`);
      console.log(`    Key Skills: ${company.keySkills.slice(0, 5).join(', ')}`);
    });
    
    console.log('\n2. Company-Grouped Resume Format:');
    console.log('----------------------------------');
    
    // Simulate the company-grouped export structure
    const companyGroupedData = {
      metadata: {
        exportFormat: 'resume-data-grouped',
        totalCompanies: 3,
        totalPositions: 6
      },
      companies: [
        {
          name: 'Microsoft',
          normalizedName: 'microsoft',
          totalTenure: '5 years 6 months',
          positionCount: 3,
          positions: [
            { title: 'Principal Software Engineer', startDate: '2022-02-01', endDate: null },
            { title: 'Senior Software Engineer', startDate: '2020-04-01', endDate: '2022-01-31' },
            { title: 'Software Engineer', startDate: '2018-06-01', endDate: '2020-03-31' }
          ],
          careerProgression: {
            pattern: 'strong_upward',
            promotions: [
              { from: 'Software Engineer', to: 'Senior Software Engineer', date: '2020-04-01' },
              { from: 'Senior Software Engineer', to: 'Principal Software Engineer', date: '2022-02-01' }
            ]
          },
          skills: {
            byFrequency: [
              { skill: 'JavaScript', frequency: 3 },
              { skill: 'C#', frequency: 3 },
              { skill: 'Azure', frequency: 3 },
              { skill: 'TypeScript', frequency: 2 }
            ]
          },
          displayFormat: {
            header: 'Microsoft (2018 - Present, 5 years 6 months)',
            positions: [
              '├── Principal Software Engineer (Feb 2022 - Present)',
              '├── Senior Software Engineer (Apr 2020 - Jan 2022)',
              '└── Software Engineer (Jun 2018 - Mar 2020)'
            ],
            skills: 'Skills: [JavaScript, C#, Azure, TypeScript, React, Node.js, Leadership, Architecture]'
          }
        }
      ],
      resumeTemplates: {
        hierarchical: {
          title: 'Company-Grouped Resume Format',
          sections: []
        }
      }
    };
    
    // Display hierarchical format
    companyGroupedData.companies.forEach(company => {
      console.log(company.displayFormat.header);
      company.displayFormat.positions.forEach(position => {
        console.log(position);
      });
      console.log(company.displayFormat.skills);
      
      if (company.careerProgression.promotions.length > 0) {
        console.log('Career Progression:');
        company.careerProgression.promotions.forEach(promo => {
          console.log(`  • ${promo.from} → ${promo.to} (${promo.date})`);
        });
      }
      console.log('');
    });
    
    console.log('3. Template Formats Available:');
    console.log('------------------------------');
    console.log('✓ Hierarchical: Company-grouped with career progression');
    console.log('✓ Chronological: Traditional format with company context');
    console.log('✓ Skills-based: Organized by skill categories');
    
    console.log('\n4. Export Options Supported:');
    console.log('-----------------------------');
    console.log('• maxCompanies: Limit number of companies included');
    console.log('• minCompanyTenureMonths: Filter out short-term positions');
    console.log('• includeProgressionDetails: Include detailed career progression analysis');
    console.log('• includeBoomerangAnalysis: Include boomerang employment pattern analysis');
    console.log('• skillLimit: Maximum number of skills to include');
    console.log('• showCompanyInsights: Include AI-generated company insights');
    
    console.log('\n5. Cross-Company Career Insights:');
    console.log('---------------------------------');
    const insights = [
      'Career growth within organizations: 2 companies with multiple positions',
      'Boomerang career pattern: Returned to 1 company',
      'Career advancement: 3 promotions across 2 companies',
      'Long-term commitment: 2 companies with 3+ year tenure',
      'Continuous learning: Skill evolution demonstrated across 3 companies'
    ];
    
    insights.forEach(insight => console.log(`• ${insight}`));
    
    console.log('\n✅ Company-Grouped Resume Export Demo Complete!');
    console.log('\nKey Benefits:');
    console.log('• Shows career progression within companies');
    console.log('• Identifies boomerang employment patterns'); 
    console.log('• Aggregates skills and achievements by company');
    console.log('• Provides multiple resume format templates');
    console.log('• Maintains backward compatibility');
    console.log('• Generates actionable career insights');
    
  } catch (error) {
    console.error('Demo error:', error.message);
  }
}

// API Usage Examples
function showAPIUsageExamples() {
  console.log('\n=== API Usage Examples ===\n');
  
  console.log('// Enhanced existing export (backward compatible)');
  console.log('const resumeData = await exportService.exportResumeData();');
  console.log('// Now includes companyGroups array with insights\n');
  
  console.log('// New company-grouped export');
  console.log('const groupedData = await exportService.exportResumeDataGrouped({');
  console.log('  maxCompanies: 5,');
  console.log('  minCompanyTenureMonths: 6,');
  console.log('  includeProgressionDetails: true,');
  console.log('  includeBoomerangAnalysis: true');
  console.log('});\n');
  
  console.log('// Access hierarchical resume template');
  console.log('const template = groupedData.resumeTemplates.hierarchical;');
  console.log('template.sections.forEach(section => {');
  console.log('  console.log(section.companyHeader.formatted);');
  console.log('  section.positions.forEach(pos => console.log(pos.formatted));');
  console.log('});\n');
  
  console.log('// Preview functionality');
  console.log('const preview = await exportService.generateExportPreview(');
  console.log('  \'resumeDataGrouped\', { maxCompanies: 3 }');
  console.log(');');
}

// Run the demonstration
await demonstrateCompanyGroupedExport();
showAPIUsageExamples();

export { demonstrateCompanyGroupedExport, showAPIUsageExamples };