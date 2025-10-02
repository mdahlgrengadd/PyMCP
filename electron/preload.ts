import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script - secure bridge between main and renderer processes
 * Exposes limited, safe IPC communication via window.electronAPI
 */

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Check if running in Electron
   */
  isElectron: true,

  /**
   * Listen for MCP requests from main process (HTTP → Renderer)
   */
  onMcpRequest: (callback: (data: { requestId: string; jsonRpcRequest: any }) => void) => {
    ipcRenderer.on('mcp-request', (_event, data) => callback(data));
  },

  /**
   * Send MCP response back to main process (Renderer → HTTP)
   */
  sendMcpResponse: (requestId: string, response: any) => {
    ipcRenderer.send('mcp-response', { requestId, response });
  },

  /**
   * Send MCP error back to main process
   */
  sendMcpError: (requestId: string, error: string) => {
    ipcRenderer.send('mcp-error', { requestId, error });
  },

  /**
   * Notify main process that MCP server is ready
   */
  sendMcpReady: () => {
    ipcRenderer.send('mcp-ready');
  }
});

// Type declaration for TypeScript
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      onMcpRequest: (callback: (data: { requestId: string; jsonRpcRequest: any }) => void) => void;
      sendMcpResponse: (requestId: string, response: any) => void;
      sendMcpError: (requestId: string, error: string) => void;
      sendMcpReady: () => void;
    };
  }
}
