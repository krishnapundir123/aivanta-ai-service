import { generateChatCompletion } from '../../infrastructure/llm/openai-client';

export interface TicketForPrediction {
  id: string;
  title: string;
  description: string;
  category?: string;
  priority: string;
  status: string;
  createdAt: string;
  assigneeId?: string;
  messageCount: number;
  customerTier?: string;
}

export interface ResolutionPrediction {
  estimatedHours: number;
  confidence: number;
  confidenceInterval: {
    min: number;
    max: number;
  };
  factors: Array<{
    name: string;
    impact: 'high' | 'medium' | 'low';
    description: string;
  }>;
}

export interface SLABreachPrediction {
  willBreach: boolean;
  probability: number;
  estimatedBreachTime?: string;
  riskFactors: string[];
  recommendedActions: string[];
}

// Base resolution times by priority (in hours)
const baseResolutionTimes: Record<string, number> = {
  'P0': 4,
  'CRITICAL': 4,
  'P1': 24,
  'HIGH': 24,
  'P2': 72,
  'MEDIUM': 72,
  'LOW': 168,
};

export async function predictResolutionTime(
  ticket: TicketForPrediction
): Promise<ResolutionPrediction> {
  const baseTime = baseResolutionTimes[ticket.priority.toUpperCase()] || 72;
  
  // Estimate based on content analysis
  const text = `${ticket.title} ${ticket.description}`.toLowerCase();
  let estimatedHours = baseTime;
  
  // Adjust for keywords
  if (text.includes('urgent') || text.includes('critical')) {
    estimatedHours *= 0.8;
  }
  if (text.includes('complex') || text.includes('architecture')) {
    estimatedHours *= 1.3;
  }
  
  // Unassigned penalty
  if (!ticket.assigneeId) {
    estimatedHours *= 1.2;
  }
  
  return {
    estimatedHours: Math.round(estimatedHours * 10) / 10,
    confidence: 0.75,
    confidenceInterval: {
      min: Math.round(estimatedHours * 0.7 * 10) / 10,
      max: Math.round(estimatedHours * 1.3 * 10) / 10,
    },
    factors: [
      {
        name: 'Priority Level',
        impact: 'high',
        description: `Base timeline for ${ticket.priority} priority`,
      },
      {
        name: ticket.assigneeId ? 'Assigned' : 'Unassigned',
        impact: ticket.assigneeId ? 'low' : 'medium',
        description: ticket.assigneeId ? 'Ticket has owner' : 'No owner assigned',
      },
    ],
  };
}

export async function predictSLABreach(
  ticket: TicketForPrediction,
  slaDeadline: Date,
  currentTime: Date = new Date()
): Promise<SLABreachPrediction> {
  const timeToDeadline = slaDeadline.getTime() - currentTime.getTime();
  const hoursToDeadline = timeToDeadline / (1000 * 60 * 60);
  
  const resolutionPrediction = await predictResolutionTime(ticket);
  const estimatedHours = resolutionPrediction.estimatedHours;
  
  const willBreach = hoursToDeadline < estimatedHours;
  const probability = willBreach 
    ? Math.min(0.9, 0.5 + (estimatedHours - hoursToDeadline) / 24)
    : Math.max(0.1, 0.5 - (hoursToDeadline - estimatedHours) / 48);
  
  const riskFactors: string[] = [];
  if (willBreach) riskFactors.push('Estimated resolution exceeds deadline');
  if (hoursToDeadline < 4) riskFactors.push('Less than 4 hours remaining');
  if (!ticket.assigneeId) riskFactors.push('Ticket unassigned');
  
  const recommendedActions: string[] = [];
  if (!ticket.assigneeId) recommendedActions.push('Assign immediately');
  if (probability > 0.7) recommendedActions.push('Escalate to senior agent');
  if (willBreach) recommendedActions.push('Notify customer of potential delay');
  
  return {
    willBreach,
    probability: Math.round(probability * 100) / 100,
    estimatedBreachTime: willBreach 
      ? new Date(currentTime.getTime() + estimatedHours * 60 * 60 * 1000).toISOString()
      : undefined,
    riskFactors,
    recommendedActions,
  };
}
