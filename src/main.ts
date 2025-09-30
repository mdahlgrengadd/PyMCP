import './styles/chat.css';
import { PyodideMcpClient } from './lib/mcp-pyodide-client';
import { WebLLMClient } from './lib/webllm-client';
import { McpWebLLMBridge, ToolExecution } from './lib/mcp-webllm-bridge';
import type { ChatMessage } from './lib/webllm-client';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

// ============================================================================
// State Management
// ============================================================================

interface AppState {
  llmClient: WebLLMClient | null;
  mcpClient: PyodideMcpClient | null;
  bridge: McpWebLLMBridge | null;
  conversationHistory: ChatMessage[];
  isLLMLoaded: boolean;
  isMCPLoaded: boolean;
  isGenerating: boolean;
  currentModelId: string;
}

const state: AppState = {
  llmClient: null,
  mcpClient: null,
  bridge: null,
  conversationHistory: [],
  isLLMLoaded: false,
  isMCPLoaded: false,
  isGenerating: false,
  currentModelId: ''
};

// ============================================================================
// DOM Elements
// ============================================================================

const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
const loadModelBtn = document.getElementById('load-model-btn') as HTMLButtonElement;
const modelProgress = document.getElementById('model-progress') as HTMLDivElement;
const progressFill = document.getElementById('progress-fill') as HTMLDivElement;
const progressText = document.getElementById('progress-text') as HTMLParagraphElement;
const modelStatus = document.getElementById('model-status') as HTMLSpanElement;

const serverSelect = document.getElementById('server-select') as HTMLSelectElement;
const serverUrlInput = document.getElementById('server-url') as HTMLInputElement;
const pyodideUrlInput = document.getElementById('pyodide-url') as HTMLInputElement;
const bootMcpBtn = document.getElementById('boot-mcp-btn') as HTMLButtonElement;
const toolsStatus = document.getElementById('tools-status') as HTMLSpanElement;
const toolsList = document.getElementById('tools-list') as HTMLDivElement;
const refreshToolsBtn = document.getElementById('refresh-tools-btn') as HTMLButtonElement;

const chatMessages = document.getElementById('chat-messages') as HTMLDivElement;
const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;

const autoScrollCheckbox = document.getElementById('auto-scroll') as HTMLInputElement;
const streamResponseCheckbox = document.getElementById('stream-response') as HTMLInputElement;
const clearChatBtn = document.getElementById('clear-chat-btn') as HTMLButtonElement;

// ============================================================================
// Event Listeners
// ============================================================================

loadModelBtn.addEventListener('click', handleLoadModel);
bootMcpBtn.addEventListener('click', handleBootMCP);
refreshToolsBtn.addEventListener('click', handleRefreshTools);
sendBtn.addEventListener('click', handleSendMessage);
stopBtn.addEventListener('click', handleStopGeneration);
clearChatBtn.addEventListener('click', handleClearChat);

serverSelect.addEventListener('change', () => {
  const isCustomUrl = serverSelect.value === 'url';
  serverUrlInput.style.display = isCustomUrl ? 'block' : 'none';
  
  if (serverSelect.value === 'example') {
    serverUrlInput.value = '/example_remote_server.py';
  } else if (serverSelect.value === 'clean') {
    serverUrlInput.value = '/clean_server.py';
  } else if (!isCustomUrl) {
    serverUrlInput.value = '';
  }
});

chatInput.addEventListener('input', () => {
  // Auto-resize textarea
  chatInput.style.height = 'auto';
  chatInput.style.height = chatInput.scrollHeight + 'px';
  
  // Enable/disable send button
  sendBtn.disabled = !chatInput.value.trim() || !state.isLLMLoaded || state.isGenerating;
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) {
      handleSendMessage();
    }
  }
});

// ============================================================================
// Model Loading
// ============================================================================

async function handleLoadModel() {
  const modelId = modelSelect.value;
  
  try {
    loadModelBtn.disabled = true;
    modelProgress.style.display = 'block';
    modelStatus.textContent = 'Loading...';
    
    state.llmClient = new WebLLMClient();
    
    await state.llmClient.init(modelId, (report) => {
      const progress = Math.round(report.progress * 100);
      progressFill.style.width = `${progress}%`;
      progressText.textContent = report.text;
    });
    
    state.isLLMLoaded = true;
    state.currentModelId = modelId;
    modelStatus.textContent = `✓ ${modelId.split('-')[0]} loaded`;
    modelStatus.style.color = 'var(--success)';
    
    addSystemMessage(`Model ${modelId} loaded successfully! ${state.isMCPLoaded ? 'You can now chat with tool support.' : 'Boot MCP server for tool support.'}`);
    
    // Create bridge if MCP is already loaded
    if (state.mcpClient) {
      state.bridge = new McpWebLLMBridge(state.llmClient, state.mcpClient);
    }
    
    updateUIState();
  } catch (error: any) {
    console.error('Failed to load model:', error);
    modelStatus.textContent = '✗ Load failed';
    modelStatus.style.color = 'var(--danger)';
    addSystemMessage(`Failed to load model: ${error.message}`);
  } finally {
    loadModelBtn.disabled = false;
    setTimeout(() => {
      modelProgress.style.display = 'none';
    }, 2000);
  }
}

