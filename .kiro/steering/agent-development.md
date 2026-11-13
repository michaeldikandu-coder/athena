# Agent Development Guidelines

## Agent Architecture Principles

### Core Philosophy
Athena agents are **reusable, composable, and observable**. Every agent built on Athena should leverage the same runtime components, making them predictable and maintainable.

## Building an Agent

### 1. Define Agent Purpose
Every agent needs a clear, specific purpose:
- **MoneyGuard**: Investigate financial transactions and execute approved actions
- **OpsGuard**: Respond to operational incidents and coordinate resolution

### 2. Configure Agent Properties
```typescript
interface AgentConfig {
  name: string;              // Human-readable name
  description: string;       // What the agent does
  systemPrompt: string;      // LLM instructions
  modelConfig: ModelConfig;  // LLM provider settings
  tools: string[];          // Tool IDs the agent can use
  permissions: Permission[]; // What the agent is allowed to do
}
```

### 3. Define Tools
Tools are the actions an agent can take. Each tool must:
- Have a clear, specific purpose
- Define input schema with Zod
- Validate all inputs
- Return structured output
- Handle errors gracefully

**Tool Template:**
```typescript
export const myTool: Tool = {
  id: 'my_tool',
  name: 'My Tool',
  description: 'Clear description of what this tool does',
  inputSchema: z.object({
    param1: z.string().describe('Description of param1'),
    param2: z.number().optional().describe('Optional param2'),
  }),
  permissionLevel: 'medium',
  requiresApproval: false,
  handler: async (input, context) => {
    // Validate input
    const validated = myTool.inputSchema.parse(input);
    
    // Execute operation
    const result = await performOperation(validated);
    
    // Return structured result
    return {
      success: true,
      data: result,
    };
  },
};
```

### 4. Create Workflows
Workflows orchestrate multi-step agent behavior:

```typescript
interface Workflow {
  id: string;
  name: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
}
```

**Workflow Best Practices:**
- Keep steps small and focused
- Make steps idempotent when possible
- Store intermediate state
- Handle failures gracefully
- Enable workflow resumption

## Permission Levels

### Low Risk
- Read-only operations
- Information retrieval
- Data queries
- No approval required

### Medium Risk
- Create/update operations
- Non-critical actions
- Internal notifications
- May require approval based on context

### High Risk
- Financial transactions
- Data deletion
- External communications
- System-critical operations
- **Always requires approval**

## Human Approval Flow

### When to Require Approval
- High-risk operations (defined above)
- Actions with financial impact
- External communications
- Irreversible operations
- Policy-defined sensitive actions

### Approval Request Format
```typescript
interface ApprovalRequest {
  executionId: string;
  tool: string;
  input: Record<string, any>;
  reason: string;           // Why the agent wants to do this
  context: ExecutionContext; // Full execution context
  expiresAt: Date;          // Approval timeout
}
```

### Implementing Approval in Tools
```typescript
handler: async (input, context) => {
  // Check if approval required
  if (requiresApproval) {
    const approval = await requestApproval({
      executionId: context.executionId,
      tool: 'sensitive_action',
      input,
      reason: 'Agent detected suspicious transaction pattern',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
    });
    
    if (!approval.approved) {
      throw new ApprovalDeniedError(approval.reason);
    }
  }
  
  // Proceed with operation
  return performSensitiveAction(input);
}
```

## Memory Management

### Types of Memory
1. **Context Memory**: Current execution context
2. **Conversation Memory**: Dialog history
3. **Fact Memory**: Learned information
4. **Decision Memory**: Past decisions and outcomes

### Memory Usage
```typescript
// Store memory
await memory.store({
  agentId: agent.id,
  executionId: execution.id,
  type: 'fact',
  content: 'Customer has history of chargebacks',
  metadata: { customerId: 'cust_123' },
});

// Retrieve memory
const relevantMemory = await memory.retrieve({
  agentId: agent.id,
  type: 'fact',
  metadata: { customerId: 'cust_123' },
  limit: 10,
});
```

## Agent Runtime Execution

### Execution Lifecycle
1. **Trigger**: Event, webhook, or manual trigger
2. **Initialize**: Load agent config and tools
3. **Execute**: Agent reasons and calls tools
4. **Monitor**: Log all actions and state changes
5. **Complete**: Store results and cleanup

