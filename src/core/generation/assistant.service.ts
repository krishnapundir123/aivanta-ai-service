import { generateChatCompletion, generateEmbedding, ChatMessage } from '../../infrastructure/llm/openai-client';

export interface AssistantResponse {
  content: string;
  deflectionConfidence: number;
  suggestedResources?: string[];
  shouldCreateTicket: boolean;
}

const ASSISTANT_SYSTEM_PROMPT = `You are AiVanta Assistant, a helpful customer support AI.
Your goal is to answer customer questions and resolve issues without creating tickets when possible.

Guidelines:
- Be friendly, professional, and concise
- Provide accurate information based on available knowledge
- If you can fully answer the question, do so confidently
- If you need more information, ask clarifying questions
- If the issue requires human intervention, indicate that a ticket should be created

Response confidence (0-1):
- 0.8-1.0: Issue fully resolved, no ticket needed
- 0.5-0.8: Partial resolution, may need follow-up
- 0.0-0.5: Insufficient information, ticket recommended`;

export async function processAssistantQuery(
  query: string,
  tenantId: string,
  history: ChatMessage[] = []
): Promise<AssistantResponse> {
  const messages: ChatMessage[] = [
    { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
    ...history,
    {
      role: 'system',
      content: `Tenant context: ${tenantId}`,
    },
    { role: 'user', content: query },
  ];

  const response = await generateChatCompletion(messages, {
    temperature: 0.7,
  });

  // Calculate deflection confidence based on response content and history
  const lowerResponse = response.toLowerCase();
  let deflectionConfidence = 0.7; // Default

  // Adjust confidence based on response indicators
  if (lowerResponse.includes('i need to create a ticket') ||
      lowerResponse.includes('i\'ll connect you with') ||
      lowerResponse.includes('let me escalate this')) {
    deflectionConfidence = 0.3;
  } else if (lowerResponse.includes('is there anything else') ||
             lowerResponse.includes('glad i could help') ||
             lowerResponse.includes('you\'re welcome')) {
    deflectionConfidence = 0.9;
  }

  // Determine if ticket should be created
  const shouldCreateTicket = deflectionConfidence < 0.5 ||
    lowerResponse.includes('create a ticket') ||
    lowerResponse.includes('support team');

  // Extract suggested resources (mock for now)
  const suggestedResources: string[] = [];
  if (lowerResponse.includes('documentation') || lowerResponse.includes('docs')) {
    suggestedResources.push('Documentation Portal');
  }
  if (lowerResponse.includes('faq') || lowerResponse.includes('common questions')) {
    suggestedResources.push('FAQ Section');
  }

  return {
    content: response,
    deflectionConfidence,
    suggestedResources: suggestedResources.length > 0 ? suggestedResources : undefined,
    shouldCreateTicket,
  };
}

export async function summarizeConversation(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const conversationText = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
  
  const prompt = `Summarize the following customer support conversation in 2-3 sentences, capturing:
1. The customer's main issue or question
2. Any resolutions or next steps discussed
3. Whether the issue was resolved or if follow-up is needed

Conversation:
${conversationText}`;

  return generateChatCompletion([
    { role: 'system', content: 'You are a conversation summarization assistant.' },
    { role: 'user', content: prompt },
  ], {
    temperature: 0.3,
    maxTokens: 200,
  });
}
