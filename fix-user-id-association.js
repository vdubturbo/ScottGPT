#!/usr/bin/env node

import { supabase } from './config/database.js';

async function fixUserIdAssociation() {
  console.log('🔧 Fixing user_id association for Scott\'s data...\n');
  
  try {
    const wrongUserId = '345850e8-4f02-48cb-9789-d40e9cc3ee8e';
    const scottUserId = 'b2ad8c5e-6ea6-4959-9df2-7b8a4c7e5f6a';
    
    // First, check what we're working with
    console.log('1️⃣ Checking current data distribution...');
    const beforeStats = await supabase
      .from('content_chunks')
      .select('user_id, id')
      .in('user_id', [wrongUserId, scottUserId]);
      
    if (beforeStats.error) {
      console.error('❌ Stats query failed:', beforeStats.error);
      return;
    }
    
    const wrongUserChunks = beforeStats.data?.filter(c => c.user_id === wrongUserId) || [];
    const scottChunks = beforeStats.data?.filter(c => c.user_id === scottUserId) || [];
    
    console.log(`   Wrong user ID (${wrongUserId}): ${wrongUserChunks.length} chunks`);
    console.log(`   Scott's user ID (${scottUserId}): ${scottChunks.length} chunks`);
    
    if (wrongUserChunks.length === 0) {
      console.log('✅ No chunks found with wrong user_id. Nothing to fix!');
      return;
    }
    
    // Update chunks to Scott's user_id
    console.log(`\n2️⃣ Updating ${wrongUserChunks.length} chunks to Scott's user_id...`);
    const updateResult = await supabase
      .from('content_chunks')
      .update({ user_id: scottUserId })
      .eq('user_id', wrongUserId);
      
    if (updateResult.error) {
      console.error('❌ Update failed:', updateResult.error);
      return;
    }
    
    console.log(`✅ Updated ${updateResult.count || wrongUserChunks.length} chunks successfully`);
    
    // Also check and fix sources table if needed
    console.log('\n3️⃣ Checking sources table...');
    const sourcesStats = await supabase
      .from('sources')
      .select('user_id, id')
      .in('user_id', [wrongUserId, scottUserId]);
      
    if (sourcesStats.error) {
      console.log('⚠️ Sources stats query failed:', sourcesStats.error);
    } else {
      const wrongUserSources = sourcesStats.data?.filter(s => s.user_id === wrongUserId) || [];
      const scottSources = sourcesStats.data?.filter(s => s.user_id === scottUserId) || [];
      
      console.log(`   Wrong user ID sources: ${wrongUserSources.length}`);
      console.log(`   Scott's user ID sources: ${scottSources.length}`);
      
      if (wrongUserSources.length > 0) {
        console.log(`   Updating ${wrongUserSources.length} sources to Scott's user_id...`);
        const updateSourcesResult = await supabase
          .from('sources')
          .update({ user_id: scottUserId })
          .eq('user_id', wrongUserId);
          
        if (updateSourcesResult.error) {
          console.log('⚠️ Sources update failed:', updateSourcesResult.error);
        } else {
          console.log(`   ✅ Updated ${updateSourcesResult.count || wrongUserSources.length} sources`);
        }
      }
    }
    
    // Verify the fix
    console.log('\n4️⃣ Verifying the fix...');
    const afterStats = await supabase
      .from('content_chunks')
      .select('user_id, id')
      .eq('user_id', scottUserId);
      
    if (afterStats.error) {
      console.error('❌ Verification query failed:', afterStats.error);
      return;
    }
    
    console.log(`✅ Final verification: ${afterStats.data?.length || 0} chunks now belong to Scott's user_id`);
    
    if (afterStats.data?.length > 0) {
      console.log('\n🎉 User ID association fixed! Now chunks will be found during pgvector search.');
      console.log('💡 Next step: Generate embeddings for these chunks to enable semantic search.');
    }
    
  } catch (error) {
    console.error('❌ Fix script error:', error);
  }
}

fixUserIdAssociation().finally(() => process.exit(0));