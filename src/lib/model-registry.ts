import type { BrowserCapabilities } from './browser-capabilities';

export interface ModelInfo {
  id: string;
  name: string;
  type: 'webllm' | 'wllama';
  size: string;
  description: string;
  modelFile?: string; // For wllama GGUF models
  quantization?: string;
  supportsFunctionCalling?: boolean; // For WebLLM models that support function calling
  requirements: Partial<BrowserCapabilities>;
  performance: {
    speed: 'very-fast' | 'fast' | 'medium' | 'slow';
    quality: 'excellent' | 'good' | 'fair';
    memory: string;
  };
  tags: string[];
}

export const MODEL_REGISTRY: ModelInfo[] = [
  // WebLLM models with function calling support (Hermes models)
  {
    id: 'Hermes-3-Llama-3.1-8B-q4f32_1-MLC',
    name: 'Hermes 3 Llama 3.1 8B (WebLLM)',
    type: 'webllm',
    size: '4.7GB',
    description: 'Hermes 3 with function calling support - best for tool use',
    quantization: 'q4f32_1',
    supportsFunctionCalling: true,
    requirements: { webgpu: true },
    performance: {
      speed: 'fast',
      quality: 'excellent',
      memory: '5GB'
    },
    tags: ['chat', 'instruct', 'webgpu', 'function-calling', 'tools', 'recommended']
  },
  {
    id: 'Hermes-3-Llama-3.1-8B-q4f16_1-MLC',
    name: 'Hermes 3 Llama 3.1 8B (q4f16) (WebLLM)',
    type: 'webllm',
    size: '4.2GB',
    description: 'Hermes 3 with function calling - more compact variant',
    quantization: 'q4f16_1',
    supportsFunctionCalling: true,
    requirements: { webgpu: true },
    performance: {
      speed: 'fast',
      quality: 'excellent',
      memory: '4.5GB'
    },
    tags: ['chat', 'instruct', 'webgpu', 'function-calling', 'tools']
  },
  {
    id: 'Hermes-2-Pro-Llama-3-8B-q4f32_1-MLC',
    name: 'Hermes 2 Pro Llama 3 8B (WebLLM)',
    type: 'webllm',
    size: '4.7GB',
    description: 'Hermes 2 Pro with function calling support',
    quantization: 'q4f32_1',
    supportsFunctionCalling: true,
    requirements: { webgpu: true },
    performance: {
      speed: 'fast',
      quality: 'excellent',
      memory: '5GB'
    },
    tags: ['chat', 'instruct', 'webgpu', 'function-calling', 'tools']
  },
  {
    id: 'Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC',
    name: 'Hermes 2 Pro Llama 3 8B (q4f16) (WebLLM)',
    type: 'webllm',
    size: '4.2GB',
    description: 'Hermes 2 Pro with function calling - compact variant',
    quantization: 'q4f16_1',
    supportsFunctionCalling: true,
    requirements: { webgpu: true },
    performance: {
      speed: 'fast',
      quality: 'excellent',
      memory: '4.5GB'
    },
    tags: ['chat', 'instruct', 'webgpu', 'function-calling', 'tools']
  },
  {
    id: 'Hermes-2-Pro-Mistral-7B-q4f16_1-MLC',
    name: 'Hermes 2 Pro Mistral 7B (WebLLM)',
    type: 'webllm',
    size: '4.0GB',
    description: 'Hermes 2 Pro Mistral with function calling support',
    quantization: 'q4f16_1',
    supportsFunctionCalling: true,
    requirements: { webgpu: true },
    performance: {
      speed: 'fast',
      quality: 'excellent',
      memory: '4.5GB'
    },
    tags: ['chat', 'instruct', 'webgpu', 'function-calling', 'tools']
  },

  // WebLLM models (existing - no function calling)
  {
    id: 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
    name: 'Llama 3.2 3B (WebLLM)',
    type: 'webllm',
    size: '2.0GB',
    description: 'Fast lightweight model optimized for WebGPU (no function calling)',
    quantization: 'q4f32_1',
    supportsFunctionCalling: false,
    requirements: { webgpu: true },
    performance: {
      speed: 'very-fast',
      quality: 'good',
      memory: '2GB'
    },
    tags: ['chat', 'instruct', 'webgpu']
  },
  {
    id: 'Llama-3.1-8B-Instruct-q4f32_1-MLC',
    name: 'Llama 3.1 8B (WebLLM)',
    type: 'webllm',
    size: '4.7GB',
    description: 'Balanced model with better reasoning (no function calling)',
    quantization: 'q4f32_1',
    supportsFunctionCalling: false,
    requirements: { webgpu: true },
    performance: {
      speed: 'fast',
      quality: 'excellent',
      memory: '5GB'
    },
    tags: ['chat', 'instruct', 'webgpu', 'reasoning']
  },
  {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    name: 'Phi 3.5 Mini (WebLLM)',
    type: 'webllm',
    size: '2.2GB',
    description: 'Microsoft\'s efficient model for coding (no function calling)',
    quantization: 'q4f16_1',
    supportsFunctionCalling: false,
    requirements: { webgpu: true },
    performance: {
      speed: 'fast',
      quality: 'good',
      memory: '2.5GB'
    },
    tags: ['chat', 'instruct', 'webgpu', 'coding']
  },
  {
    id: 'Qwen2.5-7B-Instruct-q4f32_1-MLC',
    name: 'Qwen 2.5 7B (WebLLM)',
    type: 'webllm',
    size: '4.2GB',
    description: 'Alibaba\'s multilingual model (no function calling)',
    quantization: 'q4f32_1',
    supportsFunctionCalling: false,
    requirements: { webgpu: true },
    performance: {
      speed: 'fast',
      quality: 'excellent',
      memory: '4.5GB'
    },
    tags: ['chat', 'instruct', 'webgpu', 'multilingual']
  },

  // wllama models (CPU-based) - using tested models from wllama examples
  {
    id: 'smollm2-360m-instruct',
    name: 'SmolLM2 360M (CPU)',
    type: 'wllama',
    size: '368MB',
    description: 'Ultra-lightweight instruct model for quick testing and basic chat',
    modelFile: 'https://huggingface.co/ngxson/SmolLM2-360M-Instruct-Q8_0-GGUF/resolve/main/smollm2-360m-instruct-q8_0.gguf',
    quantization: 'Q8_0',
    requirements: { wasm: true },
    performance: {
      speed: 'very-fast',
      quality: 'fair',
      memory: '400MB'
    },
    tags: ['chat', 'instruct', 'cpu', 'gguf', 'tiny', 'demo']
  },
  {
    id: 'qwen2.5-0.5b-instruct',
    name: 'Qwen2.5 0.5B (CPU)',
    type: 'wllama',
    size: '644MB',
    description: 'Alibaba\'s compact Qwen2.5 model optimized for efficiency',
    modelFile: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q8_0.gguf',
    quantization: 'Q8_0',
    requirements: { wasm: true },
    performance: {
      speed: 'very-fast',
      quality: 'good',
      memory: '700MB'
    },
    tags: ['chat', 'instruct', 'cpu', 'gguf', 'multilingual', 'efficient']
  },
  {
    id: 'llama-3.2-1b-instruct',
    name: 'Llama 3.2 1B (CPU)',
    type: 'wllama',
    size: '770MB',
    description: 'Meta\'s Llama 3.2 1B model for lightweight conversations',
    modelFile: 'https://huggingface.co/hugging-quants/Llama-3.2-1B-Instruct-Q4_K_M-GGUF/resolve/main/llama-3.2-1b-instruct-q4_k_m.gguf',
    quantization: 'Q4_K_M',
    requirements: { wasm: true },
    performance: {
      speed: 'fast',
      quality: 'good',
      memory: '850MB'
    },
    tags: ['chat', 'instruct', 'cpu', 'gguf', 'lightweight']
  },
  {
    id: 'smollm2-1.7b-instruct',
    name: 'SmolLM2 1.7B (CPU)',
    type: 'wllama',
    size: '1.0GB',
    description: 'Balanced model with good performance for general conversations',
    modelFile: 'https://huggingface.co/ngxson/SmolLM2-1.7B-Instruct-Q4_K_M-GGUF/resolve/main/smollm2-1.7b-instruct-q4_k_m.gguf',
    quantization: 'Q4_K_M',
    requirements: { wasm: true },
    performance: {
      speed: 'fast',
      quality: 'good',
      memory: '1.2GB'
    },
    tags: ['chat', 'instruct', 'cpu', 'gguf', 'balanced']
  },
  {
    id: 'qwen3-1.7b-instruct',
    name: 'Qwen3 1.7B (CPU)',
    type: 'wllama',
    size: '1.03GB',
    description: 'Latest Qwen3 model with improved reasoning capabilities',
    modelFile: 'https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf',
    quantization: 'Q4_K_M',
    requirements: { wasm: true },
    performance: {
      speed: 'fast',
      quality: 'excellent',
      memory: '1.2GB'
    },
    tags: ['chat', 'instruct', 'cpu', 'gguf', 'reasoning', 'multilingual']
  }
];

