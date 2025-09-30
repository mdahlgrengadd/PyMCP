import './styles/chat.css';
import { PyodideMcpClient } from './lib/mcp-pyodide-client';
import type { LLMClientInterface, ChatMessage } from './lib/llm-client-interface';
import { McpLLMBridge, ToolExecution } from './lib/mcp-llm-bridge';
import { LLMClientFactory } from './lib/llm-client-factory';
import { detectCapabilities, formatCapabilitiesForUI, getCapabilityWarnings } from './lib/browser-capabilities';
import { getCompatibleModels, getRecommendedModel, getModelById, formatModelDescription } from './lib/model-registry';
import type { BrowserCapabilities } from './lib/browser-capabilities';
import type { ModelInfo } from './lib/model-registry';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

// ============================================================================
// State Management
// ============================================================================

interface AppState {
  llmClient: LLMClientInterface | null;
  mcpClient: PyodideMcpClient | null;
  bridge: McpLLMBridge | null;
  conversationHistory: ChatMessage[];
  isLLMLoaded: boolean;
  isMCPLoaded: boolean;
  isGenerating: boolean;
  currentModelInfo: ModelInfo | null;
  browserCapabilities: BrowserCapabilities | null;
  compatibleModels: ModelInfo[];
}

const state: AppState = {
  llmClient: null,
  mcpClient: null,
  bridge: null,
  conversationHistory: [],
  isLLMLoaded: false,
  isMCPLoaded: false,
  isGenerating: false,
  currentModelInfo: null,
  browserCapabilities: null,
  compatibleModels: []
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
const capabilitiesStatus = document.getElementById('capabilities-status') as HTMLSpanElement;
const modelDescription = document.getElementById('model-description') as HTMLDivElement;

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

// wllama configuration elements
const wllamaConfig = document.getElementById('wllama-config') as HTMLDivElement;
const wllamaMultithreadCheckbox = document.getElementById('wllama-multithread') as HTMLInputElement;
const wllamaThreadsSlider = document.getElementById('wllama-threads') as HTMLInputElement;
const wllamaThreadsValue = document.getElementById('wllama-threads-value') as HTMLSpanElement;

// ============================================================================
// Event Listeners
// ============================================================================

loadModelBtn.addEventListener('click', handleLoadModel);
bootMcpBtn.addEventListener('click', handleBootMCP);
refreshToolsBtn.addEventListener('click', handleRefreshTools);
sendBtn.addEventListener('click', handleSendMessage);
stopBtn.addEventListener('click', handleStopGeneration);
clearChatBtn.addEventListener('click', handleClearChat);

modelSelect.addEventListener('change', handleModelSelectChange);
wllamaMultithreadCheckbox?.addEventListener('change', updateWllamaConfig);
wllamaThreadsSlider?.addEventListener('input', updateWllamaConfig);

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
// Initialization
// ============================================================================

async function initializeApp() {
  try {
    // Detect browser capabilities
    state.browserCapabilities = await detectCapabilities();

    // Update capabilities display
    if (capabilitiesStatus) {
      capabilitiesStatus.textContent = formatCapabilitiesForUI(state.browserCapabilities);
    }

    // Show capability warnings
    const warnings = getCapabilityWarnings(state.browserCapabilities);
    if (warnings.length > 0) {
      addSystemMessage(`Browser capabilities: ${warnings.join(', ')}`);
    }

    // Get compatible models and populate select
    state.compatibleModels = getCompatibleModels(state.browserCapabilities);
    populateModelSelect();

    // Get recommended model
    const recommended = getRecommendedModel(state.browserCapabilities);
    if (recommended) {
      modelSelect.value = recommended.id;
      handleModelSelectChange();
    }

    console.log('App initialized with capabilities:', state.browserCapabilities);
    console.log('Compatible models:', state.compatibleModels.length);
  } catch (error: any) {
    console.error('Failed to initialize app:', error);
    addSystemMessage(`Initialization failed: ${error.message}`);
  }
}

function populateModelSelect() {
  modelSelect.innerHTML = '';

  if (state.compatibleModels.length === 0) {
    modelSelect.innerHTML = '<option value="">No compatible models found</option>';
    loadModelBtn.disabled = true;
    return;
  }

  for (const model of state.compatibleModels) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = `${model.name} (${model.size})`;
    modelSelect.appendChild(option);
  }

  loadModelBtn.disabled = false;
}

