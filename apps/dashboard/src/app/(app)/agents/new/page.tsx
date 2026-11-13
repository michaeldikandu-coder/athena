'use client';

import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AgentForm, EMPTY_AGENT, formToBody } from '@/components/agent-form';
import { Card, PageHeader } from '@/components/ui';

export default function NewAgentPage() {
  const router = useRouter();
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="New agent"
        description="Pick tools from the shared registry and grant the permissions they need. Built-in memory tools are added when the agent has read:memory / write:memory."
      />
      <Card>
        <AgentForm
          initial={EMPTY_AGENT}
          submitLabel="Create agent"
          onSubmit={async (value) => {
            const { data } = await api<{ id: string }>('/agents', { body: formToBody(value) });
            router.push(`/agents/${data.id}`);
          }}
        />
      </Card>
    </div>
  );
}
