const fs = require('fs');
const path = require('path');
const wppconnect = require('@wppconnect-team/wppconnect');

// Create a FileTokenStore instance for managing session tokens
const tokenStore = new wppconnect.tokenStore.FileTokenStore({
  // Optional configuration:
  // decodeFunction: JSON.parse,
  // encodeFunction: JSON.stringify,
  // encoding: 'utf8',
  fileExtension: '.json',
  path: './session_tokens', // Default is './tokens'
});

/**
 * WPPConnect WhatsApp Client with FileTokenStore
 * 
 * This implementation uses WPPConnect's FileTokenStore for persistent session storage.
 * Sessions are automatically saved to the 'tokens' folder and can be reused across application restarts.
 * 
 * Key Features:
 * - Persistent session storage using FileTokenStore
 * - Automatic token validation and management
 * - Multi-session support with client caching
 * - Session status monitoring and management
 * - Configurable token storage options
 * 
 * Usage:
 * 1. Initialize a session: await initializeClient('my-session')
 * 2. Send messages: await sendMessage('my-session', '1234567890@c.us', 'Hello!')
 * 3. Check session status: await getSessionStatus('my-session')
 * 4. Delete session: await deleteSession('my-session')
 */

// Client cache - store multiple clients by session name
const clients = new Map();

// Helper function to check if a session exists by looking for token files
async function sessionExists(sessionName) {
  try {
    const tokensDir = path.join(__dirname, 'tokens');
    const sessionDir = path.join(tokensDir, sessionName);
    return fs.existsSync(sessionDir);
  } catch (error) {
    console.log(`⚠️ Error checking session existence for ${sessionName}: ${error.message}`);
    return false;
  }
}

// Helper function to get or create a client for a session
async function getOrCreateClient(sessionName, options = {}) {
  // Check if session exists by looking for token files
  const exists = await sessionExists(sessionName);
  
  if (!exists) {
    console.log(`ℹ️ Session '${sessionName}' not found in tokens folder. It will be created.`);
  } else {
    console.log(`ℹ️ Session '${sessionName}' found in tokens folder.`);
  }

  // Check if we have a cached client
  if (clients.has(sessionName)) {
    const existingClient = clients.get(sessionName);
    console.log('Client has been found', existingClient);
    
    try {
      // Check if client is still connected
      const isConnected = await existingClient.isConnected();
      
      if (isConnected) {
        console.log('✅ Client already initialized and connected, reusing existing connection');
        return existingClient;
      } else {
        console.log('⚠️ Cached client found but not connected, removing and reinitializing');
        clients.delete(sessionName);
        // Fall through to create new client
      }
    } catch (error) {
      console.log('⚠️ Error checking cached client state, removing and reinitializing');
      clients.delete(sessionName);
      // Fall through to create new client
    }
  }

  // Create new client
  try {
    console.log(`📱 Initializing client for session: ${sessionName}`);
    
    const client = await wppconnect.create({
      session: sessionName,
      headless: true,
      puppeteerOptions: {
        userDataDir: path.join(__dirname, 'tokens', sessionName),
        // executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // optional
      },
      useChrome: true,
      catchQR: (qr) => {
        console.log('📱 QR Code received - scan this in WhatsApp:');
        console.log(qr);
      },
      statusFind: (status) => {
        console.log('📱 Status:', status);
      },
      ...options
    });

    clients.set(sessionName, client);
    console.log('✅ Client initialized successfully!');

    // 🧠 Wait a bit for client to be fully initialized, then check authentication
    setTimeout(async () => {
      try {
        if (await client.isConnected()) {
          console.log('✅ WhatsApp is connected');

          const sessionToken = await client.getSessionTokenBrowser();
          console.log('📦 Extracted session token:', sessionToken);

          // 💾 Save it manually using your tokenStore
          await tokenStore.setToken(sessionName, sessionToken);
          console.log('💾 Token saved manually to FileTokenStore');
        }
      } catch (error) {
        console.log(`⚠️ Error during token extraction: ${error.message}`);
      }
    }, 2000); // Wait 2 seconds for client to be ready

    return client;

  } catch (error) {
    console.log(`❌ Error initializing client: ${error.message}`);
    throw error;
  }
}

