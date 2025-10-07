const fs = require('fs');
const path = require('path');
const wppconnect = require('@wppconnect-team/wppconnect');


// Client cache - store multiple clients by session name
const clients = new Map();

// Helper function to clean up stale Chrome lock files
async function cleanupChromeLockFiles(sessionName) {
  const userDataDir = path.join(__dirname, 'data', 'tokens', sessionName);
  const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  
  console.log(`🧹 Cleaning up stale Chrome lock files for session: ${sessionName}`);
  
  for (const lockFile of lockFiles) {
    const lockPath = path.join(userDataDir, lockFile);
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
        console.log(`✅ Cleaned up stale lock file: ${lockFile}`);
      }
    } catch (error) {
      console.log(`⚠️ Could not remove lock file ${lockFile}: ${error.message}`);
    }
  }
}


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
      browserArgs: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ],
      disableWelcome: true,
      disableGoogleAnalytics: true,
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
    
    // If it's a "profile in use" error, try cleaning up lock files and retry once
    if (error.message.includes('SingletonLock') || error.message.includes('ProcessSingleton')) {
      console.log('⚠️ Detected stale lock files, cleaning up and retrying...');
      await cleanupChromeLockFiles(sessionName);
      
      // Wait for file handles to release
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Retry once
      try {
        const client = await wppconnect.create({
          session: sessionName,
          headless: true,
          puppeteerOptions: {
            userDataDir: path.join(__dirname, 'data', 'tokens', sessionName),
          },
          browserArgs: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
          ],
          disableWelcome: true,
          disableGoogleAnalytics: true,
          useChrome: true,
          catchQR: (base64Qrimg, asciiQR, attempts, urlCode) => {
            console.log('📱 QR Code received - scan this in WhatsApp:');
            console.log(`Attempts: ${attempts}`);
            console.log(asciiQR);
            
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
        console.log('✅ Client initialized successfully after cleanup!');
        return client;
        
      } catch (retryError) {
        console.log(`❌ Retry failed: ${retryError.message}`);
        if (onStatusChange && typeof onStatusChange === 'function') {
          onStatusChange({
            status: 'error',
            sessionName: sessionName,
            timestamp: new Date().toISOString(),
            error: retryError.message
          });
        }
        throw retryError;
      }
    }
    
    // Not a lock file error, just propagate
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
  return new Promise((resolve) => {
    let resolved = false;
    
    getOrCreateClientWithCallbacks(sessionName, {
      statusFind: (status) => {
        if (resolved) return;
        
        if (status === 'desconnectedMobile') {
          resolved = true;
          resolve(false);
        }
        // For all other statuses, let it resolve normally
      }
    }).then(async (client) => {
      if (!resolved) {
        resolved = true;
        try {
          const authResult = await client.isAuthenticated();
          resolve(authResult);
        } catch (error) {
          resolve(false);
        }
      }
    }).catch((error) => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });
  });
}

/**
 * Get the WhatsApp ID (WID) of the current session
 */
async function getWid(sessionName) {
  const client = await getOrCreateClientWithCallbacks(sessionName);
  const result = await client.getWid();
  await client.setOnlinePresence(false);
  return result;
}

/**
 * Send a text message to a specific contact
 */
async function sendText(sessionName, to, message) {
  // Check authentication first
  let isAuth;
  try {
    isAuth = await isAuthenticated(sessionName);
  } catch (error) {
    return {
      success: false,
      error: `Authentication check failed: ${error.message}`,
      isAuthenticated: false
    };
  }
  
  if (!isAuth) {
    return {
      success: false,
      error: 'Session not authenticated',
      isAuthenticated: false
    };
  }
  
  // Proceed with sending message
  try {
    const client = await getOrCreateClientWithCallbacks(sessionName);
    const result = await client.sendText(to, message);
    await client.setOnlinePresence(false);
    
    return {
      success: true,
      result: result,
      isAuthenticated: true
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      isAuthenticated: false
    };
  }
}

/**
 * List chats with optional filtering and pagination
 */
async function listChats(sessionName, options = {}) {
  // Check authentication first
  let isAuth;
  try {
    isAuth = await isAuthenticated(sessionName);
  } catch (error) {
    return {
      success: false,
      error: `Authentication check failed: ${error.message}`,
      isAuthenticated: false,
      chats: []
    };
  }
  
  if (!isAuth) {
    return {
      success: false,
      error: 'Session not authenticated',
      isAuthenticated: false,
      chats: []
    };
  }
  
  // Proceed with listing chats
  try {
    const client = await getOrCreateClientWithCallbacks(sessionName);
    const result = await client.listChats(options);
    await client.setOnlinePresence(false);
    
    return {
      success: true,
      chats: result,
      isAuthenticated: true
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      isAuthenticated: false,
      chats: []
    };
  }
}

