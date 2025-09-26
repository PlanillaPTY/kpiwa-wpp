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

// Health check endpoint - lightweight and fast
app.get('/health', (req, res) => {
  // Quick response without heavy operations
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime())
  });
});

// API Routes

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
      
      // Auto-disconnect clients when WhatsApp is fully connected and ready for messaging
      if (statusData.status === 'inChat') {
        console.log(`🔌 Auto-disconnecting WebSocket clients for session: ${sessionName} (WhatsApp fully connected)`);
        
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
 * @route POST /api/sessions/:sessionName/send-message
 * @desc Send a text message
 */
app.post('/api/sessions/:sessionName/send-message', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to, message'
      });
    }
    
    const result = await wpp.sendText(sessionName, to, message);
    
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
    
    const chats = await wpp.listChats(sessionName, options);
    
    res.json({
      success: true,
      data: chats,
      count: chats.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/sessions/:sessionName/connection-state
 * @desc Get connection state
 */
app.get('/api/sessions/:sessionName/connection-state', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const connectionState = await wpp.getConnectionState(sessionName);
    
    res.json({
      success: true,
      data: { connectionState }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/sessions/:sessionName/authenticated
 * @desc Check if authenticated
 */
app.get('/api/sessions/:sessionName/authenticated', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const isAuthenticated = await wpp.isAuthenticated(sessionName);
    
    res.json({
      success: true,
      data: { isAuthenticated }
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
 * @route DELETE /api/sessions/:sessionName
 * @desc Delete a WhatsApp session (cleans up cached client and persistent data)
 */
app.delete('/api/sessions/:sessionName', async (req, res) => {
  try {
    const { sessionName } = req.params;
    
    // Delete the session using the wpp module
    const result = await wpp.deleteSession(sessionName);
    
    res.json({
      success: true,
      message: `Session ${sessionName} deleted successfully`,
      data: result
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
  console.log(`   GET    /health - Health check`);
  console.log(`   POST   /api/sessions/:sessionName/initialize-with-qr - Initialize with WebSocket QR updates`);
  console.log(`   POST   /api/sessions/:sessionName/send-message - Send text message`);
  console.log(`   GET    /api/sessions/:sessionName/chats - List chats`);
  console.log(`   GET    /api/sessions/:sessionName/connection-state - Get connection state`);
  console.log(`   GET    /api/sessions/:sessionName/authenticated - Check if authenticated`);
  console.log(`   GET    /api/sessions/:sessionName/wid - Get WID`);
  console.log(`   DELETE /api/sessions/:sessionName - Delete session (cleans up client and data)`);
});

module.exports = app;