// ============================================================================
// MCP Server Loading
// ============================================================================

async function handleBootMCP() {
  try {
    bootMcpBtn.disabled = true;
    toolsStatus.textContent = 'Loading...';
    
    addSystemMessage('Booting MCP server...');
    
    const worker = new Worker(
      new URL('./workers/py.worker.ts', import.meta.url),
      { type: 'module' }
    );
    
    const serverType: 'embedded' | 'url' = 
      serverSelect.value === 'embedded' ? 'embedded' : 'url';
    
    const serverConfig = serverType === 'url' ? {
      serverType,
      serverUrl: serverSelect.value === 'url' 
        ? serverUrlInput.value.trim()
        : serverUrlInput.value
    } : { serverType };
    
    state.mcpClient = await new PyodideMcpClient(worker).init(
      pyodideUrlInput.value,
      serverConfig
    );
    
    state.isMCPLoaded = true;
    
    // Create bridge if LLM is already loaded
    if (state.llmClient) {
      state.bridge = new McpWebLLMBridge(state.llmClient, state.mcpClient);
    }
    
    await handleRefreshTools();
    
    addSystemMessage('MCP server booted successfully!');
    updateUIState();
  } catch (error: any) {
    console.error('Failed to boot MCP:', error);
    toolsStatus.textContent = '✗ Boot failed';
    addSystemMessage(`Failed to boot MCP: ${error.message}`);
  } finally {
    bootMcpBtn.disabled = false;
  }
}

async function handleRefreshTools() {
  if (!state.mcpClient) return;
  
  try {
    const tools = await state.mcpClient.listTools();
    toolsStatus.textContent = `${tools.length} tools`;
    toolsStatus.style.color = tools.length > 0 ? 'var(--success)' : 'var(--text-secondary)';
    
    if (tools.length === 0) {
      toolsList.innerHTML = '<p class="muted">No tools available</p>';
    } else {
      toolsList.innerHTML = tools.map((tool: any) => `
        <div class="tool-item">
          <div class="tool-name">${tool.name}</div>
          ${tool.description ? `<div class="tool-desc">${tool.description}</div>` : ''}
        </div>
      `).join('');
    }
  } catch (error: any) {
    console.error('Failed to refresh tools:', error);
  }
}

// ============================================================================
// Chat Functionality
// ============================================================================

async function handleSendMessage() {
  const message = chatInput.value.trim();
  if (!message || !state.isLLMLoaded || state.isGenerating) return;
  
  // Clear input
  chatInput.value = '';
  chatInput.style.height = 'auto';
  
  // Add user message to UI
  addUserMessage(message);
  
  // Update state
  state.isGenerating = true;
  updateUIState();
  
  try {
    // Show typing indicator
    const typingId = addTypingIndicator();
    
    if (state.bridge && state.isMCPLoaded) {
      // Chat with tool support
      const systemPrompt = `You are a helpful AI assistant with access to tools. Use tools when appropriate to help answer the user's questions. Always explain what you're doing when you use tools.`;
      
      let currentMessageId: string | null = null;
      
      const result = await state.bridge.chatWithTools(
        message,
        state.conversationHistory,
        systemPrompt,
        streamResponseCheckbox.checked ? (delta, snapshot) => {
          removeTypingIndicator(typingId);
          if (!currentMessageId) {
            currentMessageId = addAssistantMessage(snapshot, true);
          } else {
            updateMessage(currentMessageId, snapshot);
          }
        } : undefined,
        (execution) => {
          removeTypingIndicator(typingId);
          addToolExecution(execution);
        }
      );
      
      // Update conversation history
      state.conversationHistory = result.messages;
      
      // If not streaming, add final message
      if (!streamResponseCheckbox.checked) {
        removeTypingIndicator(typingId);
        const lastAssistantMsg = result.messages
          .filter(m => m.role === 'assistant' && m.content)
          .pop();
        if (lastAssistantMsg) {
          addAssistantMessage(lastAssistantMsg.content);
        }
      } else if (currentMessageId) {
        // Finalize streamed message
        finalizeMessage(currentMessageId);
      }
    } else {
      // Chat without tools
      state.conversationHistory.push({
        role: 'user',
        content: message
      });
      
      let currentMessageId: string | null = null;
      
      const response = await state.llmClient!.chat(
        state.conversationHistory,
        undefined,
        streamResponseCheckbox.checked ? (delta, snapshot) => {
          removeTypingIndicator(typingId);
          if (!currentMessageId) {
            currentMessageId = addAssistantMessage(snapshot, true);
          } else {
            updateMessage(currentMessageId, snapshot);
          }
        } : undefined
      );
      
      state.conversationHistory.push(response);
      
      if (!streamResponseCheckbox.checked) {
        removeTypingIndicator(typingId);
        addAssistantMessage(response.content);
      } else if (currentMessageId) {
        finalizeMessage(currentMessageId);
      }
    }
  } catch (error: any) {
    console.error('Chat error:', error);
    addSystemMessage(`Error: ${error.message}`);
  } finally {
    state.isGenerating = false;
    updateUIState();
  }
}

