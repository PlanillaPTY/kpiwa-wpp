# How to Run Different WPPConnect Methods

This guide shows you all the different ways to run WPPConnect methods from the `wpp-playground.js` file.

## 🚀 Method 1: Run the Main Playground

The simplest way to see all methods in action:

```bash
node wpp-playground.js
```

This will:
- Initialize the client
- Run basic demos (session info, chats, contacts, unread messages)
- Run messaging demos (send test message, get chat info)
- Keep the client alive for 30 seconds
- Show you example method calls you can try

## 🎯 Method 2: Run Interactive Demo

```bash
node interactive-demo.js
```

This demonstrates calling individual methods step by step.

## 🔧 Method 3: Use Node.js REPL (Interactive Mode)

Start Node.js in interactive mode and import the functions:

```bash
node
```

Then in the Node.js REPL:

```javascript
// Import all the functions
const wpp = require('./wpp-playground.js');

// Initialize client (if not already done)
await wpp.initializeClient('your-session-name');

// Now you can call any method:
await wpp.getSessionInfo();
await wpp.getAllChats();
await wpp.getAllContacts();
await wpp.sendMessage('1234567890@c.us', 'Hello!');
await wpp.getChatMessages('1234567890@c.us', 5);
await wpp.getUnreadMessages();
```

## 📝 Method 4: Create Your Own Script

Create a new file (e.g., `my-script.js`):

```javascript
const { 
  initializeClient, 
  getSessionInfo, 
  sendMessage, 
  getAllChats 
} = require('./wpp-playground.js');

async function myCustomScript() {
  try {
    // Initialize client
    await initializeClient('my-session');
    
    // Call the methods you want
    await getSessionInfo();
    await getAllChats();
    
    // Send a message
    await sendMessage('1234567890@c.us', 'Hello from my script!');
    
  } catch (error) {
    console.log('Error:', error.message);
  }
}

myCustomScript();
```

Then run:
```bash
node my-script.js
```

## 🎮 Method 5: Modify the Playground File

You can directly modify the `wpp-playground.js` file to call specific methods. Look for the `main()` function and add your method calls:

```javascript
// In the main() function, after initializeClient():
await initializeClient(sessionName);

// Add your custom method calls here:
await sendMessage('1234567890@c.us', 'Custom message!');
await getChatMessages('1234567890@c.us', 10);
await getAllContacts();
```

## 📋 Available Methods

Here are all the methods you can call:

### 🔍 Information Methods
- `getSessionInfo()` - Get connection status, battery, device info
- `getAllChats()` - Get all your WhatsApp chats
- `getAllContacts()` - Get all your contacts
- `getChatById(chatId)` - Get specific chat information
- `getUnreadMessages()` - Get chats with unread messages

### 💬 Messaging Methods
- `sendMessage(to, message)` - Send a text message
- `sendImage(to, imagePath, caption)` - Send an image
- `sendFile(to, filePath, fileName)` - Send a file
- `getChatMessages(chatId, limit)` - Get messages from a chat

### 🎭 Chat State Methods
- `setChatState(chatId, state)` - Mark messages as read, etc.

### 🎪 Demo Methods
- `runBasicDemo()` - Run all basic information methods
- `runMessagingDemo()` - Run messaging-related methods

### 🔧 Utility Methods
- `initializeClient(sessionName)` - Initialize the client
- `closeClient()` - Close the client connection

## 📞 Example: Send Message to Specific Number

```javascript
const { initializeClient, sendMessage } = require('./wpp-playground.js');

async function sendToNumber() {
  await initializeClient('my-session');
  
  // Replace with actual phone number (include country code)
  const phoneNumber = '1234567890@c.us'; // Format: number@c.us
  await sendMessage(phoneNumber, 'Hello from WPPConnect! 🚀');
}

sendToNumber();
```

## 📱 Example: Get Messages from a Chat

```javascript
const { initializeClient, getChatMessages } = require('./wpp-playground.js');

async function getMessages() {
  await initializeClient('my-session');
  
  // Get last 10 messages from a specific chat
  const chatId = '1234567890@c.us';
  await getChatMessages(chatId, 10);
}

getMessages();
```

## 🖼️ Example: Send Image

```javascript
const { initializeClient, sendImage } = require('./wpp-playground.js');

async function sendImageMessage() {
  await initializeClient('my-session');
  
  const phoneNumber = '1234567890@c.us';
  const imagePath = './my-image.jpg';
  const caption = 'Check out this image!';
  
  await sendImage(phoneNumber, imagePath, caption);
}

sendImageMessage();
```

## 📎 Example: Send File

```javascript
const { initializeClient, sendFile } = require('./wpp-playground.js');

async function sendFileMessage() {
  await initializeClient('my-session');
  
  const phoneNumber = '1234567890@c.us';
  const filePath = './document.pdf';
  const fileName = 'Important Document.pdf';
  
  await sendFile(phoneNumber, filePath, fileName);
}

sendFileMessage();
```

## ⚠️ Important Notes

1. **Phone Number Format**: Always use the format `number@c.us` (e.g., `1234567890@c.us`)
2. **Session Name**: Use the same session name that exists in your `tokens/` folder
3. **Client Initialization**: Always call `initializeClient()` before using other methods
4. **Error Handling**: All methods include error handling, but you can add your own
5. **File Paths**: Use absolute paths or paths relative to your script location

## 🎯 Quick Start

1. **First time**: Run `node wpp-playground.js` to see everything in action
2. **Custom usage**: Create your own script using the examples above
3. **Interactive**: Use Node.js REPL for testing individual methods
4. **Production**: Use the server pattern from `wpp-server-example.js`

## 🔍 Troubleshooting

- **"Client not initialized"**: Call `initializeClient()` first
- **"Session not found"**: Check your `tokens/` folder for available sessions
- **"QR code needed"**: Scan the QR code that appears in the console
- **"Message not sent"**: Check the phone number format and ensure the number exists

Remember: The client is created once and reused for all operations - that's the key to efficient WPPConnect usage! 