#!/usr/bin/env node
/**
 * Simple HTTP proxy that forwards MCP requests to the browser's Service Worker
 * Run this alongside `npm run dev` to allow Cursor/VS Code to connect
 */

import express from 'express';
import cors from 'cors';

const app = express();
const PROXY_PORT = 3000;
const VITE_DEV_SERVER = 'http://localhost:5173';

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'pymcp-proxy' });
});

// Proxy MCP requests to Service Worker
app.post('/mcp', async (req, res) => {
  try {
    const response = await fetch(`${VITE_DEV_SERVER}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2025-06-18'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: `Proxy error: ${error.message}`
      }
    });
  }
});

app.listen(PROXY_PORT, () => {
  console.log(`\n✅ MCP Proxy Server running on http://localhost:${PROXY_PORT}/mcp`);
  console.log(`   Forwarding to Service Worker at ${VITE_DEV_SERVER}/mcp\n`);
  console.log(`Configure Cursor/VS Code with:\n`);
  console.log(`{`);
  console.log(`  "mcpServers": {`);
  console.log(`    "pymcp": {`);
  console.log(`      "url": "http://localhost:${PROXY_PORT}/mcp"`);
  console.log(`    }`);
  console.log(`  }`);
  console.log(`}\n`);
  console.log(`Make sure to:`);
  console.log(`  1. Run: npm run dev`);
  console.log(`  2. Open http://localhost:5173 in browser`);
  console.log(`  3. Boot Pyodide with Service Worker transport`);
  console.log(`  4. Reload page and boot again`);
  console.log(`  5. Then this proxy will work\n`);
});