function handleModelSelectChange() {
  const selectedId = modelSelect.value;
  const modelInfo = getModelById(selectedId);

  if (!modelInfo) return;

  state.currentModelInfo = modelInfo;

  // Update model description
  if (modelDescription) {
    modelDescription.style.display = 'block';
    modelDescription.innerHTML = `
      <p><strong>${modelInfo.name}</strong></p>
      <p>${formatModelDescription(modelInfo)}</p>
      <div class="model-tags">
        ${modelInfo.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
      </div>
    `;
  }

  // Show/hide wllama config
  if (wllamaConfig) {
    wllamaConfig.style.display = modelInfo.type === 'wllama' ? 'block' : 'none';
  }

  // Update wllama threading based on capabilities
  if (modelInfo.type === 'wllama' && state.browserCapabilities) {
    const canUseThreads = state.browserCapabilities.wasmThreads && state.browserCapabilities.sharedArrayBuffer;

    if (wllamaMultithreadCheckbox) {
      wllamaMultithreadCheckbox.disabled = !canUseThreads;
      wllamaMultithreadCheckbox.checked = canUseThreads;

      if (!canUseThreads) {
        wllamaMultithreadCheckbox.parentElement!.title = 'Multi-threading requires SharedArrayBuffer and CORS headers';
      }
    }

    if (wllamaThreadsSlider) {
      const maxThreads = Math.min(navigator.hardwareConcurrency || 4, 8);
      wllamaThreadsSlider.max = maxThreads.toString();
      wllamaThreadsSlider.value = Math.max(1, Math.floor(maxThreads * 0.75)).toString();
      updateWllamaConfig();
    }
  }
}

function updateWllamaConfig() {
  if (wllamaThreadsValue && wllamaThreadsSlider) {
    wllamaThreadsValue.textContent = wllamaThreadsSlider.value;
  }
}

// ============================================================================
// Model Loading
// ============================================================================

async function handleLoadModel() {
  if (!state.currentModelInfo || !state.browserCapabilities) {
    addSystemMessage('Please select a model first');
    return;
  }

  try {
    loadModelBtn.disabled = true;
    modelProgress.style.display = 'block';
    modelStatus.textContent = 'Loading...';

    // Get wllama configuration if needed
    const config = state.currentModelInfo.type === 'wllama' ? {
      wllama: {
        multiThread: wllamaMultithreadCheckbox?.checked ?? true,
        numThreads: parseInt(wllamaThreadsSlider?.value ?? '4')
      }
    } : undefined;

    // Create appropriate client
    state.llmClient = await LLMClientFactory.createClient(
      state.currentModelInfo,
      state.browserCapabilities,
      config
    );

    // Initialize with progress tracking
    // For wllama, use the modelFile path; for WebLLM, use the ID
    const modelIdentifier = state.currentModelInfo.type === 'wllama'
      ? state.currentModelInfo.modelFile || state.currentModelInfo.id
      : state.currentModelInfo.id;

    await state.llmClient.init(modelIdentifier, (report) => {
      const progress = Math.round(report.progress * 100);
      progressFill.style.width = `${progress}%`;
      progressText.textContent = report.text;
    });

    state.isLLMLoaded = true;
    const modelName = state.currentModelInfo.name.split(' ')[0];
    const clientType = state.llmClient.getClientType().toUpperCase();
    modelStatus.textContent = `✓ ${modelName} (${clientType})`;
    modelStatus.style.color = 'var(--success)';

    addSystemMessage(
      `Model ${state.currentModelInfo.name} loaded successfully using ${clientType}! ` +
      `${state.isMCPLoaded ? 'You can now chat with tool support.' : 'Boot MCP server for tool support.'}`
    );

    // Create bridge if MCP is already loaded
    if (state.mcpClient) {
      state.bridge = new McpLLMBridge(state.llmClient, state.mcpClient);
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
      state.bridge = new McpLLMBridge(state.llmClient, state.mcpClient);
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

document.addEventListener('DOMContentLoaded', async () => {
  console.log('WebLLM Chat Agent with wllama support initialized');
  console.log('🔍 Detecting browser capabilities...');

  await initializeApp();

  console.log('⚡ Select and load a model to start chatting');
  console.log('🔧 Boot MCP server for tool support');
});
