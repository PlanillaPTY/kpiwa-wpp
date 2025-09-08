const fs = require('fs');
const path = require('path');
const wppconnect = require('@wppconnect-team/wppconnect');


// Client cache - store multiple clients by session name
const clients = new Map();


// Enhanced helper function to get or create a client with custom QR and status callbacks
async function getOrCreateClientWithCallbacks(sessionName, options = {}) {
  const { onQRCode, onStatusChange, ...wppOptions } = options;
  
  // Check if we have a cached client (for performance)
  if (clients.has(sessionName)) {
    const existingClient = clients.get(sessionName);
    console.log('✅ Client already cached, reusing existing connection');
    
    // Test if the client is still usable by trying a simple operation
    try {
      // Try to get connection state - this will fail if client is detached
      await existingClient.getConnectionState();
      return existingClient;
    } catch (error) {
      console.log(`⚠️ Cached client is not usable (${error.message}), removing and will recreate`);
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
  const client = await getOrCreateClientWithCallbacks(sessionName);
  return await client.getConnectionState();
}

/**
 * Check if the WhatsApp client is authenticated
 */
async function isAuthenticated(sessionName) {
  const client = await getOrCreateClientWithCallbacks(sessionName);
  return await client.isAuthenticated();
}

/**
 * Get the WhatsApp ID (WID) of the current session
 */
async function getWid(sessionName) {
  const client = await getOrCreateClientWithCallbacks(sessionName);
  return await client.getWid();
}

/**
 * Send a text message to a specific contact
 */
async function sendText(sessionName, to, message) {
  const client = await getOrCreateClientWithCallbacks(sessionName);
  return await client.sendText(to, message);
}

/**
 * List chats with optional filtering and pagination
 */
async function listChats(sessionName, options = {}) {
  const client = await getOrCreateClientWithCallbacks(sessionName);
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
