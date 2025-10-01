import './styles/chat.css';
import { PyodideMcpClient } from './lib/mcp-pyodide-client';
import type { LLMClientInterface, ChatMessage } from './lib/llm-client-interface';
import { McpLLMBridge, ToolExecution, ChatWithToolsOptions } from './lib/mcp-llm-bridge';
import { McpLLMBridgeV2 } from './lib/mcp-llm-bridge-v2';
import type { ReActStep } from './lib/react-agent';
import { vectorStore } from './lib/vector-store';
import { embeddingService } from './lib/embeddings';
import { agentConfig } from './lib/agent-config';
import type { ResourceDescriptor, PromptDescriptor } from './lib/mcp-resource-manager';
import { McpResourceManager } from './lib/mcp-resource-manager';
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
  bridgeV2: McpLLMBridgeV2 | null;
  conversationHistory: ChatMessage[];
  isLLMLoaded: boolean;
  isMCPLoaded: boolean;
  isGenerating: boolean;
  currentModelInfo: ModelInfo | null;
  browserCapabilities: BrowserCapabilities | null;
  compatibleModels: ModelInfo[];
  temperature: number;
  availableResources: ResourceDescriptor[];
  selectedResources: Set<string>;
  availablePrompts: PromptDescriptor[];
  selectedPrompt: string | null;
  // Metrics
  metrics: {
    totalQueries: number;
    successfulTools: number;
    failedTools: number;
    avgSteps: number;
    avgLatency: number;
    hallucinationsDetected: number;
    hallucinationsBlocked: number;
  };
}

