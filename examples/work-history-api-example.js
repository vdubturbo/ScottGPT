/**
 * Work History API Example
 * 
 * Demonstrates the enhanced GET /api/user/work-history endpoint
 * with company grouping and timeline features.
 */

// Mock API responses for demonstration

console.log('=== Work History API Enhanced Endpoint Demo ===\n');

// Example API calls and responses

console.log('1. STANDARD INDIVIDUAL VIEW (Backward Compatible)');
console.log('================================================');
console.log('GET /api/user/work-history');
console.log('\nResponse structure:');

const individualResponse = {
  success: true,
  data: {
    jobs: [
      {
        id: 'job-123',
        title: 'Principal Software Engineer',
        org: 'Microsoft',
        date_start: '2022-02-01',
        date_end: null,
        location: 'Seattle, WA',
        duration: 22,
        skills: ['C#', 'TypeScript', 'Azure', 'Leadership'],
        chunkCount: 8,
        skillsCount: 15
      },
      {
        id: 'job-124',
        title: 'Senior Software Engineer',
        org: 'Microsoft Corporation',
        date_start: '2020-04-01',
        date_end: '2022-01-31',
        location: 'Seattle, WA',
        duration: 22,
        skills: ['C#', 'JavaScript', 'Azure', 'React'],
        chunkCount: 6,
        skillsCount: 12
      }
    ],
    analytics: {
      totalJobs: 6,
      totalDurationMonths: 72,
      averageDurationMonths: 12,
      topSkills: [
        { skill: 'JavaScript', count: 4 },
        { skill: 'C#', count: 3 },
        { skill: 'Azure', count: 3 }
      ],
      organizations: 4,
      companies: {
        totalCompanies: 4,
        multiRoleCompanies: 2,
        longestTenure: { company: 'Microsoft', months: 44 },
        averageTenurePerCompany: 18,
        careerProgressions: [
          {
            company: 'Microsoft',
            pattern: 'strong_upward',
            promotions: [
              { from: 'Software Engineer', to: 'Senior Software Engineer' },
              { from: 'Senior Software Engineer', to: 'Principal Software Engineer' }
            ]
          }
        ]
      }
    },
    displayMode: 'individual'
  },
  features: {
    groupByCompany: false,
    includeTimeline: false,
    companyAnalytics: true,
    careerPatterns: false
  },
  timestamp: '2024-12-17T10:30:00Z'
};

console.log(JSON.stringify(individualResponse, null, 2));

console.log('\n\n2. COMPANY GROUPED VIEW');
console.log('=======================');
console.log('GET /api/user/work-history?groupByCompany=true');
console.log('\nResponse structure:');