/**
 * Delete a WhatsApp session (cleans up cached client and persistent data)
 */
async function deleteSession(sessionName) {
  try {
    console.log(`🗑️ Deleting session: ${sessionName}`);
    
    // 1. Handle cached client cleanup (if any exists)
    const cachedClient = clients.get(sessionName);
    if (cachedClient) {
      try {
        console.log(`📱 Found cached client for session: ${sessionName}, logging out and closing it`);
        
        // First logout to properly remove device from WhatsApp
        await cachedClient.logout();
        console.log(`✅ Client logged out successfully for session: ${sessionName}`);
        
        // Then close the browser
        await cachedClient.close();
        console.log(`✅ Cached client closed successfully for session: ${sessionName}`);
      } catch (error) {
        console.log(`⚠️ Error closing cached client for session ${sessionName}: ${error.message}`);
      }
      
      // Remove from cache
      clients.delete(sessionName);
      console.log(`✅ Client removed from cache for session: ${sessionName}`);
    } else {
      console.log(`ℹ️ No cached client found for session: ${sessionName}`);
      
      // 2. If not cached, try to reconnect ONLY if session exists and is paired
      const sessionDataDir = path.join(__dirname, 'data', 'tokens', sessionName);
      if (fs.existsSync(sessionDataDir)) {
        console.log(`📁 Session data exists for: ${sessionName}, attempting to reconnect for proper logout`);
        
        try {
          // Try to reconnect with a timeout - if it takes too long, skip it
          const reconnectPromise = getOrCreateClientWithCallbacks(sessionName);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Reconnect timeout')), 10000) // 10 second timeout
          );
          
          const client = await Promise.race([reconnectPromise, timeoutPromise]);
          
          // Check if authenticated
          const isAuth = await client.isAuthenticated();
          if (isAuth) {
            console.log(`✅ Session is authenticated, logging out properly`);
            await client.logout();
            console.log(`✅ Client logged out successfully for session: ${sessionName}`);
          } else {
            console.log(`⚠️ Session is not authenticated, skipping logout`);
          }
          
          await client.close();
          clients.delete(sessionName);
        } catch (error) {
          console.log(`⚠️ Could not reconnect for proper logout (${error.message}), will just delete files`);
          // Continue with deletion even if reconnection fails
          if (clients.has(sessionName)) {
            clients.delete(sessionName);
          }
        }
      }
    }
    
    // 2. Delete the persistent session data directory
    const sessionDataDir = path.join(__dirname, 'data', 'tokens', sessionName);
    
    if (fs.existsSync(sessionDataDir)) {
      // Wait a moment for file handles to be released after client cleanup
      console.log(`⏳ Waiting for file handles to be released...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Remove the entire session directory
      fs.rmSync(sessionDataDir, { recursive: true, force: true });
      console.log(`✅ Session data directory deleted: ${sessionDataDir}`);
    } else {
      console.log(`ℹ️ Session data directory does not exist: ${sessionDataDir}`);
    }
    
    return {
      sessionName,
      deleted: true,
      clientRemoved: clients.has(sessionName) === false,
      dataDirectoryDeleted: !fs.existsSync(sessionDataDir),
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.log(`❌ Error deleting session ${sessionName}: ${error.message}`);
    throw error;
  }
}


/**
 * Cleanup a failed connection attempt without trying to reconnect
 * Used when initialization fails to free resources
 */
async function cleanupFailedSession(sessionName) {
  try {
    console.log(`🧹 Cleaning up failed session: ${sessionName}`);
    
    // 1. Check if client exists in cache and close it
    const cachedClient = clients.get(sessionName);
    if (cachedClient) {
      try {
        console.log(`📱 Closing cached client for session: ${sessionName}`);
        await cachedClient.close();
        console.log(`✅ Client closed for session: ${sessionName}`);
      } catch (closeError) {
        console.log(`⚠️ Error closing client: ${closeError.message}`);
      }
      
      // Remove from cache
      clients.delete(sessionName);
    }
    
    // 2. Delete the session data directory
    const sessionDataDir = path.join(__dirname, 'data', 'tokens', sessionName);
    
    // Wait a moment for file handles to be released
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Delete the session directory
    if (fs.existsSync(sessionDataDir)) {
      fs.rmSync(sessionDataDir, { recursive: true, force: true });
      console.log(`✅ Deleted session data directory: ${sessionDataDir}`);
    }
    
    console.log(`🧹 Cleanup complete for failed session: ${sessionName}`);
    
    return {
      sessionName,
      cleaned: true,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.log(`❌ Error cleaning up failed session ${sessionName}: ${error.message}`);
    throw error;
  }
}

// Export functions for use
module.exports = {
  getOrCreateClientWithCallbacks,
  getConnectionState,
  isAuthenticated,
  getWid,
  sendText,
  listChats,
  deleteSession,
  cleanupFailedSession
};