export function getCompatibleModels(capabilities: BrowserCapabilities): ModelInfo[] {
  return MODEL_REGISTRY.filter(model => {
    // Check if model requirements are satisfied
    for (const [requirement, needed] of Object.entries(model.requirements)) {
      if (needed && !capabilities[requirement as keyof BrowserCapabilities]) {
        return false;
      }
    }
    return true;
  });
}

export function getRecommendedModel(capabilities: BrowserCapabilities): ModelInfo | null {
  const compatible = getCompatibleModels(capabilities);

  if (compatible.length === 0) return null;

  // Prefer WebGPU models when available
  const webgpuModels = compatible.filter(m => m.type === 'webllm');
  if (webgpuModels.length > 0) {
    // Prefer models with function calling support (for MCP tools)
    const functionCallingModels = webgpuModels.filter(m => m.supportsFunctionCalling === true);
    if (functionCallingModels.length > 0) {
      // Return recommended function calling model
      return functionCallingModels.find(m => m.tags.includes('recommended')) || functionCallingModels[0];
    }
    // Fall back to fastest WebGPU model without function calling
    return webgpuModels.find(m => m.performance.speed === 'very-fast') || webgpuModels[0];
  }

  // Fall back to CPU models
  const cpuModels = compatible.filter(m => m.type === 'wllama');
  if (cpuModels.length > 0) {
    // Return fastest/smallest CPU model
    return cpuModels.find(m => m.performance.speed === 'very-fast') || cpuModels[0];
  }

  return compatible[0];
}

export function getModelById(id: string): ModelInfo | null {
  return MODEL_REGISTRY.find(model => model.id === id) || null;
}

export function getModelsByType(type: 'webllm' | 'wllama'): ModelInfo[] {
  return MODEL_REGISTRY.filter(model => model.type === type);
}

export function getModelsByTag(tag: string): ModelInfo[] {
  return MODEL_REGISTRY.filter(model => model.tags.includes(tag));
}

export function formatModelDescription(model: ModelInfo): string {
  const speed = model.performance.speed.replace('-', ' ');
  const quality = model.performance.quality;
  const backend = model.type === 'webllm' ? 'WebGPU' : 'CPU';

  return `${model.description} (${backend} • ${speed} • ${quality} quality • ${model.size})`;
}