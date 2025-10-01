/**
 * ReAct (Reasoning + Acting) Agent Implementation
 * Provides structured reasoning loop: Thought → Action → Observation → Final Answer
 */

import type { LLMClientInterface, ChatMessage } from './llm-client-interface';
import { PyodideMcpClient } from './mcp-pyodide-client';

export interface ReActStep {
  thought: string;
  action?: {
    tool: string;
    args: any;
  };
  observation?: string;
  answer?: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: any;
}

export interface ConversationContext {
  relevantResources: Array<{ uri: string; content: string }>;
  conversationHistory: ChatMessage[];
  tools: Tool[];
}

export class ReActAgent {
  constructor(
    private llmClient: LLMClientInterface,
    private mcpClient: PyodideMcpClient
  ) {}

  /**
   * Run the ReAct loop until final answer or max steps
   */
  async run(
    userQuery: string,
    tools: Tool[],
    context: ConversationContext,
    maxSteps = 5,
    onStepComplete?: (step: ReActStep) => void
  ): Promise<{ answer: string; steps: ReActStep[] }> {
    const steps: ReActStep[] = [];

    for (let i = 0; i < maxSteps; i++) {
      console.log(`🔄 ReAct Step ${i + 1}/${maxSteps}`);

      // Build ReAct-formatted prompt
      const messages = this.buildReActMessages(userQuery, tools, steps, context);

      // Get LLM response
      const response = await this.llmClient.chat(messages, undefined);

      // Parse structured ReAct output
      const step = this.parseReActResponse(response.content || '');
      console.log('📝 Thought:', step.thought);

      if (step.action) {
        console.log(`🔧 Action: ${step.action.tool}`, step.action.args);

        // Execute the action
        try {
          const result = await this.executeAction(step.action);

          // Deterministic fast-path: if get_workout_details returns markdown, answer immediately
          if (step.action.tool === 'get_workout_details' && result && typeof result === 'object' && result.markdown) {
            const answer = String(result.markdown);
            steps.push({ ...step, observation: JSON.stringify(result, null, 2), answer });
            onStepComplete?.(steps[steps.length - 1]);
            console.log('🧾 Using tool-provided markdown as final answer');
            return { answer, steps };
          }

          step.observation = JSON.stringify(result, null, 2);
          console.log('👁️ Observation:', step.observation.substring(0, 200));
        } catch (error: any) {
          step.observation = `ERROR: ${error.message}`;
          console.error('❌ Action failed:', error.message);
        }
      } else if (step.answer) {
        console.log('✅ Final Answer:', step.answer.substring(0, 100));
        steps.push(step);
        onStepComplete?.(step);
        return { answer: step.answer, steps };
      } else {
        // No action and no answer = error
        step.observation = 'ERROR: You must either provide an Action or a Final Answer.';
        console.warn('⚠️ Invalid response - no action or answer');
      }

      steps.push(step);
      onStepComplete?.(step);

      // Safety check for infinite loops
      if (i === maxSteps - 1) {
        // Use accumulated observations as fallback
        const observations = steps
          .filter(s => s.observation && !s.observation.startsWith('ERROR'))
          .map(s => s.observation)
          .join('\n\n');

        if (observations) {
          console.warn('⚠️ Max steps reached - generating answer from accumulated data');
          return {
            answer: `Based on the information I gathered:\n\n${observations}\n\nI reached the step limit, but here's what I found. Please let me know if you'd like more specific details.`,
            steps
          };
        }

        return {
          answer: "I apologize, but I couldn't complete the task within the step limit. Please try rephrasing your question or using different tools.",
          steps
        };
      }
    }

    return {
      answer: "Task incomplete",
      steps
    };
  }

  /**
   * Build messages with ReAct format
   */
  private buildReActMessages(
    query: string,
    tools: Tool[],
    steps: ReActStep[],
    context: ConversationContext
  ): ChatMessage[] {
    const systemPrompt = this.buildSystemPrompt(tools, context);
    const userPrompt = this.buildUserPrompt(query, steps);

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
  }