// Function to list all sessions by scanning the tokens directory
async function listSessions() {
  try {
    const tokensDir = path.join(__dirname, 'tokens');
    
    if (!fs.existsSync(tokensDir)) {
      console.log('📋 No tokens directory found');
      return [];
    }
    
    const sessions = fs.readdirSync(tokensDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    console.log(`📋 Found ${sessions.length} sessions in tokens folder`);
    
    return sessions;
  } catch (error) {
    console.log(`⚠️ Error listing sessions: ${error.message}`);
    return [];
  }
}

// Function to get session status information by checking token files
async function getSessionStatus(sessionName) {
  try {
    const exists = await sessionExists(sessionName);
    const isCached = clients.has(sessionName);
    
    let isConnected = false;
    if (isCached) {
      try {
        const client = clients.get(sessionName);
        isConnected = await client.isConnected();
      } catch (error) {
        console.log(`⚠️ Error checking connection status for ${sessionName}: ${error.message}`);
      }
    }
    
    return {
      sessionName,
      exists,
      isCached,
      isConnected,
      status: exists ? (isCached ? (isConnected ? 'connected' : 'cached_but_disconnected') : 'exists_but_not_cached') : 'not_found'
    };
  } catch (error) {
    console.log(`⚠️ Error getting session status for ${sessionName}: ${error.message}`);
    return {
      sessionName,
      exists: false,
      isCached: false,
      isConnected: false,
      status: 'error'
    };
  }
}

// Function to get status of all sessions
async function getAllSessionsStatus() {
  const sessions = await listSessions();
  const statusPromises = sessions.map(session => getSessionStatus(session));
  return await Promise.all(statusPromises);
}

// Function to delete a session by removing its token directory
async function deleteSession(sessionName) {
  try {
    // Close client if it's cached
    if (clients.has(sessionName)) {
      await closeClient(sessionName);
    }
    
    // Delete token directory
    const tokensDir = path.join(__dirname, 'tokens');
    const sessionDir = path.join(tokensDir, sessionName);
    
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log(`✅ Session '${sessionName}' deleted successfully`);
      return true;
    } else {
      console.log(`⚠️ Session '${sessionName}' not found in tokens folder`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Error deleting session '${sessionName}': ${error.message}`);
    return false;
  }
}

// Function to get token information for a session
async function getTokenInfo(sessionName) {
  try {
    const tokensDir = path.join(__dirname, 'tokens');
    const sessionDir = path.join(tokensDir, sessionName);
    
    if (!fs.existsSync(sessionDir)) {
      return {
        sessionName,
        exists: false,
        isValid: false
      };
    }
    
    // Get directory stats
    const stats = fs.statSync(sessionDir);
    const files = fs.readdirSync(sessionDir, { recursive: true });
    
    return {
      sessionName,
      exists: true,
      isValid: true,
      createdAt: stats.birthtime,
      updatedAt: stats.mtime,
      fileCount: files.length,
      files: files.slice(0, 10) // Show first 10 files
    };
  } catch (error) {
    console.log(`❌ Error getting token info for '${sessionName}': ${error.message}`);
    return {
      sessionName,
      exists: false,
      isValid: false,
      error: error.message
    };
  }
}

// ===== TOKEN STORE HELPER FUNCTIONS =====

/**
 * Get token data for a specific session
 * @param {string} sessionName - Session name
 * @returns {Promise<Object|null>} Token data or null if not found
 */
async function getToken(sessionName) {
  try {
    console.log(`🔍 Getting token for session: ${sessionName}`);
    const tokenData = await tokenStore.getToken(sessionName);
    
    if (tokenData) {
      console.log(`✅ Token found for session: ${sessionName}`);
      console.log('📋 Token Data:');
      console.log(JSON.stringify(tokenData, null, 2));
    } else {
      console.log(`⚠️ No token found for session: ${sessionName}`);
    }
    
    return tokenData;
  } catch (error) {
    console.log(`❌ Error getting token for '${sessionName}': ${error.message}`);
    return null;
  }
}

/**
 * Set token data for a specific session
 * @param {string} sessionName - Session name
 * @param {Object} tokenData - Token data to store
 * @returns {Promise<boolean>} Success status
 */
async function setToken(sessionName, tokenData) {
  try {
    console.log(`💾 Setting token for session: ${sessionName}`);
    const success = await tokenStore.setToken(sessionName, tokenData);
    
    if (success) {
      console.log(`✅ Token saved successfully for session: ${sessionName}`);
    } else {
      console.log(`❌ Failed to save token for session: ${sessionName}`);
    }
    
    return success;
  } catch (error) {
    console.log(`❌ Error setting token for '${sessionName}': ${error.message}`);
    return false;
  }
}

/**
 * Remove token data for a specific session
 * @param {string} sessionName - Session name
 * @returns {Promise<boolean>} Success status
 */
async function removeToken(sessionName) {
  try {
    console.log(`🗑️ Removing token for session: ${sessionName}`);
    const success = await tokenStore.removeToken(sessionName);
    
    if (success) {
      console.log(`✅ Token removed successfully for session: ${sessionName}`);
    } else {
      console.log(`❌ Failed to remove token for session: ${sessionName}`);
    }
    
    return success;
  } catch (error) {
    console.log(`❌ Error removing token for '${sessionName}': ${error.message}`);
    return false;
  }
}

/**
 * List all available tokens
 * @returns {Promise<string[]>} Array of session names
 */
async function listTokens() {
  try {
    console.log('📋 Listing all available tokens...');
    const tokens = await tokenStore.listTokens();
    
    console.log(`📋 Found ${tokens.length} tokens:`);
    tokens.forEach((token, index) => {
      console.log(`  ${index + 1}. ${token}`);
    });
    
    return tokens;
  } catch (error) {
    console.log(`❌ Error listing tokens: ${error.message}`);
    return [];
  }
}

/**
 * Check if a token exists for a session
 * @param {string} sessionName - Session name
 * @returns {Promise<boolean>} Whether token exists
 */
async function hasToken(sessionName) {
  try {
    const tokenData = await tokenStore.getToken(sessionName);
    const exists = tokenData !== null && tokenData !== undefined;
    
    console.log(`🔍 Token exists for '${sessionName}': ${exists ? '✅ Yes' : '❌ No'}`);
    return exists;
  } catch (error) {
    console.log(`❌ Error checking token existence for '${sessionName}': ${error.message}`);
    return false;
  }
}

/**
 * Get detailed information about all tokens
 * @returns {Promise<Array>} Array of token information objects
 */
async function getAllTokensInfo() {
  try {
    console.log('📋 Getting detailed information for all tokens...');
    const tokens = await tokenStore.listTokens();
    const tokenInfos = [];
    
    for (const sessionName of tokens) {
      const tokenData = await tokenStore.getToken(sessionName);
      const exists = await sessionExists(sessionName);
      const isCached = clients.has(sessionName);
      
      tokenInfos.push({
        sessionName,
        hasTokenData: tokenData !== null && tokenData !== undefined,
        tokenData: tokenData,
        existsInFileSystem: exists,
        isCached: isCached,
        status: exists ? (isCached ? 'cached' : 'stored') : 'orphaned'
      });
    }
    
    console.log('\n📋 Token Information:');
    console.log('====================');
    tokenInfos.forEach((info, index) => {
      console.log(`${index + 1}. ${info.sessionName}`);
      console.log(`   - Has Token Data: ${info.hasTokenData ? '✅' : '❌'}`);
      console.log(`   - Exists in FS: ${info.existsInFileSystem ? '✅' : '❌'}`);
      console.log(`   - Is Cached: ${info.isCached ? '✅' : '❌'}`);
      console.log(`   - Status: ${info.status}`);
    });
    
    return tokenInfos;
  } catch (error) {
    console.log(`❌ Error getting all tokens info: ${error.message}`);
    return [];
  }
}

// Initialize the client with smart session management
async function initializeClient(sessionName, options = {}) {
  return await getOrCreateClient(sessionName, options);
}

// ===== DIFFERENT WPPCONNECT METHODS =====

// 1. Get basic session info
async function getSessionInfo(sessionName) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log('📶 Getting session information...');

    const isConnected = await client.isConnected();
    const isOnline = await client.isOnline();
    const battery = await client.getBatteryLevel();
    const connectionState = await client.getConnectionState();
    const hostDevice = await client.getHostDevice();
    const waVersion = await client.getWAVersion();
    const isAuthenticated = await client.isAuthenticated();

    console.log('\n📶 Session Information:');
    console.log('======================');
    console.log(`Connected: ${isConnected}`);
    console.log(`Online: ${isOnline}`);
    console.log(`Battery: ${battery}%`);
    console.log(`Connection State: ${connectionState}`);
    console.log(`WhatsApp Version: ${waVersion}`);
    console.log(`Authenticated: ${isAuthenticated}`);
    
    if (hostDevice) {
      console.log('\n📱 Full Device Information:');
      console.log('==========================');
      console.log(JSON.stringify(hostDevice, null, 2));
      console.log(hostDevice);
    }

  } catch (error) {
    console.log(`❌ Error getting session info: ${error.message}`);
  }
}

// 2. Send a text message
async function sendMessage(sessionName, to, message) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log(`📤 Sending message to ${to}: ${message}`);
    const sentMessage = await client.sendText(to, message);
    console.log('✅ Message sent successfully!');
    
    // Display full message details
    console.log('\n📋 Full Message Response Details:');
    console.log('==================================');
    console.log(JSON.stringify(sentMessage, null, 2));
    
    // Display key delivery status information
    console.log('\n📊 Message Delivery Status:');
    console.log('============================');
    console.log(`Message ID: ${sentMessage.id}`);
    console.log(`From: ${sentMessage.from}`);
    console.log(`To: ${sentMessage.to}`);
    console.log(`Timestamp: ${new Date(sentMessage.timestamp * 1000).toLocaleString()}`);
    console.log(`Body: ${sentMessage.body || '[No body]'}`);
    console.log(`Type: ${sentMessage.type}`);
    console.log(`From Me: ${sentMessage.fromMe}`);
    
    // Display acknowledgment status with explanation
    const ackStatus = {
      '-1': '❌ Message not sent (failure)',
      '0': '⏳ Message created locally (not yet sent)',
      '1': '📤 Message sent to WhatsApp server',
      '2': '📬 Message delivered to recipient',
      '3': '📖 Message read by recipient (double-blue tick)',
      '4': '▶️ Message played (voice notes only)'
    };
    
    console.log(`Acknowledgment (ack): ${sentMessage.ack} - ${ackStatus[sentMessage.ack] || 'Unknown status'}`);
    
    // Display additional useful fields
    console.log('\n🔍 Additional Message Details:');
    console.log('==============================');
    console.log(`Is Media: ${sentMessage.isMedia}`);
    console.log(`Is MMS: ${sentMessage.isMMS}`);
    console.log(`Is Group Message: ${sentMessage.isGroupMsg}`);
    console.log(`Is Forwarded: ${sentMessage.isForwarded}`);
    console.log(`Is New Message: ${sentMessage.isNewMsg}`);
    console.log(`Is Notification: ${sentMessage.isNotification}`);
    console.log(`Broadcast: ${sentMessage.broadcast}`);
    console.log(`Has Reaction: ${sentMessage.hasReaction}`);
    console.log(`Star: ${sentMessage.star}`);
    
    if (sentMessage.mediaData) {
      console.log(`Media Type: ${sentMessage.mimetype}`);
      console.log(`Media Size: ${sentMessage.size} bytes`);
      console.log(`Media Dimensions: ${sentMessage.width}x${sentMessage.height}`);
    }
    
    return sentMessage;
  } catch (error) {
    console.log(`❌ Error sending message: ${error.message}`);
    throw error;
  }
}

// Enhanced message tracking function
/**
 * Track message delivery status over time
 * @param {string} sessionName - Session name
 * @param {string} messageId - Message ID to track
 * @param {number} maxAttempts - Maximum number of status checks
 * @param {number} intervalMs - Interval between checks in milliseconds
 */
async function trackMessageDelivery(sessionName, messageId, maxAttempts = 10, intervalMs = 2000) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);
  const ackStatus = {
    '-1': '❌ Message not sent (failure)',
    '0': '⏳ Message created locally (not yet sent)',
    '1': '📤 Message sent to WhatsApp server',
    '2': '📬 Message delivered to recipient',
    '3': '📖 Message read by recipient (double-blue tick)',
    '4': '▶️ Message played (voice notes only)'
  };

  console.log(`\n🔄 Tracking message delivery for ID: ${messageId}`);
  console.log('==========================================');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const message = await client.getMessageById(messageId);
      
      if (!message) {
        console.log(`❌ Message with ID ${messageId} not found`);
        return null;
      }

      const timestamp = new Date(message.timestamp * 1000).toLocaleString();
      const status = ackStatus[message.ack] || 'Unknown status';
      
      console.log(`[${attempt}/${maxAttempts}] ${timestamp} - ack: ${message.ack} - ${status}`);
      
      // If message is delivered or read, we can stop tracking
      if (message.ack >= 2) {
        console.log(`✅ Message delivery tracking complete! Final status: ${status}`);
        return message;
      }
      
      // Wait before next check (except on last attempt)
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
      
    } catch (error) {
      console.log(`❌ Error checking message status (attempt ${attempt}): ${error.message}`);
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }
  }
  
  console.log(`⏰ Message delivery tracking timed out after ${maxAttempts} attempts`);
  return null;
}

// Enhanced message sending with delivery tracking
/**
 * Send a message and track its delivery status
 * @param {string} sessionName - Session name
 * @param {string} to - Recipient ID
 * @param {string} message - Message content
 * @param {boolean} trackDelivery - Whether to track delivery status
 * @param {number} maxTrackingAttempts - Maximum tracking attempts
 * @param {number} trackingInterval - Tracking interval in milliseconds
 */
async function sendMessageWithTracking(sessionName, to, message, trackDelivery = true, maxTrackingAttempts = 10, trackingInterval = 2000) {
  try {
    console.log(`\n🚀 Sending message with delivery tracking...`);
    console.log('==========================================');
    
    // Send the message and get the response
    const sentMessage = await sendMessage(sessionName, to, message);
    
    if (!sentMessage) {
      console.log('❌ Failed to send message');
      return null;
    }
    
    // Track delivery if requested
    if (trackDelivery) {
      console.log(`\n📊 Starting delivery tracking for message ID: ${sentMessage.id}`);
      const finalMessage = await trackMessageDelivery(
        sessionName, 
        sentMessage.id, 
        maxTrackingAttempts, 
        trackingInterval
      );
      
      return {
        sentMessage,
        deliveryTracking: finalMessage
      };
    }
    
    return { sentMessage };
    
  } catch (error) {
    console.log(`❌ Error in sendMessageWithTracking: ${error.message}`);
    throw error;
  }
}

// 3. Get all chats
/**
 * List chats with optional filtering
 * @param {string} sessionName - Session name
 * @param {Object} options - Chat list options
 * @param {number} [options.count] - Number of chats to retrieve
 * @param {"before" | "after"} [options.direction] - Direction for pagination
 * @param {string} [options.id] - Chat ID for pagination reference
 * @param {boolean} [options.onlyCommunities] - Filter only community chats
 * @param {boolean} [options.onlyGroups] - Filter only group chats
 * @param {boolean} [options.onlyNewsletter] - Filter only newsletter chats
 * @param {boolean} [options.onlyUsers] - Filter only user chats
 * @param {boolean} [options.onlyWithUnreadMessage] - Filter only chats with unread messages
 * @param {string[]} [options.withLabels] - Filter chats with specific labels
 */
async function listChats(sessionName, options = {}) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log('💬 Getting chats...');
    const chats = await client.listChats(options);
    
    console.log('\n💬 Chats:');
    console.log('=============');
    console.log(`\nTotal chats: ${chats.length}`);
    
    // Find and display KPIWA group details
    const kpiwaGroup = chats.find(chat => chat.name && chat.name.includes('KPIWA'));
    
    if (kpiwaGroup) {
      console.log('\n=== KPIWA Group Details ===');
      console.log(JSON.stringify(kpiwaGroup, null, 2));
    } else {
      console.log('\nKPIWA group not found in the chat list.');
      console.log('Available group names:');
      chats.forEach((chat, index) => {
        if (chat.name) {
          console.log(`${index + 1}. ${chat.name}`);
        }
      });
    }

  } catch (error) {
    console.log(`❌ Error getting chats: ${error.message}`);
  }
}

// 4. Get chat messages
async function getChatMessages(sessionName, chatId, limit = 10) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log(`📨 Getting last ${limit} messages from ${chatId}...`);
    const messages = await client.getAllMessagesInChat(chatId, limit);
    
    console.log('\n📨 Recent Messages:');
    console.log('==================');
    messages.forEach((msg, index) => {
      const time = new Date(msg.timestamp * 1000).toLocaleString();
      console.log(`${index + 1}. [${time}] ${msg.from}: ${msg.body || '[Media/System Message]'}`);
    });

  } catch (error) {
    console.log(`❌ Error getting messages: ${error.message}`);
  }
}

// 5. Get contacts
/**
 * Retrieves all contacts
 * @param {string} sessionName - Session name
 * @returns {Promise<Contact[]>} array of Contact objects
 */
async function getAllContacts(sessionName) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log('👥 Getting all contacts...');
    const contacts = await client.getAllContacts();
    
    console.log('\n👥 All Contacts:');
    console.log('===============');
    contacts.forEach((contact, index) => {
      console.log(`${index + 1}. ${contact.name || 'Unknown'} (${contact.id})`);
    });
    console.log(`\nTotal contacts: ${contacts.length}`);

    return contacts;
  } catch (error) {
    console.log(`❌ Error getting contacts: ${error.message}`);
    throw error;
  }
}

// 6. Get contact by ID
/**
 * Retrieves contact detail object of given contact id
 * @param {string} sessionName - Session name
 * @param {string} contactId - Contact ID to retrieve details for
 * @returns {Promise<Contact>} contact details as promise
 */
async function getContact(sessionName, contactId) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log(`👤 Getting contact details for: ${contactId}`);
    const contact = await client.getContact(contactId);
    
    console.log('\n👤 Contact Details:');
    console.log('==================');
    console.log(`ID: ${contact.id}`);
    console.log(`Name: ${contact.name || 'Unknown'}`);
    console.log(`Number: ${contact.number || 'N/A'}`);
    console.log(`Is Business: ${contact.isBusiness || false}`);
    console.log(`Is My Contact: ${contact.isMyContact || false}`);
    console.log(`Is WAContact: ${contact.isWAContact || false}`);
    
    // Log additional properties if they exist
    if (contact.pushname) console.log(`Push Name: ${contact.pushname}`);
    if (contact.shortName) console.log(`Short Name: ${contact.shortName}`);
    if (contact.status) console.log(`Status: ${contact.status}`);
    
    console.log('\n📋 Full Contact Object:');
    console.log(JSON.stringify(contact, null, 2));

    return contact;
  } catch (error) {
    console.log(`❌ Error getting contact: ${error.message}`);
    throw error;
  }
}

// 7. Get current WID
/**
 * Returns current wid connected
 * @param {string} sessionName - Session name
 * @returns {Promise<string>} Current wid connected
 */
async function getWid(sessionName) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log('🆔 Getting current WID...');
    const wid = await client.getWid();
    
    console.log('\n🆔 Current WID:');
    console.log('===============');
    console.log(`WID: ${wid}`);
    
    return wid;
  } catch (error) {
    console.log(`❌ Error getting WID: ${error.message}`);
    throw error;
  }
}

// 8. Send image
async function sendImage(sessionName, to, imagePath, caption = '') {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log(`🖼️ Sending image to ${to}: ${imagePath}`);
    await client.sendImage(to, imagePath, 'image.jpg', caption);
    console.log('✅ Image sent successfully!');
  } catch (error) {
    console.log(`❌ Error sending image: ${error.message}`);
  }
}

// 9. Send file
async function sendFile(sessionName, to, filePath, fileName = '') {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    const name = fileName || path.basename(filePath);
    console.log(`📎 Sending file to ${to}: ${name}`);
    await client.sendFile(to, filePath, name);
    console.log('✅ File sent successfully!');
  } catch (error) {
    console.log(`❌ Error sending file: ${error.message}`);
  }
}

// 10. Get chat by ID
async function getChatById(sessionName, chatId) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log(`🔍 Getting chat info for: ${chatId}`);
    const chat = await client.getChatById(chatId);
    
    console.log('\n🔍 Chat Information:');
    console.log('===================');
    console.log(`ID: ${chat.id}`);
    console.log(`Name: ${chat.name || 'Unknown'}`);
    console.log(`Is Group: ${chat.isGroup}`);
    console.log(`Participants: ${chat.participants ? chat.participants.length : 'N/A'}`);

  } catch (error) {
    console.log(`❌ Error getting chat: ${error.message}`);
  }
}

// 11. Set chat state (typing, recording, etc.)
async function setChatState(sessionName, chatId, state) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log(`⌨️ Setting chat state for ${chatId} to: ${state}`);
    await client.sendSeen(chatId);
    console.log('✅ Chat state updated!');
  } catch (error) {
    console.log(`❌ Error setting chat state: ${error.message}`);
  }
}

// 12. Get unread messages
async function getUnreadMessages(sessionName) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log('📬 Getting unread messages...');
    const unreadChats = await client.getUnreadMessages();
    
    console.log('\n📬 Unread Messages:');
    console.log('==================');
    unreadChats.forEach((chat, index) => {
      console.log(`${index + 1}. ${chat.name || chat.id}: ${chat.unreadCount} unread`);
    });

  } catch (error) {
    console.log(`❌ Error getting unread messages: ${error.message}`);
  }
}

// 13. Add participant to group
/**
 * Adds participant to Group
 * @param {string} sessionName - Session name
 * @param {string} groupId - Chat id ('0000000000-00000000@g.us')
 * @param {string | string[]} participantId - Participant id '000000000000@c.us'
 * @returns {Promise<{[key: `${number}@c.us`]: {code: number, invite_code: string, invite_code_exp: number, message: string, wid: string}}>}
 */
async function addParticipant(sessionName, groupId, participantId) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log(`👥 Adding participant(s) to group ${groupId}...`);
    const result = await client.addParticipant(groupId, participantId);
    
    console.log('\n👥 Add Participant Result:');
    console.log('=========================');
    console.log(JSON.stringify(result, null, 2));
    
    return result;
  } catch (error) {
    console.log(`❌ Error adding participant: ${error.message}`);
    throw error;
  }
}

// 14. Remove participant from group
/**
 * Removes participant from group
 * @param {string} sessionName - Session name
 * @param {string} groupId - Chat id ('0000000000-00000000@g.us')
 * @param {string | string[]} participantId - Participant id '000000000000@c.us'
 * @returns {Promise<void>}
 */
async function removeParticipant(sessionName, groupId, participantId) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log(`👥 Removing participant(s) from group ${groupId}...`);
    await client.removeParticipant(groupId, participantId);
    
    console.log('✅ Participant(s) removed successfully!');
  } catch (error) {
    console.log(`❌ Error removing participant: ${error.message}`);
    throw error;
  }
}

// 15. Logout from WhatsApp
/**
 * Log out of WhatsApp
 * @param {string} sessionName - Session name
 * @returns {Promise<boolean>} Success status
 */
async function logout(sessionName) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log(`🚪 Logging out from WhatsApp for session: ${sessionName}...`);
    const success = await client.logout();
    
    if (success) {
      console.log('✅ Successfully logged out from WhatsApp');
      
      // Remove token from storage after logout
      await tokenStore.removeToken(sessionName);
      console.log('🗑️ Token removed from storage');
      
      // Remove client from cache
      // clients.delete(sessionName);
      // console.log('🗑️ Client removed from cache');
    } else {
      console.log('❌ Failed to logout from WhatsApp');
    }
    
    return success;
  } catch (error) {
    console.log(`❌ Error logging out: ${error.message}`);
    throw error;
  }
}

// 15. Extract session token
/**
 * Extracts the browser session token for a session
 * @param {string} sessionName - Session name
 * @param {boolean} removePath - Whether to remove path from token
 * @returns {Promise<Object>} Session token data
 */
async function extractSessionToken(sessionName, removePath = false) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log(`🔑 Extracting session token for: ${sessionName}`);
    
    // Check if client is logged in
    if (!(await client.isLogged())) {
      throw new Error('Client is not logged in. Please authenticate first.');
    }

    const sessionToken = await client.getSessionTokenBrowser(removePath);
    
    console.log('\n🔑 Session Token Extracted:');
    console.log('==========================');
    console.log(JSON.stringify(sessionToken, null, 2));
    
    return sessionToken;
  } catch (error) {
    console.log(`❌ Error extracting session token: ${error.message}`);
    throw error;
  }
}

// 16. Initialize client and extract token
/**
 * Initialize client and extract session token if authenticated
 * @param {string} sessionName - Session name
 * @param {Object} options - Client options
 * @param {boolean} extractToken - Whether to extract token after authentication
 * @returns {Promise<Object>} Client and optional token data
 */
async function initializeClientAndExtractToken(sessionName, options = {}, extractToken = true) {
  try {
    console.log(`🚀 Initializing client and extracting token for session: ${sessionName}`);
    
    // Initialize the client
    const client = await getOrCreateClient(sessionName, options);
    
    // Wait a bit for authentication to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    let tokenData = null;
    
    if (extractToken) {
      try {
        // Check if client is logged in
        if (await client.isLogged()) {
          console.log('✅ WhatsApp is logged in, extracting session token...');
          
          tokenData = await client.getSessionTokenBrowser();
          console.log('📦 Extracted session token successfully');
          
          // Save it manually using your tokenStore
          await tokenStore.setToken(sessionName, tokenData);
          console.log('💾 Token saved manually to FileTokenStore');
        } else {
          console.log('⚠️ Client is not logged in yet. Token extraction skipped.');
        }
      } catch (error) {
        console.log(`⚠️ Error extracting token: ${error.message}`);
      }
    }
    
    return {
      client,
      tokenData,
      sessionName
    };
  } catch (error) {
    console.log(`❌ Error in initializeClientAndExtractToken: ${error.message}`);
    throw error;
  }
}

// 17. Check if main interface is initializing
/**
 * Retrieve if main interface is initializing
 * @param {string} sessionName - Session name
 * @returns {Promise<boolean>} Whether main interface is initializing
 */
async function isMainInit(sessionName) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log('🔄 Checking if main interface is initializing...');
    const isInitializing = await client.isMainInit();
    
    console.log('\n🔄 Main Interface Initialization Status:');
    console.log('=======================================');
    console.log(`Is Initializing: ${isInitializing ? '✅ Yes' : '❌ No'}`);
    
    return isInitializing;
  } catch (error) {
    console.log(`❌ Error checking main interface initialization: ${error.message}`);
    throw error;
  }
}

// 18. Check if main interface is loaded
/**
 * Retrieve if main interface is authenticated and loaded, but not synced
 * @param {string} sessionName - Session name
 * @returns {Promise<boolean>} Whether main interface is loaded
 */
async function isMainLoaded(sessionName) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log('📱 Checking if main interface is loaded...');
    const isLoaded = await client.isMainLoaded();
    
    console.log('\n📱 Main Interface Loading Status:');
    console.log('=================================');
    console.log(`Is Loaded: ${isLoaded ? '✅ Yes' : '❌ No'}`);
    
    return isLoaded;
  } catch (error) {
    console.log(`❌ Error checking main interface loading: ${error.message}`);
    throw error;
  }
}

// 19. Check if main interface is ready
/**
 * Retrieve if main interface is authenticated, loaded and synced
 * @param {string} sessionName - Session name
 * @returns {Promise<boolean>} Whether main interface is ready
 */
async function isMainReady(sessionName) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log('✅ Checking if main interface is ready...');
    const isReady = await client.isMainReady();
    
    console.log('\n✅ Main Interface Ready Status:');
    console.log('===============================');
    console.log(`Is Ready: ${isReady ? '✅ Yes' : '❌ No'}`);
    
    return isReady;
  } catch (error) {
    console.log(`❌ Error checking main interface readiness: ${error.message}`);
    throw error;
  }
}

// 20. Listen to interface mode changes
/**
 * Listens to interface mode change
 * @param {string} sessionName - Session name
 * @param {Function} callback - Callback function to handle interface changes
 * @param {Object} callback.state - Interface state object
 * @param {Object} callback.state.displayInfo - Interface state information
 * @param {string} callback.state.mode - Interface mode
 * @returns {Object} Disposable object with dispose() method to stop listening
 */
function onInterfaceChange(sessionName, callback) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log('👂 Setting up interface change listener...');
    
    // Create a wrapper callback that logs the changes
    const wrappedCallback = (state) => {
      console.log('\n🔄 Interface Change Detected:');
      console.log('============================');
      console.log(`Mode: ${state.mode}`);
      console.log('Display Info:', JSON.stringify(state.displayInfo, null, 2));
      
      // Call the original callback
      if (callback && typeof callback === 'function') {
        callback(state);
      }
    };
    
    // Set up the listener
    const disposable = client.onInterfaceChange(wrappedCallback);
    
    console.log('✅ Interface change listener set up successfully');
    console.log('📝 Use the returned dispose() method to stop listening');
    
    return disposable;
  } catch (error) {
    console.log(`❌ Error setting up interface change listener: ${error.message}`);
    throw error;
  }
}

// 21. Start phone watchdog
/**
 * Start phone Watchdog, forcing the phone connection verification
 * @param {string} sessionName - Session name
 * @param {number} [interval=15000] - Interval number in milliseconds (default: 15000)
 * @returns {Promise<void>}
 */
async function startPhoneWatchdog(sessionName, interval = 5000) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log(`🐕 Starting phone watchdog for session: ${sessionName}`);
    console.log(`⏰ Watchdog interval: ${interval}ms (${interval / 1000}s)`);
    
    await client.startPhoneWatchdog(interval);
    
    console.log('✅ Phone watchdog started successfully');
    console.log('📱 Phone connection verification will be forced every', interval / 1000, 'seconds');
    
  } catch (error) {
    console.log(`❌ Error starting phone watchdog: ${error.message}`);
    throw error;
  }
}

// 22. Set status find callback
/**
 * Set status find callback to monitor connection status changes
 * @param {string} sessionName - Session name
 * @param {Function} callback - Callback function to handle status changes
 * @param {string} callback.status - Status string (e.g., 'qrRead', 'qrReadError', 'ready', 'authenticated', etc.)
 * @returns {Promise<void>}
 */
async function setStatusFindCallback(sessionName, callback) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call initializeClient() first.`);
  }

  const client = clients.get(sessionName);

  try {
    console.log('📊 Setting up status find callback...');
    
    // Create a wrapper callback that logs the status changes
    const wrappedCallback = (status) => {
      console.log('\n📊 Status Change Detected:');
      console.log('==========================');
      console.log(`Status: ${status}`);
      
      // Call the original callback
      if (callback && typeof callback === 'function') {
        callback(status);
      }
    };
    
    // Set the status find callback
    client.statusFind = wrappedCallback;
    
    console.log('✅ Status find callback set up successfully');
    console.log('📝 Status changes will now be logged and forwarded to your callback');
    
  } catch (error) {
    console.log(`❌ Error setting up status find callback: ${error.message}`);
    throw error;
  }
}

// Function to close a specific client (call this when shutting down)
async function closeClient(sessionName) {
  if (clients.has(sessionName)) {
    const client = clients.get(sessionName);
    console.log(`🔌 Closing client connection for session: ${sessionName}...`);
    await client.close();
    // clients.delete(sessionName);
    // console.log('✅ Client closed');
  } else {
    console.log(`⚠️ No client found for session: ${sessionName}`);
  }
}

// Function to close all clients
async function closeAllClients() {
  console.log('🔌 Closing all client connections...');
  const closePromises = Array.from(clients.keys()).map(sessionName => closeClient(sessionName));
  await Promise.all(closePromises);
  console.log('✅ All clients closed');
}

// ===== DEMO FUNCTIONS =====

// Demo all basic methods
async function runBasicDemo(sessionName) {
  console.log('\n🚀 Running Basic Demo...');
  console.log('========================');
  
  await getSessionInfo(sessionName);
  await listChats(sessionName);
  await getAllContacts(sessionName);
  await getUnreadMessages(sessionName);
}


// Main execution flow
async function main() {
  try {
    // Show available sessions and their status
    console.log('📋 Available sessions:');
    const sessions = await listSessions();
    if (sessions.length === 0) {
      console.log('  No sessions found');
      return;
    }
    
    // Get status of all sessions
    const sessionStatuses = await getAllSessionsStatus();
    
    sessionStatuses.forEach((status, index) => {
      const statusIcon = status.isConnected ? '🟢' : status.isCached ? '🟡' : status.exists ? '🔵' : '⚪';
      console.log(`  ${index + 1}. ${statusIcon} ${status.sessionName} (${status.status})`);
    });
    
    // Initialize client with the first session
    const sessionName = sessions[0];
    console.log(`\n🚀 Initializing client for session: ${sessionName}`);
    
    await initializeClient(sessionName);
    
    // Run demos
    await runBasicDemo(sessionName);
    
    // Keep the client alive for a while
    console.log('\n⏰ Keeping client alive for 30 seconds...');
    console.log('You can now call individual methods or press Ctrl+C to exit');
    
    // Example of how to call individual methods:
    console.log('\n📝 Example method calls you can try:');
    console.log('===================================');
    console.log(`• await getSessionInfo('${sessionName}')`);
    console.log(`• await listChats('${sessionName}')`);
    console.log(`• await listChats('${sessionName}', { onlyGroups: true })`);
    console.log(`• await listChats('${sessionName}', { onlyWithUnreadMessage: true, count: 10 })`);
    console.log(`• await getAllContacts('${sessionName}')`);
    console.log(`• await sendMessage('${sessionName}', "1234567890@c.us", "Hello!")`);
    console.log(`• await sendMessageWithTracking('${sessionName}', "1234567890@c.us", "Hello!", true, 10, 2000)`);
    console.log(`• await trackMessageDelivery('${sessionName}', "message_id_here", 10, 2000)`);
    console.log(`• await getChatMessages('${sessionName}', "1234567890@c.us", 5)`);
    console.log(`• await getUnreadMessages('${sessionName}')`);
    
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Close the client when done
    await closeClient(sessionName);
    
  } catch (error) {
    console.log(`❌ Main error: ${error.message}`);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await closeAllClients();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await closeAllClients();
  process.exit(0);
});

// Export functions for interactive use
module.exports = {
  // Session management
  listSessions,
  sessionExists,
  getSessionStatus,
  getAllSessionsStatus,
  deleteSession,
  getTokenInfo,
  
  // Token store management
  getToken,
  setToken,
  removeToken,
  listTokens,
  hasToken,
  getAllTokensInfo,
  
  // Client management
  initializeClient,
  getOrCreateClient,
  
  // WhatsApp operations
  getSessionInfo,
  sendMessage,
  trackMessageDelivery,
  sendMessageWithTracking,
  listChats,
  getChatMessages,
  getAllContacts,
  getContact,
  getWid,
  sendImage,
  sendFile,
  getChatById,
  setChatState,
  getUnreadMessages,
  addParticipant,
  removeParticipant,
  logout,
  extractSessionToken,
  initializeClientAndExtractToken,
  
  // Main interface status methods
  isMainInit,
  isMainLoaded,
  isMainReady,
  onInterfaceChange,
  startPhoneWatchdog,
  setStatusFindCallback,
  
  // Cleanup
  closeClient,
  closeAllClients,
  
  // Demo
  runBasicDemo
};

// Only run main() if this file is run directly (not required)
if (require.main === module) {
  main();
}
