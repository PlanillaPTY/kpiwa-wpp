const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// Import WhatsApp functionality
const wpp = require('./wpp-playground');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Configure this properly for production
    methods: ["GET", "POST"]
  }
});
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes

/**
 * @route GET /api/sessions
 * @desc List all WhatsApp sessions
 */
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await wpp.listSessions();
    res.json({
      success: true,
      data: sessions,
      count: sessions.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/sessions/status
 * @desc Get status of all sessions
 */
app.get('/api/sessions/status', async (req, res) => {
  try {
    const statuses = await wpp.getAllSessionsStatus();
    res.json({
      success: true,
      data: statuses
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/sessions/:sessionName/status
 * @desc Get status of a specific session
 */
app.get('/api/sessions/:sessionName/status', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const status = await wpp.getSessionStatus(sessionName);
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/sessions/:sessionName/initialize
 * @desc Initialize a WhatsApp session
 */
app.post('/api/sessions/:sessionName/initialize', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const options = req.body || {};
    
    const client = await wpp.initializeClient(sessionName, options);
    
    res.json({
      success: true,
      message: `Session ${sessionName} initialized successfully`,
      data: {
        sessionName,
        initialized: true
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/sessions/:sessionName/initialize-with-qr
 * @desc Initialize a WhatsApp session with real-time QR code and status updates via WebSocket
 */
app.post('/api/sessions/:sessionName/initialize-with-qr', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const options = req.body || {};
    
    // Set up WebSocket callbacks for QR code and status updates
    const qrCallback = (qrData) => {
      console.log(`📡 Emitting QR code for session: ${sessionName}`);
      io.to(`session-${sessionName}`).emit('qr-code', qrData);
    };
    
    const statusCallback = (statusData) => {
      console.log(`📡 Emitting status update for session: ${sessionName}`, statusData.status);
      io.to(`session-${sessionName}`).emit('status-update', statusData);
      
      // Auto-disconnect clients when WhatsApp is successfully connected
      if (statusData.status === 'authenticated' || statusData.status === 'ready' || statusData.status === 'inChat') {
        console.log(`🔌 Auto-disconnecting WebSocket clients for session: ${sessionName} (WhatsApp connected)`);
        
        // Get all sockets in the session room and disconnect them
        const room = io.sockets.adapter.rooms.get(`session-${sessionName}`);
        if (room) {
          room.forEach(socketId => {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
              socket.emit('session-complete', {
                sessionName: sessionName,
                status: statusData.status,
                message: 'WhatsApp connected successfully. WebSocket connection will be closed.',
                timestamp: new Date().toISOString()
              });
              
              // Disconnect after a brief delay to ensure the message is sent
              setTimeout(() => {
                socket.disconnect();
                console.log(`🔌 Disconnected WebSocket client: ${socketId}`);
              }, 1000);
            }
          });
        }
      }
    };
    
    // Respond immediately that initialization has started
    res.json({
      success: true,
      message: `Session ${sessionName} initialization started. Connect to WebSocket and join room 'session-${sessionName}' for QR code and status updates`,
      data: {
        sessionName,
        initializing: true,
        websocketRoom: `session-${sessionName}`,
        events: {
          qrCode: 'qr-code',
          statusUpdate: 'status-update'
        }
      }
    });
    
    // Start initialization asynchronously with callbacks
    wpp.getOrCreateClientWithCallbacks(sessionName, {
      ...options,
      onQRCode: qrCallback,
      onStatusChange: statusCallback
    }).then((client) => {
      console.log(`✅ Session ${sessionName} initialized successfully`);
      // Final status update to confirm successful initialization
      statusCallback({
        status: 'ready',
        sessionName: sessionName,
        timestamp: new Date().toISOString(),
        message: 'Client fully initialized and ready'
      });
    }).catch((error) => {
      console.log(`❌ Error initializing session ${sessionName}:`, error.message);
      // Error status update
      statusCallback({
        status: 'initialization-error',
        sessionName: sessionName,
        timestamp: new Date().toISOString(),
        error: error.message
      });
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route DELETE /api/sessions/:sessionName
 * @desc Delete a WhatsApp session
 */
app.delete('/api/sessions/:sessionName', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const success = await wpp.deleteSession(sessionName);
    
    if (success) {
      res.json({
        success: true,
        message: `Session ${sessionName} deleted successfully`
      });
    } else {
      res.status(404).json({
        success: false,
        error: `Session ${sessionName} not found`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/sessions/:sessionName/info
 * @desc Get session information
 */
app.get('/api/sessions/:sessionName/info', async (req, res) => {
  try {
    const { sessionName } = req.params;
    
    // Capture console output to return as part of the response
    let output = '';
    const originalLog = console.log;
    console.log = (...args) => {
      output += args.join(' ') + '\n';
      originalLog(...args);
    };
    
    await wpp.getSessionInfo(sessionName);
    
    // Restore original console.log
    console.log = originalLog;
    
    res.json({
      success: true,
      message: 'Session info retrieved successfully',
      output: output
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/sessions/:sessionName/send-message
 * @desc Send a text message
 */
app.post('/api/sessions/:sessionName/send-message', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const { to, message, trackDelivery = false } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to, message'
      });
    }
    
    let result;
    if (trackDelivery) {
      result = await wpp.sendMessageWithTracking(sessionName, to, message, true);
    } else {
      result = await wpp.sendMessage(sessionName, to, message);
    }
    
    res.json({
      success: true,
      message: 'Message sent successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Removed send-image and send-file endpoints (upload functionality disabled)

/**
 * @route GET /api/sessions/:sessionName/chats
 * @desc List chats
 */
app.get('/api/sessions/:sessionName/chats', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const options = req.query;
    
    // Convert string boolean values to actual booleans
    Object.keys(options).forEach(key => {
      if (options[key] === 'true') options[key] = true;
      if (options[key] === 'false') options[key] = false;
      if (!isNaN(options[key]) && options[key] !== '') options[key] = parseInt(options[key]);
    });
    
    // Capture console output to return as part of the response
    let output = '';
    const originalLog = console.log;
    console.log = (...args) => {
      output += args.join(' ') + '\n';
      originalLog(...args);
    };
    
    await wpp.listChats(sessionName, options);
    
    // Restore original console.log
    console.log = originalLog;
    
    res.json({
      success: true,
      message: 'Chats retrieved successfully',
      output: output
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/sessions/:sessionName/chats/:chatId/messages
 * @desc Get chat messages
 */
app.get('/api/sessions/:sessionName/chats/:chatId/messages', async (req, res) => {
  try {
    const { sessionName, chatId } = req.params;
    const { limit = 10 } = req.query;
    
    // Capture console output to return as part of the response
    let output = '';
    const originalLog = console.log;
    console.log = (...args) => {
      output += args.join(' ') + '\n';
      originalLog(...args);
    };
    
    await wpp.getChatMessages(sessionName, chatId, parseInt(limit));
    
    // Restore original console.log
    console.log = originalLog;
    
    res.json({
      success: true,
      message: 'Messages retrieved successfully',
      output: output
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/sessions/:sessionName/contacts
 * @desc Get all contacts
 */
app.get('/api/sessions/:sessionName/contacts', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const contacts = await wpp.getAllContacts(sessionName);
    
    res.json({
      success: true,
      data: contacts,
      count: contacts.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/sessions/:sessionName/contacts/:contactId
 * @desc Get contact details
 */
app.get('/api/sessions/:sessionName/contacts/:contactId', async (req, res) => {
  try {
    const { sessionName, contactId } = req.params;
    const contact = await wpp.getContact(sessionName, contactId);
    
    res.json({
      success: true,
      data: contact
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/sessions/:sessionName/unread
 * @desc Get unread messages
 */
app.get('/api/sessions/:sessionName/unread', async (req, res) => {
  try {
    const { sessionName } = req.params;
    
    // Capture console output to return as part of the response
    let output = '';
    const originalLog = console.log;
    console.log = (...args) => {
      output += args.join(' ') + '\n';
      originalLog(...args);
    };
    
    await wpp.getUnreadMessages(sessionName);
    
    // Restore original console.log
    console.log = originalLog;
    
    res.json({
      success: true,
      message: 'Unread messages retrieved successfully',
      output: output
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/sessions/:sessionName/logout
 * @desc Logout from WhatsApp
 */
app.post('/api/sessions/:sessionName/logout', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const success = await wpp.logout(sessionName);
    
    res.json({
      success,
      message: success ? 'Logged out successfully' : 'Failed to logout'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/sessions/:sessionName/wid
 * @desc Get current WID
 */
app.get('/api/sessions/:sessionName/wid', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const wid = await wpp.getWid(sessionName);
    
    res.json({
      success: true,
      data: { wid }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/sessions/:sessionName/token
 * @desc Get token information
 */
app.get('/api/sessions/:sessionName/token', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const tokenInfo = await wpp.getTokenInfo(sessionName);
    
    res.json({
      success: true,
      data: tokenInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Something went wrong!'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await wpp.closeAllClients();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await wpp.closeAllClients();
  process.exit(0);
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`📡 Client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`📡 Client disconnected: ${socket.id}`);
  });
  
  // Join a session room for targeted updates
  socket.on('join-session', (sessionName) => {
    socket.join(`session-${sessionName}`);
    console.log(`📡 Client ${socket.id} joined session room: ${sessionName}`);
  });
  
  // Leave a session room
  socket.on('leave-session', (sessionName) => {
    socket.leave(`session-${sessionName}`);
    console.log(`📡 Client ${socket.id} left session room: ${sessionName}`);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 WhatsApp API Server running on port ${PORT}`);
  console.log(`📡 WebSocket server running on the same port`);
  console.log(`📚 API Documentation:`);
  console.log(`   GET  /health - Health check`);
  console.log(`   GET  /api/sessions - List all sessions`);
  console.log(`   GET  /api/sessions/status - Get all sessions status`);
  console.log(`   GET  /api/sessions/:sessionName/status - Get session status`);
  console.log(`   POST /api/sessions/:sessionName/initialize - Initialize session`);
  console.log(`   POST /api/sessions/:sessionName/initialize-with-qr - Initialize with WebSocket QR updates`);
  console.log(`   DELETE /api/sessions/:sessionName - Delete session`);
  console.log(`   GET  /api/sessions/:sessionName/info - Get session info`);
  console.log(`   POST /api/sessions/:sessionName/send-message - Send text message`);
  console.log(`   GET  /api/sessions/:sessionName/chats - List chats`);
  console.log(`   GET  /api/sessions/:sessionName/chats/:chatId/messages - Get messages`);
  console.log(`   GET  /api/sessions/:sessionName/contacts - Get all contacts`);
  console.log(`   GET  /api/sessions/:sessionName/contacts/:contactId - Get contact`);
  console.log(`   GET  /api/sessions/:sessionName/unread - Get unread messages`);
  console.log(`   POST /api/sessions/:sessionName/logout - Logout`);
  console.log(`   GET  /api/sessions/:sessionName/wid - Get WID`);
  console.log(`   GET  /api/sessions/:sessionName/token - Get token info`);
});

module.exports = app;