  /**
   * Build system prompt with tools and examples
   */
  private buildSystemPrompt(tools: Tool[], context: ConversationContext): string {
    const toolDescriptions = tools.map(t =>
      `- ${t.name}: ${t.description}\n  Parameters: ${JSON.stringify(t.parameters.properties || {})}`
    ).join('\n\n');

    const resourceContext = context.relevantResources.length > 0
      ? `\n\n## ⚠️ IMPORTANT - Context Already Available:\nThe following information has already been retrieved for you. CHECK THIS FIRST before calling any tools!\n\n${context.relevantResources.map((r, i) => `[Context ${i+1}]:\n${r.content.substring(0, 500)}`).join('\n\n---\n\n')}`
      : '';

    return `You are a helpful assistant that uses tools to answer questions accurately.

## Available Tools:
${toolDescriptions}

## Response Format:
You MUST respond in this EXACT format:

Thought: [your reasoning about what to do next]
Action: [tool_name]
Action Input: {"param": "value"}

After receiving the Observation, continue with another Thought/Action cycle.
When you have enough information, provide:

Thought: [final reasoning]
Final Answer: [your complete response to the user]

## CRITICAL RULES:
1. **CHECK AVAILABLE CONTEXT FIRST** - If the answer is already in the context above, use it! Don't call tools unnecessarily.
2. ONE tool call per response
3. ALWAYS include "Thought:" before every action
4. Use ONLY tools from the list above (${tools.map(t => t.name).join(', ')})
5. Action Input must be valid JSON
6. Don't make up information - use tool results or provided context
7. READ tool results carefully - don't say something is missing when it's clearly in the results

### When a resource_uri is available (e.g., res://thai_green_curry, res://beginner_strength)
- **IMPORTANT**: For follow-up questions like "show full recipe", "show details", "what ingredients", etc., ALWAYS call the appropriate details tool (get_recipe_details, get_recipe_ingredients, get_recipe_steps, get_workout_details) with the resource_uri from the conversation.
- Do NOT rely on context alone when the user explicitly asks for "full" or "complete" details - use the details tool to get the authoritative, formatted response.
- Do NOT re-run search tools unless the user explicitly changes their criteria or asks to search again.
- Extract the resource_uri from recent conversation history (look for "res://..." patterns in assistant responses).

## Examples:

Example 1 - Using Available Context (NO TOOLS NEEDED):
Question: Tell me about the Vegan Pasta Primavera recipe
Context Already Provided: [Vegan Pasta Primavera recipe: 8 oz pasta, 2 cups vegetables, olive oil, garlic. Instructions: 1. Cook pasta 2. Sauté vegetables 3. Combine and serve]
YOUR RESPONSE:
Thought: The user is asking about Vegan Pasta Primavera. I can see the full recipe is already provided in the context above with ingredients (pasta, vegetables, olive oil, garlic) and cooking steps. I don't need to call any tools - I can answer directly from this context.
Final Answer: Here's the Vegan Pasta Primavera recipe:

**Ingredients:**
- 8 oz pasta
- 2 cups mixed vegetables
- Olive oil and garlic

**Instructions:**
1. Cook pasta according to package directions
2. Sauté vegetables in olive oil with garlic
3. Combine and serve hot

Example 1b - Cuisine Search with Context Available (NO TOOLS NEEDED):
Question: Show me Thai recipes
Context Already Provided: [Thai Green Curry (res://thai_green_curry): coconut milk, curry paste, vegetables, chicken. Cook curry paste, add coconut milk, simmer with protein and vegetables]
YOUR RESPONSE:
Thought: The user wants Thai recipes. I can see Thai Green Curry (res://thai_green_curry) is already in the context above with ingredients and instructions. I don't need to call any tools - I'll provide a summary from the context.
Final Answer: Here's a Thai recipe: **Thai Green Curry** (res://thai_green_curry)

This authentic Thai dish includes coconut milk, green curry paste, vegetables, and your choice of protein. To make it: cook the curry paste until fragrant, add coconut milk, then simmer with your protein and vegetables until cooked through. Serve with rice.

For the complete recipe with exact measurements and detailed steps, just ask "show me the full recipe"!

Example 2 - Need to Use Tool:
Question: What's the weather in Paris?
Context: [empty or unrelated]
YOUR RESPONSE:
Thought: I need to check the weather for Paris using the get_weather tool
Action: get_weather
Action Input: {"location": "Paris"}
[STOP HERE - wait for observation]

Then I will give you:
Observation: {"temperature": 15, "conditions": "cloudy"}

Then your next response:
Thought: I have the weather information now
Final Answer: The weather in Paris is currently 15°C and cloudy.

Example 3 - Follow-Up with Details Tool (IMPORTANT PATTERN):
Conversation History:
User: "Show me Thai recipes"
Assistant: "Here's Thai Green Curry (res://thai_green_curry): [brief description]"
User: "Show me the full recipe"

YOUR RESPONSE:
Thought: The user wants the complete recipe details. Looking at the conversation history, I previously mentioned Thai Green Curry with the URI "res://thai_green_curry". I should use the get_recipe_details tool with this exact resource_uri.
Action: get_recipe_details
Action Input: {"resource_uri": "res://thai_green_curry"}
[STOP HERE - wait for tool result with markdown]

Example 4 - Dietary Restriction Search:
Question: Find vegan recipes
YOUR RESPONSE:
Thought: The user wants vegan recipes. I should use the find_recipes_by_dietary tool with "vegan" restriction.
Action: find_recipes_by_dietary
Action Input: {"dietary_restriction": "vegan"}
[STOP HERE - do NOT invent observations]

## CRITICAL:
- **If context already contains the answer, use it immediately - don't call tools!**
- NEVER generate fake "Observation:" lines - I will provide them
- After Action Input, STOP and wait
- Do NOT continue with "Observation:" or "Final Answer:" in same response
- Each response should have EITHER (Action + Action Input) OR (Final Answer), NEVER BOTH
- READ tool results word-by-word before deciding what they contain
- **NEVER invent data that wasn't in tool results or context** - If you don't have information, say so honestly
- **If a tool returns no results or empty data, acknowledge it - don't make up alternatives**
- **External URLs, websites, or sources should ONLY come from tool results, never invented**
- **Do NOT hallucinate studies, articles, statistics, or expert opinions - use only provided data**${resourceContext}`;
  }

