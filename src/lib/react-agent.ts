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
        return {
          answer: "I apologize, but I couldn't complete the task within the step limit. Please try rephrasing your question.",
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
      ? `\n\n## Available Context:\n${context.relevantResources.map(r => r.content.substring(0, 300)).join('\n\n')}`
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
1. ONE tool call per response
2. ALWAYS include "Thought:" before every action
3. Use ONLY tools from the list above
4. Action Input must be valid JSON
5. Don't make up information - use tool results

## Examples:

Example 1 - Simple Query:
Question: What's the weather in Paris?
Thought: I need to check the weather for Paris using the get_weather tool
Action: get_weather
Action Input: {"location": "Paris"}
Observation: {"temperature": 15, "conditions": "cloudy", "humidity": 65}
Thought: I have the weather information now, I can provide a complete answer
Final Answer: The weather in Paris is currently 15°C and cloudy with 65% humidity.

Example 2 - Multi-step Query:
Question: Create a task to call mom on Sunday
Thought: I should use the create_task tool to create this reminder
Action: create_task
Action Input: {"title": "Call mom", "due_date": "Sunday"}
Observation: {"id": 5, "title": "Call mom", "due_date": "Sunday", "completed": false}
Thought: Task was created successfully with ID 5
Final Answer: I've created a task "Call mom" for Sunday (Task ID: 5).${resourceContext}`;
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
   * Parse ReAct-formatted response
   */
  private parseReActResponse(response: string): ReActStep {
    const lines = response.split('\n');

    const step: ReActStep = {
      thought: ''
    };

    // Extract Thought
    const thoughtMatch = response.match(/Thought:\s*(.+?)(?=\n|$)/is);
    if (thoughtMatch) {
      step.thought = thoughtMatch[1].trim();
    }

    // Check for Final Answer
    const answerMatch = response.match(/Final Answer:\s*(.+?)$/is);
    if (answerMatch) {
      step.answer = answerMatch[1].trim();
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