### Tool Call Loop
```
1. Agent receives task
2. Agent reasons about next action
3. Agent selects tool and parameters
4. System validates permissions
5. System requests approval if needed
6. Tool executes
7. Result returned to agent
8. Repeat until task complete
```

## Observability

### What to Log
- Execution start/end
- Tool calls (input/output)
- Permission checks
- Approval requests/decisions
- Errors and failures
- State transitions

### Execution Events
Emit structured events for real-time monitoring:
```typescript
emitExecutionEvent({
  executionId: execution.id,
  type: 'tool_call',
  tool: 'get_transaction',
  input: { transactionId: 'txn_123' },
  timestamp: new Date(),
});
```

## Error Handling in Agents

### Agent Errors
- **ToolNotFoundError**: Tool doesn't exist
- **PermissionDeniedError**: Agent lacks permission
- **ApprovalDeniedError**: Approval was rejected
- **ToolExecutionError**: Tool failed during execution
- **WorkflowError**: Workflow step failed

### Recovery Strategies
1. **Retry**: For transient failures
2. **Fallback**: Alternative tool or approach
3. **Ask for help**: Request human intervention
4. **Graceful degradation**: Continue with reduced functionality
5. **Fail and report**: Stop execution and notify

## Testing Agents

### Unit Tests
Test individual components:
- Tool handlers
- Permission checks
- Input validation
- Error handling

### Integration Tests
Test agent workflows:
- End-to-end workflow execution
- Tool orchestration
- Approval flows
- Memory operations

### Demo Scenarios
Prepare realistic scenarios for demos:
- Happy path (everything works)
- Approval required (human intervention)
- Error handling (graceful failure)
- Multiple steps (complex workflow)

## Application-Specific Customization

### MoneyGuard Example
```typescript
const moneyGuardConfig: AgentConfig = {
  name: 'MoneyGuard',
  description: 'Financial operations monitoring agent',
  systemPrompt: `You are MoneyGuard, a financial operations agent.
    Your role is to monitor transactions, identify risks, and 
    recommend actions to protect against fraud and errors.
    Always explain your reasoning and request approval for
    financial actions.`,
  tools: [
    'get_transaction_details',
    'get_customer_profile',
    'check_risk_rules',
    'flag_transaction',
    'create_case',
  ],
  permissions: ['read:transactions', 'read:customers', 'write:cases'],
};
```

### OpsGuard Example
```typescript
const opsGuardConfig: AgentConfig = {
  name: 'OpsGuard',
  description: 'Business operations monitoring agent',
  systemPrompt: `You are OpsGuard, an operations monitoring agent.
    Your role is to respond to operational incidents, diagnose
    issues, and coordinate resolution. Gather information from
    multiple systems and provide clear incident summaries.`,
  tools: [
    'get_system_status',
    'check_service_health',
    'query_logs',
    'create_ticket',
    'send_alert',
  ],
  permissions: ['read:systems', 'read:logs', 'write:tickets'],
};
```

## Reusability Checklist

When building a new agent on Athena, ensure:
- [ ] Uses standard agent runtime (no custom execution logic)
- [ ] Tools follow standard interface
- [ ] Permissions properly configured
- [ ] Approval flow for sensitive actions
- [ ] Memory properly utilized
- [ ] Events emitted for observability
- [ ] Errors handled gracefully
- [ ] Documentation complete
- [ ] Demo scenario prepared

## Performance Considerations

### Tool Execution
- Keep tools fast (< 5 seconds when possible)
- Use timeouts for external calls
- Cache frequently accessed data
- Batch operations when possible

### Memory Queries
- Limit memory retrieval (top 10-20 items)
- Index by agentId and type
- Set expiration on temporary context
- Clean up old execution data

### Real-time Updates
- Batch WebSocket emissions
- Rate limit event broadcasts
- Only emit significant state changes
- Use efficient serialization

## Common Pitfalls

❌ **Don't:**
- Hard-code agent logic outside the runtime
- Skip permission checks
- Ignore approval requirements
- Log sensitive data
- Create agent-specific execution patterns
- Duplicate tool implementations

✅ **Do:**
- Leverage the shared runtime
- Define clear tool boundaries
- Request approval for sensitive actions
- Mask PII in logs
- Reuse existing tools
- Share tools between agents when appropriate