  /**
   * Build user prompt with query and previous steps
   */
  private buildUserPrompt(query: string, steps: ReActStep[]): string {
    if (steps.length === 0) {
      return `Question: ${query}\n\nBegin!`;
    }

    // Format previous steps
    const formattedSteps = steps.map((step, i) => {
      let stepText = `Thought: ${step.thought}`;

      if (step.action) {
        stepText += `\nAction: ${step.action.tool}`;
        stepText += `\nAction Input: ${JSON.stringify(step.action.args)}`;
      }

      if (step.observation) {
        stepText += `\nObservation: ${step.observation}`;
      }

      return stepText;
    }).join('\n\n');

    return `Question: ${query}\n\n${formattedSteps}\n\n(Continue with Thought/Action or provide Final Answer)`;
  }

  /**
   * Validate response doesn't contain hallucinated content
   */
  private validateResponse(response: string, step: ReActStep): void {
    // Check for suspicious patterns that indicate hallucination
    const hallucinationIndicators = [
      /https?:\/\/[^\s]+/g,  // URLs (unless from tool results)
      /\b(?:Delish|Taste of Home|AllRecipes|Food Network|Bon Appetit)\b/i,  // Popular cooking sites
      /\b\d{4}\b.*(?:study|research|article|paper)/i,  // Year + study/research
      /according to (?:experts|studies|research)/i,  // Fake citations
    ];
    
    // If we have a Final Answer, check for invented content
    if (step.answer) {
      for (const pattern of hallucinationIndicators) {
        const matches = step.answer.match(pattern);
        if (matches) {
          console.warn(`⚠️ Potential hallucination detected: ${matches[0]}`);
          console.warn('This content was not in tool results or context');
          // Log for debugging but don't block (false positives possible)
        }
      }
    }
  }

  /**
   * Parse ReAct-formatted response
   */
  private parseReActResponse(response: string): ReActStep {
    // Strip out any hallucinated observations/final answers after Action Input
    // Model should ONLY output Thought + Action + Action Input, nothing else
    const actionInputMatch = response.match(/(Thought:.+?Action Input:\s*\{[\s\S]*?\})/s);
    if (actionInputMatch && response.includes('Observation:')) {
      console.warn('⚠️ Model hallucinated Observation - stripping it out');
      response = actionInputMatch[1];
    }

    const step: ReActStep = {
      thought: ''
    };

    // Extract Thought (only the first line after "Thought:")
    const thoughtMatch = response.match(/Thought:\s*(.+?)(?=\n|$)/s);
    if (thoughtMatch) {
      step.thought = thoughtMatch[1].trim();
    }

    // Check for Final Answer FIRST (if present, ignore actions)
    const answerMatch = response.match(/Final Answer:\s*(.+?)$/is);
    if (answerMatch) {
      step.answer = answerMatch[1].trim();
      
      // Validate for potential hallucinations
      this.validateResponse(response, step);
      
      return step;
    }

    // Extract Action and Action Input
    const actionMatch = response.match(/Action:\s*(.+?)(?=\n|$)/);
    const inputMatch = response.match(/Action Input:\s*(\{[\s\S]*?\})/);

    if (actionMatch && inputMatch) {
      try {
        step.action = {
          tool: actionMatch[1].trim(),
          args: JSON.parse(inputMatch[1])
        };
      } catch (error) {
        console.error('Failed to parse action input:', inputMatch[1]);
        step.thought += ' (ERROR: Invalid JSON in Action Input)';
      }
    }

    return step;
  }

  /**
   * Execute a tool action via MCP
   */
  private async executeAction(action: { tool: string; args: any }): Promise<any> {
    try {
      const result = await this.mcpClient.call('tools/call', {
        name: action.tool,
        args: action.args
      });

      return result;
    } catch (error: any) {
      console.error(`Tool execution failed (${action.tool}):`, error);
      throw error;
    }
  }
}
