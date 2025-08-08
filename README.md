# KPIWA WhatsApp API Server

A REST API server built on top of WPPConnect for WhatsApp automation. This server provides HTTP endpoints to manage WhatsApp sessions, send messages, and interact with WhatsApp Web programmatically.

## Features

- 🔐 Multi-session WhatsApp management
- 📱 Persistent session storage with token management
- 📨 Send text messages, images, and files
- 📋 Retrieve chats, contacts, and messages
- 🔍 Session status monitoring
- 📊 Rate limiting and security middleware
- 🐳 Docker support with fly.io deployment configuration

## Quick Start

### Local Development

1. **Install dependencies:**
   ```bash
   cd sandbox
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   # or for development with auto-reload
   npm run dev
   ```

3. **Server will be running on:** `http://localhost:3000`

### Using Docker

1. **Build the image:**
   ```bash
   docker build -t kpiwa-wpp-api .
   ```

2. **Run the container:**
   ```bash
   docker run -p 3000:3000 -v $(pwd)/tokens:/app/tokens -v $(pwd)/session_tokens:/app/session_tokens kpiwa-wpp-api
   ```

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Session Management
- `GET /api/sessions` - List all sessions
- `GET /api/sessions/status` - Get status of all sessions
- `GET /api/sessions/:sessionName/status` - Get specific session status
- `POST /api/sessions/:sessionName/initialize` - Initialize a session
- `DELETE /api/sessions/:sessionName` - Delete a session
- `GET /api/sessions/:sessionName/info` - Get detailed session information
- `POST /api/sessions/:sessionName/logout` - Logout from WhatsApp
- `GET /api/sessions/:sessionName/wid` - Get WhatsApp ID
- `GET /api/sessions/:sessionName/token` - Get token information

### Messaging
- `POST /api/sessions/:sessionName/send-message` - Send text message
- `POST /api/sessions/:sessionName/send-image` - Send image (multipart/form-data)
- `POST /api/sessions/:sessionName/send-file` - Send file (multipart/form-data)

### Data Retrieval
- `GET /api/sessions/:sessionName/chats` - List chats (supports query parameters)
- `GET /api/sessions/:sessionName/chats/:chatId/messages` - Get chat messages
- `GET /api/sessions/:sessionName/contacts` - Get all contacts
- `GET /api/sessions/:sessionName/contacts/:contactId` - Get specific contact
- `GET /api/sessions/:sessionName/unread` - Get unread messages

## API Usage Examples

### Initialize a Session
```bash
curl -X POST http://localhost:3000/api/sessions/my-session/initialize
```

### Send a Text Message
```bash
curl -X POST http://localhost:3000/api/sessions/my-session/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "to": "1234567890@c.us",
    "message": "Hello from API!",
    "trackDelivery": true
  }'
```

### Send an Image
```bash
curl -X POST http://localhost:3000/api/sessions/my-session/send-image \
  -F "to=1234567890@c.us" \
  -F "caption=Check out this image!" \
  -F "image=@/path/to/image.jpg"
```

### List Chats (with filters)
```bash
# Get only group chats
curl "http://localhost:3000/api/sessions/my-session/chats?onlyGroups=true"

# Get chats with unread messages
curl "http://localhost:3000/api/sessions/my-session/chats?onlyWithUnreadMessage=true&count=10"
```

### Get Session Status
```bash
curl http://localhost:3000/api/sessions/my-session/status
```

## Deployment on Fly.io

### Prerequisites
1. Install the [Fly CLI](https://fly.io/docs/getting-started/installing-flyctl/)
2. Sign up for a Fly.io account: `flyctl auth signup`

### Deploy Steps

1. **Create volumes for persistent storage:**
   ```bash
   flyctl volumes create kpiwa_tokens --region iad --size 1
   flyctl volumes create kpiwa_session_tokens --region iad --size 1
   ```

2. **Deploy the application:**
   ```bash
   flyctl deploy
   ```

3. **Set environment variables (optional):**
   ```bash
   flyctl secrets set NODE_ENV=production
   ```

4. **Monitor logs:**
   ```bash
   flyctl logs
   ```

### Fly.io Configuration

The `fly.toml` file includes:
- **Persistent volumes** for token storage
- **Health checks** for reliability
- **Auto-scaling** configuration
- **HTTP/HTTPS** handling
- **Memory and CPU** allocation (1GB RAM, 1 shared CPU)

## Environment Variables

Create a `.env` file based on `env.example`:

```env
PORT=3000
NODE_ENV=production
TOKEN_STORE_PATH=./session_tokens
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
MAX_FILE_SIZE=10485760
```

## Security Features

- **Rate limiting:** 100 requests per 15 minutes per IP
- **CORS protection:** Cross-origin request handling
- **Helmet.js:** Security headers
- **File upload limits:** 10MB maximum file size
- **Request logging:** Morgan middleware for access logs

## Session Management

Sessions are stored persistently using WPPConnect's FileTokenStore:
- **Tokens directory:** `./session_tokens/` (configurable)
- **Browser data:** `./tokens/` (Puppeteer user data)
- **Multi-session support:** Each session runs independently
- **Auto-reconnection:** Sessions persist across server restarts

## Error Handling

All endpoints return consistent JSON responses:

**Success Response:**
```json
{
  "success": true,
  "data": {...},
  "message": "Operation completed successfully"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message description"
}
```

## Monitoring and Health

- **Health endpoint:** `/health` returns server status and uptime
- **Logging:** Comprehensive request and error logging
- **Graceful shutdown:** Properly closes WhatsApp sessions on termination

## Development

### File Structure
```
sandbox/
├── server.js              # Main Express server
├── wpp-playground.js       # WhatsApp functionality
├── test-default-tokens.js  # Testing utilities
├── package.json           # Dependencies
├── Dockerfile            # Container configuration
├── fly.toml              # Fly.io deployment config
├── .dockerignore         # Docker ignore rules
├── env.example           # Environment variables template
└── README.md             # This file
```

### Adding New Endpoints

1. Add route handler in `server.js`
2. Import required functions from `wpp-playground.js`
3. Follow the existing error handling pattern
4. Update this README with the new endpoint

## Troubleshooting

### Common Issues

1. **Session not initializing:** Check if Chrome/Chromium is properly installed in the container
2. **Token storage issues:** Ensure persistent volumes are properly mounted
3. **Memory issues:** WhatsApp sessions can be memory-intensive; monitor usage
4. **QR Code scanning:** For new sessions, check logs for QR code output

### Logs and Debugging

```bash
# Local development
npm run dev

# Docker logs
docker logs container-name

# Fly.io logs
flyctl logs
```

## License

ISC License - See package.json for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request