const state: AppState = {
  llmClient: null,
  mcpClient: null,
  bridge: null,
  bridgeV2: null,
  conversationHistory: [],
  isLLMLoaded: false,
  isMCPLoaded: false,
  isGenerating: false,
  currentModelInfo: null,
  browserCapabilities: null,
  compatibleModels: [],
  temperature: 0.7,
  availableResources: [],
  selectedResources: new Set(),
  availablePrompts: [],
  selectedPrompt: null,
  metrics: {
    totalQueries: 0,
    successfulTools: 0,
    failedTools: 0,
    avgSteps: 0,
    avgLatency: 0,
    hallucinationsDetected: 0,
    hallucinationsBlocked: 0
  }
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
const serverDescription = document.getElementById('server-description') as HTMLDivElement;
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

const promptCardsContainer = document.getElementById('prompt-cards-container') as HTMLDivElement;
const promptCards = document.getElementById('prompt-cards') as HTMLDivElement;

const autoScrollCheckbox = document.getElementById('auto-scroll') as HTMLInputElement;
const streamResponseCheckbox = document.getElementById('stream-response') as HTMLInputElement;
const clearChatBtn = document.getElementById('clear-chat-btn') as HTMLButtonElement;
const temperatureSlider = document.getElementById('temperature-slider') as HTMLInputElement;
const temperatureValue = document.getElementById('temperature-value') as HTMLSpanElement;

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
temperatureSlider?.addEventListener('input', updateTemperature);

// Server descriptions
const SERVER_DESCRIPTIONS: Record<string, string> = {
  hello_world: "🚀 Complete MCP example with 3 tools, 3 resources, 3 prompts. Perfect for learning MCP development!",
  chef: "👨‍🍳 Cooking assistant with recipes, conversions, and meal planning. Uses semantic search to find relevant recipes.",
  fitness: "🏋️ Personal trainer with workout programs, BMI calculator, and nutrition guidance.",
  coding: "💻 Programming mentor with code review, tutorials, and design patterns.",
  clean: "📝 Simple task management with modern PyMCP framework. Create, list, and manage TODOs with weather info.",
  url: "Load custom server from URL"
};

serverSelect.addEventListener('change', () => {
  const value = serverSelect.value;
  const isCustomUrl = value === 'url';
  serverUrlInput.style.display = isCustomUrl ? 'block' : 'none';
  
  // Show description
  if (SERVER_DESCRIPTIONS[value]) {
    serverDescription.style.display = 'block';
    serverDescription.textContent = SERVER_DESCRIPTIONS[value];
  } else {
    serverDescription.style.display = 'none';
  }
  
  // Set URL for file-based servers
  if (value === 'hello_world') {
    serverUrlInput.value = '/hello_world_server.py';
  } else if (value === 'clean') {
    serverUrlInput.value = '/clean_server.py';
  } else if (value === 'chef') {
    serverUrlInput.value = '/chef_server.py';
  } else if (value === 'fitness') {
    serverUrlInput.value = '/fitness_server.py';
  } else if (value === 'coding') {
    serverUrlInput.value = '/coding_mentor_server.py';
  } else if (!isCustomUrl) {
    serverUrlInput.value = '';
  }
  
  // Update prompt cards for new server
  renderPromptCards();
});

// ============================================================================
// Prompt Inspiration Cards
// ============================================================================

interface PromptCard {
  icon: string;
  title: string;
  description: string;
  example: string;
}

const PROMPT_CARDS_BY_SERVER: Record<string, PromptCard[]> = {
  'hello_world': [
    {
      icon: '👋',
      title: 'Say Hello',
      description: 'Test the greeting tool with different names',
      example: 'Hello Alice!'
    },
    {
      icon: '🧮',
      title: 'Math Calculator',
      description: 'Try basic arithmetic operations',
      example: 'Calculate 15 + 27'
    },
    {
      icon: '📢',
      title: 'Echo Test',
      description: 'Test text processing and echo functionality',
      example: 'Echo: Hello World!'
    },
    {
      icon: '📚',
      title: 'View Documentation',
      description: 'Access the getting started guide and examples',
      example: 'Show me the getting started guide'
    }
  ],
  'clean': [
    {
      icon: '📝',
      title: 'Create Task',
      description: 'Add a new task to your TODO list',
      example: 'Create a task: Learn MCP'
    },
    {
      icon: '📋',
      title: 'List Tasks',
      description: 'View all your current tasks',
      example: 'Show me all my tasks'
    },
    {
      icon: '✅',
      title: 'Complete Task',
      description: 'Mark a task as completed',
      example: 'Mark task 1 as completed'
    },
    {
      icon: '🌤️',
      title: 'Check Weather',
      description: 'Get weather information for any location',
      example: 'What\'s the weather in New York?'
    }
  ],
  'chef': [
    {
      icon: '🍝',
      title: 'Recipe Guidance',
      description: 'Get step-by-step instructions for making delicious dishes',
      example: 'Show me how to make vegan pasta primavera'
    },
    {
      icon: '🌏',
      title: 'Cuisine Search',
      description: 'Find recipes by cuisine type or ingredients',
      example: 'Show me Thai recipes'
    },
    {
      icon: '🥗',
      title: 'Dietary Restrictions',
      description: 'Find vegan, vegetarian, or gluten-free recipes',
      example: 'What vegan recipes do you have?'
    },
    {
      icon: '🔄',
      title: 'Ingredient Substitutes',
      description: 'Replace ingredients based on availability or preferences',
      example: 'What can I use instead of butter for vegan cooking?'
    },
    {
      icon: '📏',
      title: 'Recipe Scaling',
      description: 'Adjust recipes for different serving sizes',
      example: 'Scale the vegan pasta recipe for 8 people'
    }
  ],
  'fitness': [
    {
      icon: '💪',
      title: 'Strength Programs',
      description: 'Find programs to build strength',
      example: 'Find workout programs to build strength for beginners'
    },
    {
      icon: '🔥',
      title: 'Fat Loss Programs',
      description: 'Find programs for fat loss and weight management',
      example: 'Show me fat loss workout programs for intermediate level'
    },
    {
      icon: '🧮',
      title: 'Calorie Calculator',
      description: 'Calculate your daily calorie needs',
      example: 'Calculate my daily calories - I\'m 75kg, 175cm, 30 years old, male, moderately active'
    },
    {
      icon: '📊',
      title: 'Track Workouts',
      description: 'Log your exercises and track progress',
      example: 'Log my workout: bench press, 3 sets of 8 reps at 80kg'
    }
  ],
  'coding': [
    {
      icon: '💻',
      title: 'Code Tutorials',
      description: 'Learn programming concepts step-by-step',
      example: 'Teach me about async/await in JavaScript'
    },
    {
      icon: '🐛',
      title: 'Debug Help',
      description: 'Find and fix bugs in your code',
      example: 'Help me debug this Python function'
    },
    {
      icon: '🏗️',
      title: 'Architecture Advice',
      description: 'Design patterns and best practices',
      example: 'What\'s the best way to structure a React app?'
    },
    {
      icon: '📚',
      title: 'Code Review',
      description: 'Get feedback on your code quality',
      example: 'Review my TypeScript code for improvements'
    }
  ],
  'embedded': [
    {
      icon: '🔧',
      title: 'Basic Tools Demo',
      description: 'Try out the calculator and timer tools',
      example: 'Calculate 15% tip on $85'
    },
    {
      icon: '⏰',
      title: 'Set Reminders',
      description: 'Create timers for tasks',
      example: 'Set a timer for 25 minutes'
    },
    {
      icon: '📝',
      title: 'General Chat',
      description: 'Have a conversation with the AI',
      example: 'Tell me about the weather today'
    }
  ]
};

function renderPromptCards() {
  const selectedServer = serverSelect.value;
  const cards = PROMPT_CARDS_BY_SERVER[selectedServer] || [];
  
  if (cards.length === 0 || state.conversationHistory.length > 0) {
    promptCardsContainer.style.display = 'none';
    return;
  }
  
  promptCardsContainer.style.display = 'block';
  promptCards.innerHTML = cards.map(card => `
    <div class="prompt-card" data-example="${card.example}">
      <span class="prompt-card-icon">${card.icon}</span>
      <div class="prompt-card-title">${card.title}</div>
      <div class="prompt-card-description">${card.description}</div>
      <div class="prompt-card-example">"${card.example}"</div>
    </div>
  `).join('');
  
  // Add click handlers
  promptCards.querySelectorAll('.prompt-card').forEach(card => {
    card.addEventListener('click', () => {
      const example = (card as HTMLElement).dataset.example;
      if (example) {
        chatInput.value = example;
        chatInput.dispatchEvent(new Event('input'));
        chatInput.focus();
        // Optionally auto-send
        // handleSendMessage();
      }
    });
  });
}

// Trigger initial server selection to render prompt cards
serverSelect.dispatchEvent(new Event('change'));

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

function updateTemperature() {
  if (temperatureValue && temperatureSlider) {
    state.temperature = parseFloat(temperatureSlider.value);
    temperatureValue.textContent = state.temperature.toFixed(1);
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
      await createBridge();
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
    
    const selectedServer = serverSelect.value;
    const serverType: 'embedded' | 'url' = 'url';
    
    const serverConfig = serverType === 'url' ? {
      serverType,
      serverUrl: selectedServer === 'url' 
        ? serverUrlInput.value.trim()
        : serverUrlInput.value || `/clean_server.py`
    } : { serverType };
    
    state.mcpClient = await new PyodideMcpClient(worker).init(
      pyodideUrlInput.value,
      serverConfig
    );
    
    state.isMCPLoaded = true;
    
    // Clear conversation history when switching MCP servers to avoid context pollution
    if (state.conversationHistory.length > 0) {
      console.log('🧹 Clearing conversation history (new MCP server)');
      state.conversationHistory = [];
      chatMessages.innerHTML = `
        <div class="system-message">
          <p>🔄 MCP server switched - conversation history cleared to prevent context pollution</p>
        </div>
      `;
    }
    
    // Clear vector store to remove old server's resources
    if (vectorStore.isReady()) {
      console.log('🧹 Clearing vector store (new MCP server)');
      await vectorStore.clear();
    }
    
    // Create bridge if LLM is already loaded
    if (state.llmClient) {
      await createBridge();
    }
    
    await handleRefreshTools();
    
    // Render prompt cards for inspiration
    renderPromptCards();
    
    // Warn about function calling support
    if (state.llmClient && state.currentModelInfo) {
      const modelSupportsTools = state.currentModelInfo.supportsFunctionCalling !== false;
      if (!modelSupportsTools && state.currentModelInfo.type === 'webllm') {
        addSystemMessage(
          `MCP server booted successfully! ⚠️ Note: ${state.currentModelInfo.name} does not support function calling. ` +
          `For full tool support, load a Hermes model with function calling capability.`
        );
      } else {
        addSystemMessage('MCP server booted successfully! You can now chat with tool support.');
      }
    } else {
      addSystemMessage('MCP server booted successfully!');
    }
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
    // Refresh tools
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

    // Discover resources and prompts
    // Create temporary resource manager if bridge doesn't exist yet
    const resourceManager = state.bridge?.resourceManager || 
      new McpResourceManager(state.mcpClient);
    
    const [resources, prompts] = await Promise.all([
      resourceManager.discoverResources(),
      resourceManager.discoverPrompts()
    ]);

    state.availableResources = resources;
    state.availablePrompts = prompts;

    console.log(`Discovered ${resources.length} resources and ${prompts.length} prompts`);

    // Index resources for semantic search
    if (resources.length > 0) {
      if (state.bridgeV2) {
        // V2 Bridge - fetch and index full content
        console.log(`📚 Indexing ${resources.length} resources for ReAct agent...`);
        const resourcesToIndex = await Promise.all(
          resources.map(async (r) => {
            try {
              const resourceData = await state.mcpClient!.call('resources/read', { uri: r.uri });
              
              // Make name/description prominent for better semantic matching
              let content = `RESOURCE: ${r.name}\n`;
              content += `DESCRIPTION: ${r.description || ''}\n`;
              content += `URI: ${r.uri}\n`;
              content += `\nCONTENT:\n`;

              if (resourceData && resourceData.contents) {
                for (const item of resourceData.contents) {
                  if (item.text) {
                    content += item.text + '\n';
                  }
                }
              }

              return { uri: r.uri, content };
            } catch (error) {
              console.warn(`Failed to fetch resource ${r.uri}:`, error);
              return { uri: r.uri, content: `${r.name}: ${r.description || ''}` };
            }
          })
        );

        await state.bridgeV2.indexResources(resourcesToIndex);
        const stats = await state.bridgeV2.getIndexStats();
        console.log(`✅ Indexed ${stats.count} resources with full content`);
      } else if (state.bridge) {
        // V1 Bridge - use existing resource discovery
        await state.bridge.resourceDiscovery.indexResources();
      }
    }

    if (resources.length > 0 || prompts.length > 0) {
      addSystemMessage(
        `📚 Discovered ${resources.length} resource(s) and ${prompts.length} prompt template(s). ` +
        ((state.bridge || state.bridgeV2) ? `Semantic search enabled for automatic context enrichment.` :
         `Load a model for semantic search and tool support.`)
      );
    }
  } catch (error: any) {
    console.error('Failed to refresh MCP features:', error);
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

  // Hide prompt cards once conversation starts
  renderPromptCards();

  // Update state
  state.isGenerating = true;
  updateUIState();

  const startTime = Date.now();

  try {
    // Show typing indicator
    const typingId = addTypingIndicator();

    // Route to appropriate bridge based on config and availability
    const config = agentConfig.get();
    const useV2 = config.useReActAgent && state.bridgeV2 && state.isMCPLoaded;

    if (useV2) {
      // === Use ReAct-based bridge (V2) ===
      console.log('🎯 Using ReAct agent (V2)');

      let stepCount = 0;

      let currentMessageId: string | null = null;

      const result = await state.bridgeV2!.chatWithTools(
        message,
        state.conversationHistory,
        (step) => {
          // ReAct step callback
          stepCount++;
          if (config.debugMode) {
            if (step.thought) {
              console.log('💭 Thought:', step.thought);
            }
            if (step.action) {
              console.log('🔧 Action:', step.action.tool, step.action.args);
            }
            if (step.observation) {
              console.log('👁️ Observation:', step.observation.substring(0, 100) + '...');
            }
            if (step.answer) {
              console.log('✅ Final Answer:', step.answer.substring(0, 100) + '...');
            }
          }
        },
        (execution) => {
          // Tool execution callback
          removeTypingIndicator(typingId);
          if (execution.error) {
            state.metrics.failedTools++;
            console.error('❌ Tool failed:', execution.name, execution.error);
          } else {
            state.metrics.successfulTools++;
            console.log('✅ Tool succeeded:', execution.name);
          }
          addToolExecution(execution);
        },
        streamResponseCheckbox.checked ? (delta, snapshot) => {
          // Stream only the final answer portion
          removeTypingIndicator(typingId);
          if (!currentMessageId) {
            currentMessageId = addAssistantMessage(snapshot || '', true);
          } else {
            updateMessage(currentMessageId, snapshot || '');
          }
        } : undefined
      );

      // Update conversation history
      state.conversationHistory = result.messages;

      // Update metrics
      const duration = Date.now() - startTime;
      state.metrics.totalQueries++;
      state.metrics.avgLatency =
        (state.metrics.avgLatency * (state.metrics.totalQueries - 1) + duration) /
        state.metrics.totalQueries;
      state.metrics.avgSteps =
        (state.metrics.avgSteps * (state.metrics.totalQueries - 1) + stepCount) /
        state.metrics.totalQueries;

      if (config.debugMode) {
        console.log('📊 Metrics:', {
          totalQueries: state.metrics.totalQueries,
          successRate: (state.metrics.successfulTools / (state.metrics.successfulTools + state.metrics.failedTools) * 100).toFixed(1) + '%',
          avgSteps: state.metrics.avgSteps.toFixed(2),
          avgLatency: state.metrics.avgLatency.toFixed(0) + 'ms'
        });
      }

      // Display final message (if not streaming)
      if (!streamResponseCheckbox.checked) {
        removeTypingIndicator(typingId);
        const lastAssistantMsg = result.messages
          .filter(m => m.role === 'assistant' && m.content)
          .pop();
        if (lastAssistantMsg) {
          addAssistantMessage(lastAssistantMsg.content);
        }
      } else if (currentMessageId) {
        finalizeMessage(currentMessageId);
      }

    } else if (state.bridge && state.isMCPLoaded) {
      // === Use standard bridge (V1) ===
      console.log('🔧 Using standard bridge (V1)');
      // Check if model supports function calling
      const modelSupportsTools = state.currentModelInfo?.supportsFunctionCalling !== false;
      
      if (!modelSupportsTools && state.currentModelInfo?.type === 'webllm') {
        removeTypingIndicator(typingId);
        addSystemMessage(
          `⚠️ Warning: ${state.currentModelInfo.name} does not support function calling. ` +
          `To use MCP tools, please load a model with function calling support (e.g., Hermes models). ` +
          `Continuing without tool support...`
        );
        // Fall back to chat without tools
        state.conversationHistory.push({
          role: 'user',
          content: message
        });
        
        let currentMessageId: string | null = null;
        
        const response = await state.llmClient!.chat(
          state.conversationHistory,
          undefined,
          streamResponseCheckbox.checked ? (delta, snapshot) => {
            if (!currentMessageId) {
              currentMessageId = addAssistantMessage(snapshot, true);
            } else {
              updateMessage(currentMessageId, snapshot);
            }
          } : undefined,
          { temperature: state.temperature }
        );
        
        state.conversationHistory.push(response);
        
        if (!streamResponseCheckbox.checked) {
          addAssistantMessage(response.content);
        } else if (currentMessageId) {
          finalizeMessage(currentMessageId);
        }
        
        return;
      }
      
      // Chat with tool support
      const systemPrompt = `You are a helpful AI assistant with access to tools. Use tools when appropriate to help answer the user's questions. Always explain what you're doing when you use tools.`;
      
      let currentMessageId: string | null = null;
      
      const chatOptions: ChatWithToolsOptions = {
        systemPrompt,
        temperature: state.temperature,
        selectedResources: Array.from(state.selectedResources),
        promptTemplate: state.selectedPrompt || undefined
      };

      const result = await state.bridge.chatWithTools(
        message,
        state.conversationHistory,
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
        },
        chatOptions
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
        } : undefined,
        { temperature: state.temperature }
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
    
    // Show prompt cards again
    renderPromptCards();
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
// ReAct Agent Initialization
// ============================================================================

async function initializeReActComponents(): Promise<void> {
  try {
    // Initialize embedding service
    console.log('📥 Loading embedding model (22MB, may take 30-60s)...');
    await embeddingService.init();

    // Initialize vector store
    console.log('💾 Initializing vector database...');
    await vectorStore.init();

    console.log('✅ ReAct agent components ready!');
  } catch (error) {
    console.error('ReAct initialization failed:', error);
    throw error;
  }
}

async function createBridge(): Promise<void> {
  if (!state.llmClient || !state.mcpClient) {
    console.warn('Cannot create bridge: LLM or MCP not loaded');
    return;
  }

  const config = agentConfig.get();

  if (config.useReActAgent && vectorStore.isReady() && embeddingService.isReady()) {
    // Use new ReAct-based bridge
    console.log('🎯 Creating ReAct-based bridge (V2)...');
    state.bridgeV2 = new McpLLMBridgeV2(
      state.llmClient,
      state.mcpClient,
      vectorStore
    );
    // Note: Resource indexing happens in handleRefreshTools() to avoid duplication
  } else {
    // Use standard bridge as fallback
    console.log('🔧 Creating standard bridge (V1)...');
    const supportsFunctionCalling = state.currentModelInfo?.supportsFunctionCalling === true;
    state.bridge = new McpLLMBridge(
      state.llmClient,
      state.mcpClient,
      supportsFunctionCalling
    );

    if (state.availableResources.length > 0 && state.bridge.resourceDiscovery) {
      await state.bridge.resourceDiscovery.indexResources();
    }
  }
}

// ============================================================================
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('WebLLM Chat Agent with wllama support initialized');
  console.log('🔍 Detecting browser capabilities...');

  await initializeApp();

  // Initialize ReAct agent components (async, non-blocking)
  if (agentConfig.get().useReActAgent) {
    console.log('🚀 Initializing ReAct agent components...');

    initializeReActComponents().catch(error => {
      console.error('Failed to initialize ReAct components:', error);
      console.log('⚠️ Falling back to standard agent');
      agentConfig.toggleReAct(false);
    });
  }

  console.log('⚡ Select and load a model to start chatting');
  console.log('🔧 Boot MCP server for tool support');

  // Expose state globally for debugging
  (window as any).appState = state;
  (window as any).agentConfig = agentConfig;
  (window as any).vectorStore = vectorStore;
  (window as any).embeddingService = embeddingService;
});
