import { app, BrowserWindow, ipcMain } from 'electron';

import express from 'express';
import cors from 'cors';
import * as path from 'path';

// In CommonJS (compiled from TypeScript), __dirname is automatically available

let mainWindow: BrowserWindow | null = null;
let httpServer: any = null;
const MCP_PORT = 3000;

// Track pending requests
const pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (error: any) => void }>();

/**
 * Create the main Electron window
 */
function createWindow(headless: boolean = false) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: !headless,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the built Vite app
  const indexPath = path.join(__dirname, '../dist/index.html');
  mainWindow.loadFile(indexPath);

  if (!headless) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Start HTTP server that forwards to the Electron renderer's MCP server
 */
function startHttpServer() {
  const server = express();

  // Enable CORS for external clients
  server.use(cors({
    origin: '*',
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'MCP-Protocol-Version']
  }));

  server.use(express.json());

  // Health check endpoint
  server.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'pymcp-electron' });
  });

  // MCP endpoint - forward to renderer
  server.post('/mcp', async (req, res) => {
    try {
      if (!mainWindow) {
        return res.status(503).json({
          jsonrpc: '2.0',
          id: req.body?.id || null,
          error: { code: -32000, message: 'Renderer not ready' }
        });
      }

      const requestId = `http-${Date.now()}-${Math.random()}`;
      const jsonRpcRequest = req.body;

      console.log(`[HTTP] Incoming request:`, jsonRpcRequest.method);

      // Create a promise that will be resolved when renderer responds
      const responsePromise = new Promise((resolve, reject) => {
        pendingRequests.set(requestId, { resolve, reject });

        // Timeout after 30 seconds
        setTimeout(() => {
          if (pendingRequests.has(requestId)) {
            pendingRequests.delete(requestId);
            reject(new Error('Request timeout'));
          }
        }, 30000);
      });

      // Send to renderer
      mainWindow.webContents.send('mcp-request', { requestId, jsonRpcRequest });

      // Wait for response
      const response = await responsePromise;

      console.log(`[HTTP] Response for ${jsonRpcRequest.method}:`, response);
      res.json(response);

    } catch (error: any) {
      console.error('[HTTP] Error:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id || null,
        error: {
          code: -32603,
          message: error?.message || 'Internal server error'
        }
      });
    }
  });

  httpServer = server.listen(MCP_PORT, () => {
    console.log(`\n✅ MCP HTTP Server running on http://localhost:${MCP_PORT}/mcp`);
    console.log(`\nConfigure Cursor/VS Code with:\n`);
    console.log(`{`);
    console.log(`  "mcpServers": {`);
    console.log(`    "pymcp": {`);
    console.log(`      "url": "http://localhost:${MCP_PORT}/mcp"`);
    console.log(`    }`);
    console.log(`  }`);
    console.log(`}\n`);
  });
}

/**
 * Handle IPC messages from renderer
 */
function setupIPC() {
  // Response from renderer's MCP server
  ipcMain.on('mcp-response', (_event, { requestId, response }) => {
    const pending = pendingRequests.get(requestId);
    if (pending) {
      pending.resolve(response);
      pendingRequests.delete(requestId);
    }
  });

  // Error from renderer
  ipcMain.on('mcp-error', (_event, { requestId, error }) => {
    const pending = pendingRequests.get(requestId);
    if (pending) {
      pending.reject(new Error(error));
      pendingRequests.delete(requestId);
    }
  });

  // Renderer ready signal
  ipcMain.on('mcp-ready', () => {
    console.log('✅ Renderer MCP server ready');
  });
}

/**
 * App lifecycle
 */
app.whenReady().then(() => {
  const headless = process.argv.includes('--headless');

  console.log(`Starting PyMCP Electron in ${headless ? 'headless' : 'GUI'} mode...`);

  setupIPC();
  createWindow(headless);

  // Wait a bit for renderer to load, then start HTTP server
  setTimeout(() => {
    startHttpServer();
  }, 2000);
});

app.on('window-all-closed', () => {
  if (httpServer) {
    httpServer.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('quit', () => {
  if (httpServer) {
    httpServer.close();
  }
});