const groupedResponse = {
  success: true,
  data: {
    jobs: [
      // Same individual jobs as above (for frontend flexibility)
    ],
    companies: [
      {
        company: 'Microsoft',
        normalizedName: 'microsoft',
        originalNames: ['Microsoft', 'Microsoft Corporation', 'Microsoft Corp'],
        totalPositions: 3,
        startDate: '2019-09-15',
        endDate: null,
        dateRange: '2019-09-15 - Present',
        totalTenure: '4 years 3 months',
        totalMonths: 51,
        careerPercentage: 70.8,
        
        positions: [
          {
            id: 'job-123',
            title: 'Principal Software Engineer',
            startDate: '2022-02-01',
            endDate: null,
            duration: 22,
            durationFormatted: '1 year 10 months',
            skills: ['C#', 'TypeScript', 'Azure', 'Leadership'],
            chunkCount: 8,
            isCurrentPosition: true
          },
          {
            id: 'job-124',
            title: 'Senior Software Engineer', 
            startDate: '2020-04-01',
            endDate: '2022-01-31',
            duration: 22,
            durationFormatted: '1 year 10 months',
            skills: ['C#', 'JavaScript', 'Azure', 'React'],
            chunkCount: 6,
            isCurrentPosition: false
          },
          {
            id: 'job-125',
            title: 'Software Engineer',
            startDate: '2019-09-15',
            endDate: '2021-03-31',
            duration: 18,
            durationFormatted: '1 year 6 months',
            skills: ['C#', 'JavaScript', 'SQL Server'],
            chunkCount: 5,
            isCurrentPosition: false
          }
        ],
        
        careerProgression: {
          pattern: 'strong_upward',
          progressionScore: 1.0,
          promotions: [
            {
              from: 'Software Engineer',
              to: 'Senior Software Engineer',
              date: '2020-04-01',
              indicators: ['Gained "Senior" designation', 'Title level increase detected']
            },
            {
              from: 'Senior Software Engineer', 
              to: 'Principal Software Engineer',
              date: '2022-02-01',
              indicators: ['Gained "Principal" designation', 'Title level increase detected']
            }
          ],
          promotionCount: 2,
          lateralMoves: 0,
          totalRoleChanges: 2
        },
        
        boomerangPattern: {
          isBoomerang: false,
          stints: 1,
          gaps: [],
          totalGapTime: null
        },
        
        skillsAnalysis: {
          totalSkills: 8,
          topSkills: [
            { skill: 'C#', count: 3 },
            { skill: 'Azure', count: 3 },
            { skill: 'JavaScript', count: 2 },
            { skill: 'TypeScript', count: 2 }
          ],
          skillCategories: {
            'Programming Languages': 4,
            'Cloud Platforms': 1,
            'Leadership': 1
          },
          skillEvolution: 2
        },
        
        insights: [
          'Held 3 different positions at this company',
          '2 promotions identified', 
          'Strong upward career trajectory'
        ],
        
        displayHints: {
          isHighlight: true,
          progressionLevel: 'high',
          stabilityLevel: 'high'
        }
      },
      
      {
        company: 'Google LLC',
        normalizedName: 'google',
        originalNames: ['Google LLC', 'Alphabet Inc'],
        totalPositions: 2,
        startDate: '2016-01-01',
        endDate: '2019-08-30',
        dateRange: '2016-01-01 - 2019-08-30',
        totalTenure: '2 years 5 months',
        totalMonths: 29,
        careerPercentage: 17.2,
        
        positions: [
          {
            id: 'job-126',
            title: 'Senior Software Engineer',
            startDate: '2018-03-01',
            endDate: '2019-08-30',
            duration: 18,
            durationFormatted: '1 year 6 months',
            skills: ['Python', 'Go', 'GCP', 'Machine Learning'],
            chunkCount: 7,
            isCurrentPosition: false
          },
          {
            id: 'job-127',
            title: 'Software Developer',
            startDate: '2016-01-01',
            endDate: '2018-02-28',
            duration: 26,
            durationFormatted: '2 years 2 months',
            skills: ['Python', 'Java', 'GCP'],
            chunkCount: 4,
            isCurrentPosition: false
          }
        ],
        
        careerProgression: {
          pattern: 'upward',
          progressionScore: 0.5,
          promotions: [
            {
              from: 'Software Developer',
              to: 'Senior Software Engineer',
              date: '2018-03-01',
              indicators: ['Gained "Senior" designation']
            }
          ],
          promotionCount: 1,
          lateralMoves: 0,
          totalRoleChanges: 1
        },
        
        boomerangPattern: {
          isBoomerang: false,
          stints: 1,
          gaps: [],
          totalGapTime: null
        },
        
        skillsAnalysis: {
          totalSkills: 5,
          topSkills: [
            { skill: 'Python', count: 2 },
            { skill: 'GCP', count: 2 },
            { skill: 'Java', count: 1 },
            { skill: 'Go', count: 1 }
          ],
          skillCategories: {
            'Programming Languages': 3,
            'Cloud Platforms': 1,
            'AI/ML': 1
          },
          skillEvolution: 1
        },
        
        insights: [
          'Held 2 different positions at this company',
          '1 promotion identified'
        ],
        
        displayHints: {
          isHighlight: false,
          progressionLevel: 'medium', 
          stabilityLevel: 'medium'
        }
      }
    ],
    
    companySummary: {
      totalCompanies: 4,
      companiesWithMultipleRoles: 2,
      boomerangCompanies: 0,
      companiesWithPromotions: 2,
      averageTenurePerCompany: 18,
      longestTenure: 51
    },
    
    analytics: {
      // Same as individual view, plus detailed company analytics
      companies: {
        totalCompanies: 4,
        multiRoleCompanies: 2,
        longestTenure: { company: 'Microsoft', months: 51, formatted: '4 years 3 months' },
        shortestTenure: { company: 'Startup Inc', months: 8, formatted: '8 months' },
        averageTenurePerCompany: 18,
        tenureDistribution: {
          shortTerm: 1,
          mediumTerm: 1, 
          longTerm: 2
        },
        
        careerProgressions: [
          {
            company: 'Microsoft',
            pattern: 'strong_upward',
            promotions: [
              { from: 'Software Engineer', to: 'Senior Software Engineer' },
              { from: 'Senior Software Engineer', to: 'Principal Software Engineer' }
            ]
          }
        ],
        
        loyaltyMetrics: {
          averageCompaniesPerYear: 0.6,
          companyRetentionScore: 0.5,
          careerStabilityIndex: 1.2
        }
      }
    },
    
    displayMode: 'grouped'
  },
  features: {
    groupByCompany: true,
    includeTimeline: false,
    companyAnalytics: true,
    careerPatterns: true
  },
  timestamp: '2024-12-17T10:30:00Z'
};

