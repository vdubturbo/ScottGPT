import { db, supabase } from './config/database.js';

async function generateDataSummary() {
  try {
    console.log('📊 Generating comprehensive data summary...\n');

    // Get basic stats
    const stats = await db.getStats();
    console.log('=== BASIC STATISTICS ===');
    console.log(`Total Sources: ${stats.total_sources}`);
    console.log(`Total Chunks: ${stats.total_chunks}\n`);

    // Get detailed source breakdown
    console.log('=== SOURCES BY TYPE ===');
    const { data: sources } = await supabase
      .from('sources')
      .select('id, type, title, org, date_start, date_end, industry_tags, created_at')
      .order('created_at', { ascending: false });

    const sourcesByType = sources.reduce((acc, source) => {
      acc[source.type] = acc[source.type] || [];
      acc[source.type].push(source);
      return acc;
    }, {});

    Object.entries(sourcesByType).forEach(([type, typeData]) => {
      console.log(`\n📂 ${type.toUpperCase()} (${typeData.length} items):`);
      typeData.forEach(item => {
        const dateRange = item.date_start ? 
          `${new Date(item.date_start).getFullYear()}${item.date_end ? `-${new Date(item.date_end).getFullYear()}` : '-Present'}` :
          'No dates';
        console.log(`  • ${item.title}${item.org ? ` (${item.org})` : ''} [${dateRange}]`);
        if (item.industry_tags && item.industry_tags.length > 0) {
          console.log(`    Tags: ${item.industry_tags.join(', ')}`);
        }
      });
    });

    // Get skills analysis
    console.log('\n=== SKILLS COVERAGE ===');
    const { data: chunks } = await supabase
      .from('content_chunks')
      .select('skills, tags');

    const skillCounts = {};
    const tagCounts = {};

    chunks.forEach(chunk => {
      if (chunk.skills) {
        chunk.skills.forEach(skill => {
          skillCounts[skill] = (skillCounts[skill] || 0) + 1;
        });
      }
      if (chunk.tags) {
        chunk.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    console.log('\n🎯 Top Skills (by frequency):');
    Object.entries(skillCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 15)
      .forEach(([skill, count]) => {
        console.log(`  • ${skill}: ${count} mentions`);
      });

    console.log('\n🏷️  Industry Tags:');
    Object.entries(tagCounts)
      .sort(([,a], [,b]) => b - a)
      .forEach(([tag, count]) => {
        console.log(`  • ${tag}: ${count} mentions`);
      });

    // Timeline analysis
    console.log('\n=== TIMELINE COVERAGE ===');
    const timelineSources = sources
      .filter(s => s.date_start)
      .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));

    if (timelineSources.length > 0) {
      const earliest = new Date(timelineSources[0].date_start).getFullYear();
      const latest = timelineSources[timelineSources.length - 1].date_end ? 
        new Date(timelineSources[timelineSources.length - 1].date_end).getFullYear() :
        'Present';
      
      console.log(`📅 Career span: ${earliest} - ${latest}`);
      
      // Group by decade/period
      const periods = {
        '2010s (2010-2019)': timelineSources.filter(s => {
          const year = new Date(s.date_start).getFullYear();
          return year >= 2010 && year < 2020;
        }),
        '2020s (2020-Present)': timelineSources.filter(s => {
          const year = new Date(s.date_start).getFullYear();
          return year >= 2020;
        })
      };

      Object.entries(periods).forEach(([period, items]) => {
        if (items.length > 0) {
          console.log(`\n📆 ${period}: ${items.length} experiences`);
          items.forEach(item => {
            console.log(`  • ${item.title} (${item.org || 'No org'})`);
          });
        }
      });
    }

    // Company analysis
    console.log('\n=== COMPANY COVERAGE ===');
    const companies = {};
    sources.forEach(source => {
      if (source.org) {
        companies[source.org] = companies[source.org] || [];
        companies[source.org].push(source);
      }
    });

    console.log('🏢 Companies represented:');
    Object.entries(companies)
      .sort(([,a], [,b]) => b.length - a.length)
      .forEach(([company, experiences]) => {
        console.log(`  • ${company}: ${experiences.length} experience${experiences.length > 1 ? 's' : ''}`);
        experiences.forEach(exp => {
          console.log(`    - ${exp.title}`);
        });
      });

    // Content density analysis
    console.log('\n=== CONTENT DENSITY ===');
    const { data: chunkStats } = await supabase
      .from('content_chunks')
      .select('token_count, source_id, sources(title, org)');

    const sourceTokens = {};
    chunkStats.forEach(chunk => {
      const sourceKey = chunk.sources?.title || chunk.source_id;
      sourceTokens[sourceKey] = (sourceTokens[sourceKey] || 0) + (chunk.token_count || 0);
    });

    console.log('📝 Content richness (by token count):');
    Object.entries(sourceTokens)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .forEach(([source, tokens]) => {
        console.log(`  • ${source}: ${tokens} tokens (${Math.round(tokens/4)} words approx)`);
      });

    // Gap analysis
    console.log('\n=== GAP ANALYSIS & RECOMMENDATIONS ===');
    
    console.log('\n🎯 WHAT TO UPLOAD NEXT:');
    
    // Check for missing story content
    const hasDetailedStories = sources.some(s => 
      s.title.toLowerCase().includes('story') || 
      s.title.toLowerCase().includes('crisis') ||
      s.title.toLowerCase().includes('challenge')
    );
    
    if (!hasDetailedStories) {
      console.log('  📖 PRIORITY: Detailed project stories and narratives');
      console.log('    - Crisis management stories');
      console.log('    - Project rescue experiences'); 
      console.log('    - Technical implementation challenges');
      console.log('    - Leadership moments and decisions');
    }

    // Check for missing recent experiences
    const recentSources = sources.filter(s => {
      if (!s.date_start) return false;
      const year = new Date(s.date_start).getFullYear();
      return year >= 2023;
    });

    if (recentSources.length < 3) {
      console.log('  📅 PRIORITY: More recent experiences (2023-2024)');
      console.log('    - Current projects and ongoing work');
      console.log('    - Recent accomplishments and metrics');
      console.log('    - New technologies and methodologies learned');
    }

    // Check for missing industries
    const industries = new Set();
    sources.forEach(s => {
      if (s.industry_tags) {
        s.industry_tags.forEach(tag => industries.add(tag));
      }
    });

    const commonIndustries = ['Healthcare', 'Government', 'Financial Services', 'Technology', 'Retail'];
    const missingIndustries = commonIndustries.filter(ind => !industries.has(ind));
    
    if (missingIndustries.length > 0) {
      console.log('  🏭 CONSIDER: Additional industry experience');
      console.log(`    - Missing: ${missingIndustries.join(', ')}`);
    }

    // Check for technical depth
    const technicalSkills = Object.keys(skillCounts).filter(skill => 
      ['AI/ML', 'IoT', 'Cloud Computing', 'Cybersecurity', 'Data Engineering'].includes(skill)
    );

    if (technicalSkills.length < 3) {
      console.log('  🔧 CONSIDER: More technical deep-dives');
      console.log('    - Architecture decisions and trade-offs');
      console.log('    - Technology selection processes');
      console.log('    - Technical problem-solving examples');
    }

    console.log('\n✅ WHAT YOU HAVE WELL COVERED:');
    const wellCovered = [];
    if (Object.keys(skillCounts).includes('Program Management')) {
      wellCovered.push('Program/Project Management experience');
    }
    if (Object.keys(companies).length >= 5) {
      wellCovered.push('Diverse company experience');
    }
    if (industries.has('Government') && industries.has('Healthcare')) {
      wellCovered.push('Regulated industry experience');
    }
    
    wellCovered.forEach(item => console.log(`  ✓ ${item}`));

    console.log('\n🎪 SUGGESTED NEXT UPLOADS:');
    console.log('  1. "Project Crisis Stories.docx" - Detailed narratives of challenging projects');
    console.log('  2. "Recent Wins 2024.docx" - Latest accomplishments and metrics');
    console.log('  3. "Technical Deep Dives.docx" - Architecture decisions and implementation details');
    console.log('  4. "Leadership Moments.docx" - Team building and stakeholder management stories');
    console.log('  5. "Lessons Learned.docx" - What you\'d do differently and key insights');

    console.log('\n' + '='.repeat(80));
    console.log('Summary complete! Use this analysis to decide what content would add the most value.');

  } catch (error) {
    console.error('Error generating summary:', error);
  }
}

generateDataSummary();
