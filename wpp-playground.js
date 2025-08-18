const fs = require('fs');
const path = require('path');
const wppconnect = require('@wppconnect-team/wppconnect');

// Create a FileTokenStore instance for managing session tokens
const tokenStore = new wppconnect.tokenStore.FileTokenStore({
  fileExtension: '.json',
  path: './data/session_tokens',
});

// Client cache - store multiple clients by session name
const clients = new Map();

// Helper function to check if a session exists by looking for token files
async function sessionExists(sessionName) {
  try {
    const tokensDir = path.join(__dirname, 'data', 'tokens');
    const sessionDir = path.join(tokensDir, sessionName);
    return fs.existsSync(sessionDir);
  } catch (error) {
    console.log(`⚠️ Error checking session existence for ${sessionName}: ${error.message}`);
    return false;
  }
}

// Enhanced helper function to get or create a client with custom QR and status callbacks
async function getOrCreateClientWithCallbacks(sessionName, options = {}) {
  const { onQRCode, onStatusChange, ...wppOptions } = options;
  
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

  // Create new client with custom callbacks
  try {
    console.log(`📱 Initializing client for session: ${sessionName} with custom callbacks`);
    
    const client = await wppconnect.create({
      session: sessionName,
      headless: true,
      puppeteerOptions: {
        userDataDir: path.join(__dirname, 'data', 'tokens', sessionName),
      },
      useChrome: true,
      catchQR: (base64Qrimg, asciiQR, attempts, urlCode) => {
        console.log('📱 QR Code received - scan this in WhatsApp:');
        console.log(`Attempts: ${attempts}`);
        console.log(asciiQR);
        
        // Call custom QR callback if provided
        if (onQRCode && typeof onQRCode === 'function') {
          onQRCode({
            base64: base64Qrimg,
            ascii: asciiQR,
            attempts: attempts,
            urlCode: urlCode,
            sessionName: sessionName
          });
        }
      },
      statusFind: (status) => {
        console.log(`📱 Status for ${sessionName}:`, status);
        
        // Call custom status callback if provided
        if (onStatusChange && typeof onStatusChange === 'function') {
          onStatusChange({
            status: status,
            sessionName: sessionName,
            timestamp: new Date().toISOString()
          });
        }
      },
      ...wppOptions
    });

    clients.set(sessionName, client);
    console.log('✅ Client initialized successfully with callbacks!');

    // Wait a bit for client to be fully initialized, then check authentication
    setTimeout(async () => {
      try {
        if (await client.isConnected()) {
          console.log('✅ WhatsApp is connected');

          const sessionToken = await client.getSessionTokenBrowser();
          console.log('📦 Extracted session token:', sessionToken);

          // Save it manually using your tokenStore
          await tokenStore.setToken(sessionName, sessionToken);
          console.log('💾 Token saved manually to FileTokenStore');
          
          // Notify status change callback of successful connection
          if (onStatusChange && typeof onStatusChange === 'function') {
            onStatusChange({
              status: 'authenticated',
              sessionName: sessionName,
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (error) {
        console.log(`⚠️ Error during token extraction: ${error.message}`);
        if (onStatusChange && typeof onStatusChange === 'function') {
          onStatusChange({
            status: 'error',
            sessionName: sessionName,
            timestamp: new Date().toISOString(),
            error: error.message
          });
        }
      }
    }, 2000); // Wait 2 seconds for client to be ready

    return client;

  } catch (error) {
    console.log(`❌ Error initializing client: ${error.message}`);
    if (onStatusChange && typeof onStatusChange === 'function') {
      onStatusChange({
        status: 'error',
        sessionName: sessionName,
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
    throw error;
  }
}

/**
 * Get the connection state of the WhatsApp client
 */
async function getConnectionState(sessionName) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call create() first.`);
  }
  const client = clients.get(sessionName);
  if (!client) {
    throw new Error(`Client not found for session: ${sessionName}`);
  }
  return await client.getConnectionState();
}

/**
 * Check if the WhatsApp client is authenticated
 */
async function isAuthenticated(sessionName) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call create() first.`);
  }
  const client = clients.get(sessionName);
  if (!client) {
    throw new Error(`Client not found for session: ${sessionName}`);
  }
  return await client.isAuthenticated();
}

/**
 * Get the WhatsApp ID (WID) of the current session
 */
async function getWid(sessionName) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call create() first.`);
  }
  const client = clients.get(sessionName);
  if (!client) {
    throw new Error(`Client not found for session: ${sessionName}`);
  }
  return await client.getWid();
}

/**
 * Send a text message to a specific contact
 */
async function sendText(sessionName, to, message) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call create() first.`);
  }
  const client = clients.get(sessionName);
  if (!client) {
    throw new Error(`Client not found for session: ${sessionName}`);
  }
  return await client.sendText(to, message);
}

/**
 * List chats with optional filtering and pagination
 */
async function listChats(sessionName, options = {}) {
  if (!clients.has(sessionName)) {
    throw new Error(`Client not initialized for session: ${sessionName}. Call create() first.`);
  }
  const client = clients.get(sessionName);
  if (!client) {
    throw new Error(`Client not found for session: ${sessionName}`);
  }
  return await client.listChats(options);
}

// Export functions for use
module.exports = {
  getOrCreateClientWithCallbacks,
  getConnectionState,
  isAuthenticated,
  getWid,
  sendText,
  listChats
};
