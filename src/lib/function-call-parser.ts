/**
 * Manual function calling parser for WebLLM
 * Uses XML tag approach since native tools API returns empty arrays
 * Based on: https://observablehq.com/@jeyabbalas/webllm-function-calling
 */

export interface FunctionCall {
  name: string;
  arguments: string; // JSON string
}

/**
 * Extract function call from <function></function> XML tags
 */
export function extractFunctionCall(text: string): FunctionCall | null {
  const match = text.match(/<function>([\s\S]*?)<\/function>/);
  if (!match) return null;

  try {
    // Extract only the JSON part between the tags
    const jsonStr = match[1].trim();

    // Sometimes the model wraps it in extra quotes or includes text - clean it
    const cleanJson = jsonStr.replace(/^["']|["']$/g, '').trim();

    const parsed = JSON.parse(cleanJson);

    if (parsed.name && typeof parsed.name === 'string') {
      return {
        name: parsed.name,
        arguments: JSON.stringify(parsed.parameters || parsed.arguments || {})
      };
    }
  } catch (e) {
    console.error('Failed to parse function call:', e, 'Content:', match[1]);
  }

  return null;
}

/**
 * Strip function call tags from assistant message, keeping only the call
 * This prevents explanatory text from polluting the conversation
 */
export function cleanAssistantMessage(text: string): string {
  const match = text.match(/<function>([\s\S]*?)<\/function>/);
  if (match) {
    // Only return the function call if present
    return match[0];
  }
  return text;
}

/**
 * Build system prompt with tool descriptions for manual calling
 */
export function buildToolCallingPrompt(tools: any[]): string {
  const toolDescriptions = tools.map(tool => {
    const func = tool.function;
    const params = func.parameters?.properties || {};
    const required = func.parameters?.required || [];

    return `**${func.name}**: ${func.description}
Parameters:
${Object.entries(params).map(([name, schema]: [string, any]) =>
  `  - ${name} (${schema.type})${required.includes(name) ? ' [required]' : ''}: ${schema.title || ''}`
).join('\n')}`;
  }).join('\n\n');

  return `You are a helpful AI assistant with access to the following tools:

${toolDescriptions}

To use a tool, respond with:
<function>{"name": "tool_name", "parameters": {"param1": "value1"}}</function>

IMPORTANT:
- Place ONLY valid JSON between <function> tags
- Use "parameters" key for the tool arguments
- You can include explanatory text before or after the <function> tags
- Only call ONE tool at a time

If you don't need tools, respond normally.`;
}