console.log(JSON.stringify(groupedResponse, null, 2));

console.log('\n\n3. FULL FEATURED VIEW WITH TIMELINE');
console.log('====================================');
console.log('GET /api/user/work-history?groupByCompany=true&includeTimeline=true');
console.log('\nAdds timeline data for visualization:');

const timelineData = {
  timeline: {
    blocks: [
      {
        company: 'Microsoft',
        startDate: '2019-09-15',
        endDate: null,
        totalMonths: 51,
        careerPercentage: 70.8,
        positions: [
          { title: 'Principal Software Engineer', start: '2022-02-01', end: null },
          { title: 'Senior Software Engineer', start: '2020-04-01', end: '2022-01-31' },
          { title: 'Software Engineer', start: '2019-09-15', end: '2021-03-31' }
        ],
        progression: {
          pattern: 'strong_upward',
          promotions: 2,
          progressionScore: 1.0
        },
        displayHints: {
          color: '#3498db',
          intensity: 0.85,
          isHighlight: true
        }
      }
    ],
    
    patterns: {
      longestTenure: 51,
      averageTenure: 18.0,
      jobHoppingScore: 0.25,
      progressionScore: 0.75,
      stabilityIndex: 0.78,
      careerPattern: 'stable_growth_career'
    },
    
    gaps: [
      {
        after: 'Google LLC',
        before: 'Microsoft',
        start: '2019-08-30',
        end: '2019-09-15', 
        duration: 16,
        durationFormatted: '16 days',
        type: 'short_gap'
      }
    ],
    
    overlaps: [],
    
    insights: [
      'Career spans 6.2 years across 4 companies',
      'Shows stable career growth with consistent advancement',
      'Longest tenure: 4 years - demonstrates commitment capability',
      'Above-average tenure (18 months) indicates loyalty and stability'
    ],
    
    metadata: {
      totalCompanies: 4,
      timelineSpan: '2016-01-01 - Present',
      generatedAt: '2024-12-17T10:30:00Z'
    }
  }
};

console.log(JSON.stringify(timelineData, null, 2));

console.log('\n\n4. API USAGE PATTERNS');
console.log('=====================');

