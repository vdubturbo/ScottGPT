import OpenAI from 'openai';
import 'dotenv/config';

async function diagnoseAPIPerformance() {
  console.log('🔍 OpenAI API Performance Diagnostic');
  console.log('=====================================');
  
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  // Test 1: Simple request
  console.log('\n1️⃣ Testing simple request...');
  const simpleStart = Date.now();
  try {
    await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Say hello' }],
      max_tokens: 10
    });
    console.log(`✅ Simple request: ${Date.now() - simpleStart}ms`);
  } catch (error) {
    console.log(`❌ Simple request failed: ${error.message}`);
  }
  
  // Test 2: Medium-sized request (similar to resume content)
  console.log('\n2️⃣ Testing medium-sized request...');
  const mediumContent = 'A'.repeat(2000); // 2KB of content
  const mediumStart = Date.now();
  try {
    await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `Analyze this content: ${mediumContent}` }],
      max_tokens: 500,
      temperature: 0.2
    });
    console.log(`✅ Medium request: ${Date.now() - mediumStart}ms`);
  } catch (error) {
    console.log(`❌ Medium request failed: ${error.message}`);
  }
  
  // Test 3: Check if streaming would be faster
  console.log('\n3️⃣ Testing streaming response...');
  const streamStart = Date.now();
  try {
    const stream = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Write a brief job description' }],
      max_tokens: 200,
      stream: true
    });
    
    let firstChunkTime = null;
    for await (const chunk of stream) {
      if (!firstChunkTime) {
        firstChunkTime = Date.now() - streamStart;
        console.log(`⚡ First chunk received: ${firstChunkTime}ms`);
      }
    }
    console.log(`✅ Complete stream: ${Date.now() - streamStart}ms`);
  } catch (error) {
    console.log(`❌ Streaming failed: ${error.message}`);
  }
  
  // Test 4: Check account limits
  console.log('\n4️⃣ Checking account information...');
  try {
    // Note: This endpoint may not be available for all API keys
    const models = await client.models.list();
    console.log(`✅ Account active, ${models.data.length} models available`);
    
    // Check if we have access to faster models
    const hasGPT4 = models.data.some(m => m.id.includes('gpt-4'));
    const hasGPT4Turbo = models.data.some(m => m.id.includes('gpt-4-turbo'));
    console.log(`   GPT-4 access: ${hasGPT4 ? 'Yes' : 'No'}`);
    console.log(`   GPT-4 Turbo access: ${hasGPT4Turbo ? 'Yes' : 'No'}`);
  } catch (error) {
    console.log(`⚠️ Cannot check account info: ${error.message}`);
  }
  
  console.log('\n📊 Performance Analysis:');
  console.log('- Normal API calls should be 1-5 seconds');
  console.log('- 10+ seconds suggests network or account issues');
  console.log('- Streaming can reduce perceived latency');
  console.log('- Consider switching models if latency persists');
}

diagnoseAPIPerformance().catch(console.error);