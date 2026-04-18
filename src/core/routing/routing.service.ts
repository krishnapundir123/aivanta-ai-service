import { generateChatCompletion, generateEmbedding } from '../../infrastructure/llm/openai-client';

export interface Agent {
  id: string;
  name: string;
  email: string;
  expertise: string[];
  currentWorkload: number;
  avgResolutionTime: number;
  slaPerformance: number;
  isActive?: boolean;
}

export interface TicketForRouting {
  id: string;
  title: string;
  description: string;
  category?: string;
  priority: string;
  complexity?: 'low' | 'medium' | 'high';
}

export interface RoutingResult {
  recommendedAssignee: {
    agentId: string;
    confidence: number;
    reasoning: string;
  };
  alternatives: Array<{
    agentId: string;
    confidence: number;
    reason: string;
  }>;
  factors: {
    expertiseMatch: number;
    workloadFactor: number;
    slaUrgency: number;
  };
}

// Calculate complexity score based on ticket content
function calculateComplexity(title: string, description: string): 'low' | 'medium' | 'high' {
  const combinedText = `${title} ${description}`.toLowerCase();
  
  // High complexity indicators
  const highIndicators = [
    'urgent', 'critical', 'emergency', 'outage', 'down', 'failure',
    'security', 'breach', 'data loss', 'corruption', 'migration',
    'architecture', 'redesign', 'refactor'
  ];
  
  // Medium complexity indicators
  const mediumIndicators = [
    'bug', 'issue', 'error', 'problem', 'not working',
    'integration', 'api', 'performance', 'slow', 'timeout'
  ];
  
  const highScore = highIndicators.filter(i => combinedText.includes(i)).length;
  const mediumScore = mediumIndicators.filter(i => combinedText.includes(i)).length;
  
  if (highScore > 0) return 'high';
  if (mediumScore > 0) return 'medium';
  return 'low';
}

// Calculate expertise match score
function calculateExpertiseMatch(ticket: TicketForRouting, agent: Agent): number {
  const ticketText = `${ticket.title} ${ticket.description} ${ticket.category || ''}`.toLowerCase();
  const expertise = agent.expertise.map(e => e.toLowerCase());
  
  let matches = 0;
  for (const exp of expertise) {
    if (ticketText.includes(exp)) {
      matches++;
    }
  }
  
  // Normalize to 0-1 range
  return expertise.length > 0 ? matches / expertise.length : 0;
}

// Calculate workload factor (inverse - lower workload = higher score)
function calculateWorkloadFactor(agent: Agent): number {
  const maxWorkload = 20; // Assume max 20 tickets per agent
  const normalizedWorkload = Math.min(agent.currentWorkload / maxWorkload, 1);
  return 1 - normalizedWorkload; // Invert so lower workload = higher score
}

// Calculate SLA urgency factor
function calculateSLAUrgency(priority: string, agentSLA: number): number {
  const priorityMultiplier: Record<string, number> = {
    'P0': 1.5,
    'CRITICAL': 1.5,
    'P1': 1.2,
    'HIGH': 1.2,
    'P2': 1.0,
    'MEDIUM': 1.0,
    'LOW': 0.8,
  };
  
  const multiplier = priorityMultiplier[priority.toUpperCase()] || 1.0;
  return (agentSLA / 100) * multiplier;
}

export async function suggestAssignee(
  ticket: TicketForRouting,
  availableAgents: Agent[]
): Promise<RoutingResult> {
  if (availableAgents.length === 0) {
    throw new Error('No available agents');
  }

  // Determine complexity if not provided
  const complexity = ticket.complexity || calculateComplexity(ticket.title, ticket.description);
  
  // Calculate scores for each agent
  const scoredAgents = availableAgents.map(agent => {
    const expertiseScore = calculateExpertiseMatch(ticket, agent);
    const workloadScore = calculateWorkloadFactor(agent);
    const slaScore = calculateSLAUrgency(ticket.priority, agent.slaPerformance);
    
    // Weighted scoring
    const weights = {
      expertise: 0.4,
      workload: 0.3,
      sla: 0.2,
      availability: 0.1,
    };
    
    const totalScore = 
      expertiseScore * weights.expertise +
      workloadScore * weights.workload +
      slaScore * weights.sla +
      (agent.isActive ? 1 : 0) * weights.availability;
    
    return {
      agent,
      scores: {
        expertise: expertiseScore,
        workload: workloadScore,
        sla: slaScore,
        total: totalScore,
      },
    };
  });
  
  // Sort by total score
  scoredAgents.sort((a, b) => b.scores.total - a.scores.total);
  
  // Get top recommendations
  const topRecommendations = scoredAgents.slice(0, 3);
  
  // Generate reasoning for top recommendation
  const recommended = topRecommendations[0];
  const reasoning = generateReasoning(ticket, recommended.agent, recommended.scores, complexity);
  
  return {
    recommendedAssignee: {
      agentId: recommended.agent.id,
      confidence: recommended.scores.total,
      reasoning,
    },
    alternatives: topRecommendations.slice(1).map(r => ({
      agentId: r.agent.id,
      confidence: r.scores.total,
      reason: generateBriefReason(r.agent, r.scores),
    })),
    factors: {
      expertiseMatch: recommended.scores.expertise,
      workloadFactor: recommended.scores.workload,
      slaUrgency: recommended.scores.sla,
    },
  };
}

function generateReasoning(
  ticket: TicketForRouting,
  agent: Agent,
  scores: { expertise: number; workload: number; sla: number; total: number },
  complexity: string
): string {
  const reasons: string[] = [];
  
  if (scores.expertise > 0.5) {
    const matchedExpertise = agent.expertise.filter(e => 
      ticket.title.toLowerCase().includes(e.toLowerCase()) ||
      ticket.description.toLowerCase().includes(e.toLowerCase())
    );
    reasons.push(`Expert in ${matchedExpertise.join(', ')}`);
  }
  
  if (scores.workload > 0.7) {
    reasons.push('Low current workload');
  }
  
  if (scores.sla > 0.8) {
    reasons.push('Strong SLA performance');
  }
  
  if (complexity === 'high') {
    reasons.push('Suitable for high complexity issues');
  }
  
  return reasons.join('; ') || 'Best overall match';
}

function generateBriefReason(agent: Agent, scores: { expertise: number; workload: number; sla: number }): string {
  if (scores.expertise > 0.5) return 'Good expertise match';
  if (scores.workload > 0.8) return 'Low workload';
  if (scores.sla > 0.8) return 'Strong SLA performance';
  return 'Available for assignment';
}

// Batch routing for multiple tickets
export async function batchSuggestAssignees(
  tickets: TicketForRouting[],
  availableAgents: Agent[]
): Promise<Array<{ ticketId: string; recommendation: RoutingResult }>> {
  const results = await Promise.all(
    tickets.map(async ticket => {
      const recommendation = await suggestAssignee(ticket, availableAgents);
      return { ticketId: ticket.id, recommendation };
    })
  );
  
  return results;
}