console.log('// Standard backward-compatible call');
console.log('fetch("/api/user/work-history")');
console.log('  .then(res => res.json())');
console.log('  .then(data => {');
console.log('    // data.displayMode === "individual"');
console.log('    // Access jobs: data.data.jobs[]');
console.log('    // Basic analytics: data.data.analytics');
console.log('  });');
console.log('');

console.log('// Company-grouped view for career progression analysis');
console.log('fetch("/api/user/work-history?groupByCompany=true")');
console.log('  .then(res => res.json())');
console.log('  .then(data => {');
console.log('    // data.displayMode === "grouped"');
console.log('    // Access individual jobs: data.data.jobs[]');
console.log('    // Access company groups: data.data.companies[]');
console.log('    // Company summary: data.data.companySummary');
console.log('    // Enhanced analytics: data.data.analytics.companies');
console.log('  });');
console.log('');

console.log('// Full-featured view for timeline visualization');
console.log('fetch("/api/user/work-history?groupByCompany=true&includeTimeline=true")');
console.log('  .then(res => res.json())');
console.log('  .then(data => {');
console.log('    // All grouped features plus:');
console.log('    // Timeline blocks: data.data.timeline.blocks[]');
console.log('    // Career patterns: data.data.timeline.patterns');
console.log('    // Gap analysis: data.data.timeline.gaps[]');
console.log('    // Career insights: data.data.timeline.insights[]');
console.log('  });');
console.log('');

console.log('5. FRONTEND INTEGRATION PATTERNS');
console.log('=================================');

console.log('// React component example for switching views');
console.log(`
function WorkHistory() {
  const [groupByCompany, setGroupByCompany] = useState(false);
  const [includeTimeline, setIncludeTimeline] = useState(false);
  const [data, setData] = useState(null);

  const fetchWorkHistory = useCallback(async () => {
    const params = new URLSearchParams({
      ...(groupByCompany && { groupByCompany: 'true' }),
      ...(includeTimeline && { includeTimeline: 'true' })
    });
    
    const response = await fetch(\`/api/user/work-history?\${params}\`);
    const result = await response.json();
    setData(result.data);
  }, [groupByCompany, includeTimeline]);

  useEffect(() => {
    fetchWorkHistory();
  }, [fetchWorkHistory]);

  if (!data) return <Loading />;

  return (
    <div>
      <ViewToggle 
        groupByCompany={groupByCompany}
        onToggle={setGroupByCompany}
        includeTimeline={includeTimeline}
        onTimelineToggle={setIncludeTimeline}
      />
      
      {data.displayMode === 'grouped' ? (
        <CompanyGroupedView 
          companies={data.companies}
          summary={data.companySummary}
          timeline={data.timeline}
        />
      ) : (
        <IndividualJobsView 
          jobs={data.jobs}
          analytics={data.analytics}
        />
      )}
    </div>
  );
}
`);

console.log('\n6. KEY BENEFITS');
console.log('===============');
console.log('✅ Backward Compatibility: Existing frontend code continues to work');
console.log('✅ Progressive Enhancement: New features available via query parameters');
console.log('✅ Flexible Display: Frontend can choose individual or grouped view');
console.log('✅ Rich Analytics: Company-level insights and career pattern analysis');
console.log('✅ Timeline Support: Visualization-ready data with gaps and overlaps');
console.log('✅ Error Resilience: Graceful fallback if grouping/timeline fails');
console.log('✅ Performance Optimized: Timeline data only when requested');

console.log('\n✅ Work History API Enhancement Complete!');
console.log('\nThe endpoint now supports:');
console.log('• Individual job view (default, backward compatible)');
console.log('• Company-grouped view with career progression analysis'); 
console.log('• Timeline data for career visualization');
console.log('• Comprehensive company analytics');
console.log('• Career pattern classification');
console.log('• Boomerang employee detection');
console.log('• Skills evolution tracking');