async function handleStopGeneration() {
  if (state.llmClient && state.isGenerating) {
    await state.llmClient.interrupt();
    state.isGenerating = false;
    updateUIState();
    addSystemMessage('Generation stopped.');
  }
}

function handleClearChat() {
  if (confirm('Clear all messages?')) {
    state.conversationHistory = [];
    chatMessages.innerHTML = `
      <div class="welcome-message">
        <h2>Chat cleared</h2>
        <p>Start a new conversation!</p>
      </div>
    `;
    
    if (state.llmClient) {
      state.llmClient.reset();
    }
  }
}

// ============================================================================
// UI Message Rendering
// ============================================================================

function addUserMessage(content: string) {
  const messageEl = document.createElement('div');
  messageEl.className = 'message message-user';
  messageEl.innerHTML = `
    <div class="message-content">
      ${escapeHtml(content)}
    </div>
    <div class="message-avatar">👤</div>
  `;
  
  removeWelcomeMessage();
  chatMessages.appendChild(messageEl);
  scrollToBottom();
}

function addAssistantMessage(content: string, isStreaming = false): string {
  const id = `msg-${Date.now()}`;
  const messageEl = document.createElement('div');
  messageEl.id = id;
  messageEl.className = 'message message-assistant';
  messageEl.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="message-content">
      ${renderMarkdown(content)}
    </div>
  `;
  
  removeWelcomeMessage();
  chatMessages.appendChild(messageEl);
  scrollToBottom();
  
  return id;
}

function addSystemMessage(content: string) {
  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  messageEl.style.justifyContent = 'center';
  messageEl.innerHTML = `
    <div class="message-content" style="background: var(--bg-tertiary); border: 1px solid var(--border-color); text-align: center; color: var(--text-secondary); font-size: 0.875rem;">
      ${escapeHtml(content)}
    </div>
  `;
  
  removeWelcomeMessage();
  chatMessages.appendChild(messageEl);
  scrollToBottom();
}

function addToolExecution(execution: ToolExecution) {
  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  messageEl.style.justifyContent = 'center';
  messageEl.innerHTML = `
    <div class="tool-execution">
      <div class="tool-execution-header">
        <span class="tool-execution-icon">🔧</span>
        <span>Calling <strong>${execution.name}</strong></span>
      </div>
      <div class="tool-execution-result">
        ${execution.error 
          ? `<span style="color: var(--danger);">Error: ${escapeHtml(execution.error)}</span>`
          : `Result: ${escapeHtml(JSON.stringify(execution.result, null, 2))}`
        }
      </div>
    </div>
  `;
  
  chatMessages.appendChild(messageEl);
  scrollToBottom();
}

function addTypingIndicator(): string {
  const id = `typing-${Date.now()}`;
  const messageEl = document.createElement('div');
  messageEl.id = id;
  messageEl.className = 'message message-assistant';
  messageEl.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="message-content">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  
  chatMessages.appendChild(messageEl);
  scrollToBottom();
  
  return id;
}

function removeTypingIndicator(id: string) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function updateMessage(id: string, content: string) {
  const el = document.getElementById(id);
  if (el) {
    const contentEl = el.querySelector('.message-content');
    if (contentEl) {
      contentEl.innerHTML = renderMarkdown(content);
      scrollToBottom();
    }
  }
}

function finalizeMessage(id: string) {
  // Could add final rendering polish here if needed
  scrollToBottom();
}

function removeWelcomeMessage() {
  const welcome = chatMessages.querySelector('.welcome-message');
  if (welcome) welcome.remove();
}

function scrollToBottom() {
  if (autoScrollCheckbox.checked) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

// ============================================================================
// Utilities
// ============================================================================

function updateUIState() {
  sendBtn.disabled = !state.isLLMLoaded || state.isGenerating || !chatInput.value.trim();
  stopBtn.style.display = state.isGenerating ? 'block' : 'none';
  chatInput.disabled = state.isGenerating;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(content: string): string {
  try {
    const rawHtml = marked.parse(content) as string;
    return DOMPurify.sanitize(rawHtml);
  } catch (error) {
    console.error('Markdown rendering error:', error);
    return escapeHtml(content);
  }
}

// ============================================================================
// Initialize
// ============================================================================

console.log('WebLLM Chat Agent initialized');
console.log('⚡ Load a model to start chatting');
console.log('🔧 Boot MCP server for tool support');
