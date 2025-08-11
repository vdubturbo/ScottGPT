import { supabase } from './config/database.js';

async function checkOLDPContext() {
  console.log('=== CHECKING OLDP/OPERATIONS MANAGER RELATIONSHIP ===');
  
  try {
    // Check Operations Manager content
    const { data: opsManager, error } = await supabase
      .from('content_chunks')
      .select(`
        id, title, content,
        sources (title, org, date_start, date_end)
      `)
      .ilike('title', '%operations manager%')
      .limit(5);
    
    if (!error && opsManager) {
      console.log(`📋 Operations Manager chunks: ${opsManager.length}`);
      opsManager.forEach((chunk, i) => {
        console.log(`\n${i+1}. ${chunk.sources?.org} | ${chunk.title}`);
        console.log(`   Dates: ${chunk.sources?.date_start} to ${chunk.sources?.date_end || 'present'}`);
        
        // Check if content mentions OLDP
        if (chunk.content) {
          const hasOLDP = chunk.content.toLowerCase().includes('oldp') || 
                         chunk.content.toLowerCase().includes('operations leadership development');
          console.log(`   Mentions OLDP: ${hasOLDP}`);
          
          if (hasOLDP) {
            const preview = chunk.content.substring(0, 200).replace(/\n/g, ' ');
            console.log(`   Content: ${preview}...`);
          } else {
            const preview = chunk.content.substring(0, 150).replace(/\n/g, ' ');
            console.log(`   Content preview: ${preview}...`);
          }
        }
      });
    }
    
    // Check OLDP chunks
    console.log('\n=== OLDP CHUNKS ===');
    const { data: oldpChunks, error: oldpError } = await supabase
      .from('content_chunks')
      .select(`
        id, title, content,
        sources (title, org, date_start, date_end)
      `)
      .or('title.ilike.%oldp%,title.ilike.%operations leadership development%')
      .limit(5);
      
    if (!oldpError && oldpChunks) {
      console.log(`📋 OLDP-titled chunks: ${oldpChunks.length}`);
      oldpChunks.forEach((chunk, i) => {
        console.log(`\n${i+1}. ${chunk.sources?.org} | ${chunk.title}`);
        console.log(`   Dates: ${chunk.sources?.date_start} to ${chunk.sources?.date_end || 'present'}`);
        const preview = chunk.content.substring(0, 150).replace(/\n/g, ' ');
        console.log(`   Content: ${preview}...`);
      });
    }
    
    // Check all Lockheed Martin roles
    console.log('\n=== ALL LOCKHEED MARTIN ROLES ===');
    const { data: lmRoles, error: lmError } = await supabase
      .from('sources')
      .select('*')
      .ilike('org', '%lockheed%')
      .order('date_start', { ascending: true });
      
    if (!lmError && lmRoles) {
      console.log(`📋 Lockheed Martin roles: ${lmRoles.length}`);
      lmRoles.forEach((role, i) => {
        console.log(`${i+1}. ${role.title} (${role.date_start} to ${role.date_end || 'present'})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error);
  }
}

checkOLDPContext();