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
 * Also handles malformed tags like <function_name>...</function>
 */
export function extractFunctionCall(text: string): FunctionCall | null {
  // Try standard format first: <function>{"name": "...", "parameters": {...}}</function>
  let match = text.match(/<function>([\s\S]*?)<\/function>/);
  
  if (match) {
    try {
      const jsonStr = match[1].trim();
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
  }

  // Try malformed format: <function_name>{...}</function> or <function_name>{...}</function_name>
  // This is a common LLM mistake where it uses function name as opening tag
  const malformedMatch = text.match(/<([a-z_][a-z0-9_]*)>([\s\S]*?)<\/(?:function|[a-z_][a-z0-9_]*)>/i);
  
  if (malformedMatch) {
    const functionName = malformedMatch[1];
    const content = malformedMatch[2].trim();
    
    // Skip if this was already handled by first matcher
    if (functionName === 'function') return null;
    
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(content);
      
      return {
        name: functionName,
        arguments: JSON.stringify(parsed)
      };
    } catch (e) {
      console.warn(`Found tag <${functionName}> but couldn't parse content as JSON:`, content);
    }
  }

  return null;
}

/**
 * Strip function call tags from assistant message, keeping only the call
 * This prevents explanatory text from polluting the conversation
 */
export function cleanAssistantMessage(text: string): string {
  // Try standard format first
  let match = text.match(/<function>([\s\S]*?)<\/function>/);
  if (match) {
    return match[0];
  }
  
  // Try malformed format: <function_name>...</function> or <function_name>...</function_name>
  const malformedMatch = text.match(/<([a-z_][a-z0-9_]*)>([\s\S]*?)<\/(?:function|[a-z_][a-z0-9_]*)>/i);
  if (malformedMatch && malformedMatch[1] !== 'function') {
    // Normalize to standard format
    return `<function>{"name": "${malformedMatch[1]}", "parameters": ${malformedMatch[2].trim()}}</function>`;
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

To use a tool, you MUST respond with this EXACT format:
<function>{"name": "tool_name", "parameters": {"param1": "value1"}}</function>

CRITICAL FORMAT RULES:
- Opening tag MUST be: <function> (not <tool_name>)
- Closing tag MUST be: </function> (not </tool_name>)
- Place ONLY valid JSON between tags
- Use "parameters" key for tool arguments
- You can include explanatory text AFTER the </function> tag
- Only call ONE tool at a time

CORRECT examples:
<function>{"name": "search_recipes", "parameters": {"query": "pasta"}}</function>
<function>{"name": "substitute_ingredient", "parameters": {"ingredient": "butter", "reason": "vegan"}}</function>

INCORRECT examples (DO NOT USE):
<search_recipes>{"query": "pasta"}</function>  ❌ Wrong opening tag!
<function>{"name": "search_recipes"}</search_recipes>  ❌ Wrong closing tag!

If you don't need tools, respond normally without any <function> tags.`;
}
