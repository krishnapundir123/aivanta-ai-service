import { generateChatCompletion, ChatMessage } from '../../infrastructure/llm/openai-client';

export interface CopilotContext {
  activeTicketId?: string;
  activeFilters?: Record<string, unknown>;
  userRole?: string;
  tenantId?: string;
}

export interface CopilotAction {
  type: string;
  label: string;
  params: Record<string, unknown>;
}

export interface CopilotResponse {
  content: string;
  actions?: CopilotAction[];
  context?: Record<string, unknown>;
}

const COPILOT_SYSTEM_PROMPT = `You are AiVanta Copilot, an AI assistant for support agents.
You help agents manage tickets, find information, and take actions.

Available actions you can suggest:
- assign_ticket: Assign a ticket to someone
- update_status: Change ticket status
- add_comment: Add a comment to a ticket
- search_tickets: Search for similar tickets
- escalate: Escalate a ticket
- summarize: Summarize ticket history

When suggesting actions, include them in the actions field.
Be concise and helpful. Use the available context to provide relevant assistance.`;

export async function processCopilotQuery(
  query: string,
  context: CopilotContext,
  history: ChatMessage[] = []
): Promise<CopilotResponse> {
  const messages: ChatMessage[] = [
    { role: 'system', content: COPILOT_SYSTEM_PROMPT },
    ...history,
    {
      role: 'system',
      content: `Current context: ${JSON.stringify(context)}`,
    },
    { role: 'user', content: query },
  ];

  const response = await generateChatCompletion(messages, {
    temperature: 0.7,
  });

  // Parse response to extract actions (simplified - in production use structured output)
  const actions: CopilotAction[] = [];
  
  // Detect intent for actions
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes('assign') && context.activeTicketId) {
    actions.push({
      type: 'assign_ticket',
      label: 'Assign Ticket',
      params: { ticketId: context.activeTicketId },
    });
  }
  
  if (lowerQuery.includes('summarize') && context.activeTicketId) {
    actions.push({
      type: 'summarize',
      label: 'Summarize Ticket',
      params: { ticketId: context.activeTicketId },
    });
  }

  return {
    content: response,
    actions: actions.length > 0 ? actions : undefined,
    context: {
      ...context,
      lastQuery: query,
    },
  };
}

export async function executeCopilotAction(
  action: string,
  params: Record<string, unknown>
): Promise<unknown> {
  // In a real implementation, this would make API calls to the core service
  // For now, return a mock response
  return {
    success: true,
    action,
    params,
    message: `Action ${action} executed successfully`,
  };
}
