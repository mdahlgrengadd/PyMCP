export interface BrowserCapabilities {
  webgpu: boolean;
  wasm: boolean;
  wasmThreads: boolean;
  sharedArrayBuffer: boolean;
}

export async function detectCapabilities(): Promise<BrowserCapabilities> {
  // Check WebGPU support
  const webgpu = 'gpu' in navigator && navigator.gpu !== undefined;

  // Check WebAssembly support
  const wasm = 'WebAssembly' in window;

  // Check SharedArrayBuffer support (required for multi-threading)
  const sharedArrayBuffer = 'SharedArrayBuffer' in window;

  // Check WASM threads support
  let wasmThreads = false;
  if (wasm && sharedArrayBuffer) {
    try {
      // Test if we can create a simple threaded WASM module
      const wasmBytes = new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
        0x01, 0x04, 0x01, 0x60, 0x00, 0x00,
        0x03, 0x02, 0x01, 0x00,
        0x0a, 0x04, 0x01, 0x02, 0x00, 0x0b
      ]);

      const module = await WebAssembly.compile(wasmBytes);
      wasmThreads = WebAssembly.Module.imports(module).length === 0;
    } catch (e) {
      wasmThreads = false;
    }
  }

  return {
    webgpu,
    wasm,
    wasmThreads,
    sharedArrayBuffer
  };
}

export function getCapabilityWarnings(capabilities: BrowserCapabilities): string[] {
  const warnings: string[] = [];

  if (!capabilities.webgpu) {
    warnings.push('WebGPU not supported - GPU acceleration unavailable');
  }

  if (!capabilities.wasm) {
    warnings.push('WebAssembly not supported - CPU inference unavailable');
  }

  if (!capabilities.sharedArrayBuffer) {
    warnings.push('SharedArrayBuffer not available - multi-threading disabled');
  }

  if (!capabilities.wasmThreads && capabilities.wasm) {
    warnings.push('WASM threading not supported - single-threaded CPU inference only');
  }

  return warnings;
}

export function formatCapabilitiesForUI(capabilities: BrowserCapabilities): string {
  const features = [];

  if (capabilities.webgpu) features.push('WebGPU ✓');
  else features.push('WebGPU ✗');

  if (capabilities.wasm) {
    if (capabilities.wasmThreads) features.push('WASM MT ✓');
    else features.push('WASM ST ✓');
  } else {
    features.push('WASM ✗');
  }

  return features.join(' | ');
}