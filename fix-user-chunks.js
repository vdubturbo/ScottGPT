// Fix the missing user_id on existing chunks
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function fixUserChunks() {
  console.log('🔧 Fixing missing user_id on chunks...\n');
  
  // First, find the correct user table and slovett user
  console.log('1. Looking for slovett user...');
  
  // Try user_profiles first
  let user = null;
  const { data: userProfiles, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .limit(5);
  
  if (profileError) {
    console.log('   user_profiles error:', profileError.message);
  } else {
    console.log('   user_profiles found:', userProfiles?.length || 0, 'records');
    if (userProfiles && userProfiles.length > 0) {
      console.log('   Sample user_profiles columns:', Object.keys(userProfiles[0]));
      // Look for slovett-like entries
      const slovettUser = userProfiles.find(u => 
        u.username?.includes('slovett') || 
        u.name?.includes('slovett') || 
        u.email?.includes('slovett') ||
        JSON.stringify(u).toLowerCase().includes('slovett')
      );
      if (slovettUser) {
        user = slovettUser;
        console.log('   ✅ Found slovett in user_profiles:', user);
      }
    }
  }
  
  // If not found, try other possible tables
  if (!user) {
    console.log('   Trying other possible user tables...');
    
    // Try profiles table
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .limit(5)
      .catch(() => ({ data: null, error: 'table not found' }));
    
    if (!profilesError && profiles) {
      console.log('   profiles table found with', profiles.length, 'records');
      console.log('   Sample profiles columns:', Object.keys(profiles[0] || {}));
    }
    
    // Try users table
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .limit(5)
      .catch(() => ({ data: null, error: 'table not found' }));
    
    if (!usersError && users) {
      console.log('   users table found with', users.length, 'records');
    }
  }
  
  // If we found a user, update the chunks
  if (user && user.id) {
    console.log(`\n2. Updating chunks to belong to user ${user.id}...`);
    
    // Count chunks that need updating
    const { count: nullChunks, error: countError } = await supabase
      .from('content_chunks')
      .select('*', { count: 'exact', head: true })
      .is('user_id', null);
    
    if (countError) {
      console.error('   Error counting chunks:', countError);
      return;
    }
    
    console.log(`   Found ${nullChunks} chunks with user_id = null`);
    
    if (nullChunks > 0) {
      const { data: updateResult, error: updateError } = await supabase
        .from('content_chunks')
        .update({ user_id: user.id })
        .is('user_id', null)
        .select('id');
      
      if (updateError) {
        console.error('   ❌ Error updating chunks:', updateError);
      } else {
        console.log(`   ✅ Updated ${updateResult?.length || 0} chunks to belong to user ${user.id}`);
      }
    }
  } else {
    console.log('\n❌ Could not find slovett user. Need to create user first.');
    console.log('   Available tables to check:');
    
    // List all tables
    const { data: tables, error: tablesError } = await supabase
      .rpc('get_table_names')
      .catch(() => ({ data: null, error: 'function not available' }));
    
    if (!tablesError && tables) {
      console.log('   Tables:', tables);
    }
    
    // Create a basic user for slovett if needed
    console.log('\n3. Creating slovett user...');
    
    const { data: newUser, error: createError } = await supabase
      .from('user_profiles')
      .insert({
        username: 'slovett',
        name: 'Scott Lovett',
        email: 'scott@example.com',
        visibility: 'public'
      })
      .select()
      .single()
      .catch(() => ({ data: null, error: 'Could not create user' }));
    
    if (createError) {
      console.error('   Error creating user:', createError);
    } else if (newUser) {
      console.log('   ✅ Created user:', newUser);
      
      // Now update chunks
      const { data: updateResult, error: updateError } = await supabase
        .from('content_chunks')
        .update({ user_id: newUser.id })
        .is('user_id', null)
        .select('id');
      
      if (updateError) {
        console.error('   ❌ Error updating chunks:', updateError);
      } else {
        console.log(`   ✅ Updated ${updateResult?.length || 0} chunks to belong to new user`);
      }
    }
  }
  
  // Verify the fix
  console.log('\n4. Verifying fix...');
  const { count: remainingNull, error: verifyError } = await supabase
    .from('content_chunks')
    .select('*', { count: 'exact', head: true })
    .is('user_id', null);
  
  if (!verifyError) {
    console.log(`   Remaining chunks with user_id = null: ${remainingNull}`);
  }
  
  const { count: totalChunks, error: totalError } = await supabase
    .from('content_chunks')
    .select('*', { count: 'exact', head: true });
  
  if (!totalError) {
    console.log(`   Total chunks: ${totalChunks}`);
  }
}

fixUserChunks();