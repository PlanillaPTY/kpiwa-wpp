const wpp = require('./wpp-playground.js');

async function testDefaultTokenStorage() {
  console.log('🧪 Testing WPPConnect with default Chrome-based token storage...\n');

  try {
    // Test 1: List existing sessions
    console.log('1️⃣ Testing listSessions():');
    const sessions = await wpp.listSessions();
    console.log('   Sessions found:', sessions);
    console.log('   Session count:', sessions.length);

    // Test 2: Check if tokens directory exists
    console.log('\n2️⃣ Checking tokens directory:');
    const fs = require('fs');
    const path = require('path');
    const tokensDir = path.join(__dirname, 'tokens');
    
    if (fs.existsSync(tokensDir)) {
      const files = fs.readdirSync(tokensDir, { recursive: true });
      console.log('   Tokens directory exists');
      console.log('   Total files/folders:', files.length);
      console.log('   Sample items:', files.slice(0, 5));
    } else {
      console.log('   Tokens directory does not exist (will be created on first session)');
    }

    // Test 3: Get status of all sessions
    console.log('\n3️⃣ Testing getAllSessionsStatus():');
    const sessionStatuses = await wpp.getAllSessionsStatus();
    sessionStatuses.forEach((status, index) => {
      const icon = status.isConnected ? '🟢' : status.isCached ? '🟡' : status.exists ? '🔵' : '⚪';
      console.log(`   ${index + 1}. ${icon} ${status.sessionName}: ${status.status}`);
    });

    // Test 4: Check specific session if any exist
    if (sessions.length > 0) {
      const testSession = sessions[0];
      console.log(`\n4️⃣ Testing getSessionStatus for '${testSession}':`);
      const status = await wpp.getSessionStatus(testSession);
      console.log('   Status:', status);

      console.log(`\n5️⃣ Testing getTokenInfo for '${testSession}':`);
      const tokenInfo = await wpp.getTokenInfo(testSession);
      console.log('   Token info:', tokenInfo);
    } else {
      console.log('\n4️⃣ No sessions found to test individual session functions');
    }

    // Test 5: Test sessionExists function
    console.log('\n5️⃣ Testing sessionExists():');
    const testSessionName = 'test-session-' + Date.now();
    const exists = await wpp.sessionExists(testSessionName);
    console.log(`   Session '${testSessionName}' exists:`, exists);

    console.log('\n✅ All tests completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   • Run: node wpp-playground.js (to create a new session)');
    console.log('   • Or: await wpp.initializeClient("your-session-name") (in Node.js REPL)');

  } catch (error) {
    console.error('❌ Error testing default token storage:', error);
  }
}

// Run the test
testDefaultTokenStorage(); 