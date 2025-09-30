import type { LLMClientInterface } from './llm-client-interface';
import type { BrowserCapabilities } from './browser-capabilities';
import type { ModelInfo } from './model-registry';
import { WebLLMClient } from './webllm-client';
import { WllamaClient, type WllamaConfig } from './wllama-client';

export interface LLMClientConfig {
  wllama?: Partial<WllamaConfig>;
}

export class LLMClientFactory {
  /**
   * Create an appropriate LLM client based on model and browser capabilities
   */
  static async createClient(
    modelInfo: ModelInfo,
    capabilities: BrowserCapabilities,
    config?: LLMClientConfig
  ): Promise<LLMClientInterface> {
    // Validate model compatibility
    if (!this.isModelCompatible(modelInfo, capabilities)) {
      throw new Error(
        `Model ${modelInfo.name} is not compatible with current browser capabilities. ` +
        `Required: ${JSON.stringify(modelInfo.requirements)}, ` +
        `Available: ${JSON.stringify(capabilities)}`
      );
    }

    switch (modelInfo.type) {
      case 'webllm':
        if (!capabilities.webgpu) {
          throw new Error('WebGPU not available for WebLLM model');
        }
        return new WebLLMClient();

      case 'wllama':
        if (!capabilities.wasm) {
          throw new Error('WebAssembly not available for wllama model');
        }

        // Configure wllama based on capabilities
        const wllamaConfig: Partial<WllamaConfig> = {
          multiThread: capabilities.wasmThreads && capabilities.sharedArrayBuffer,
          numThreads: this.getOptimalThreadCount(capabilities),
          ...config?.wllama
        };

        return new WllamaClient(wllamaConfig);

      default:
        throw new Error(`Unknown model type: ${(modelInfo as any).type}`);
    }
  }

  /**
   * Check if a model is compatible with browser capabilities
   */
  static isModelCompatible(
    modelInfo: ModelInfo,
    capabilities: BrowserCapabilities
  ): boolean {
    for (const [requirement, needed] of Object.entries(modelInfo.requirements)) {
      if (needed && !capabilities[requirement as keyof BrowserCapabilities]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get optimal thread count for wllama based on browser capabilities
   */
  private static getOptimalThreadCount(capabilities: BrowserCapabilities): number {
    if (!capabilities.wasmThreads || !capabilities.sharedArrayBuffer) {
      return 1;
    }

    // Use up to 75% of available cores, capped at 8
    const maxThreads = Math.min(navigator.hardwareConcurrency || 4, 8);
    return Math.max(1, Math.floor(maxThreads * 0.75));
  }

  /**
   * Get recommended client configuration for a model type
   */
  static getRecommendedConfig(
    modelType: 'webllm' | 'wllama',
    capabilities: BrowserCapabilities
  ): LLMClientConfig {
    const config: LLMClientConfig = {};

    if (modelType === 'wllama') {
      config.wllama = {
        multiThread: capabilities.wasmThreads && capabilities.sharedArrayBuffer,
        numThreads: this.getOptimalThreadCount(capabilities),
        enableEmbedding: false,
        enableCompletion: true
      };
    }

    return config;
  }

  /**
   * Estimate memory usage for a model
   */
  static estimateMemoryUsage(modelInfo: ModelInfo): {
    minimum: string;
    recommended: string;
    notes: string[];
  } {
    const notes: string[] = [];
    let baseMemory = parseInt(modelInfo.performance.memory);

    if (modelInfo.type === 'webllm') {
      notes.push('WebGPU models load faster but require more GPU memory');
      return {
        minimum: `${baseMemory}GB GPU + 1GB RAM`,
        recommended: `${baseMemory + 1}GB GPU + 2GB RAM`,
        notes
      };
    } else {
      // wllama
      const overhead = Math.max(0.5, baseMemory * 0.2); // 20% overhead or 0.5GB minimum
      notes.push('CPU models use system RAM and may be slower');
      notes.push('Multi-threading improves performance but uses more memory');

      return {
        minimum: `${baseMemory}GB RAM`,
        recommended: `${baseMemory + overhead}GB RAM`,
        notes
      };
    }
  }

  /**
   * Get performance expectations for a model/browser combination
   */
  static getPerformanceExpectations(
    modelInfo: ModelInfo,
    capabilities: BrowserCapabilities
  ): {
    tokensPerSecond: string;
    loadTime: string;
    notes: string[];
  } {
    const notes: string[] = [];

    if (modelInfo.type === 'webllm') {
      const baseSpeed = modelInfo.performance.speed === 'very-fast' ? '25-35' :
                       modelInfo.performance.speed === 'fast' ? '15-25' :
                       modelInfo.performance.speed === 'medium' ? '8-15' : '3-8';

      return {
        tokensPerSecond: `${baseSpeed} tokens/sec`,
        loadTime: '30-120 seconds',
        notes: ['WebGPU provides fastest inference', 'Initial load downloads model to GPU']
      };
    } else {
      // wllama performance depends on threading
      let speedMultiplier = 1;

      if (capabilities.wasmThreads && capabilities.sharedArrayBuffer) {
        const threads = Math.min(navigator.hardwareConcurrency || 4, 8);
        speedMultiplier = Math.min(threads / 2, 4); // Threading doesn't scale linearly
        notes.push(`Multi-threading with ${threads} cores improves performance`);
      } else {
        notes.push('Single-threaded performance - consider enabling CORS headers for multi-threading');
      }

      const baseSpeed = modelInfo.performance.speed === 'very-fast' ? 8 :
                       modelInfo.performance.speed === 'fast' ? 5 :
                       modelInfo.performance.speed === 'medium' ? 3 : 1;

      const adjustedSpeed = Math.round(baseSpeed * speedMultiplier);

      return {
        tokensPerSecond: `${Math.max(1, adjustedSpeed - 2)}-${adjustedSpeed + 2} tokens/sec`,
        loadTime: '60-300 seconds',
        notes: [...notes, 'CPU inference is slower but works on all browsers']
      };
    }
  }
}