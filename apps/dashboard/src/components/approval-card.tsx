'use client';

import { useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { Approval } from '@/lib/types';
import { timeAgo } from '@/lib/format';
import { AppBadge, Button, JsonBlock, StatusBadge, TextLink } from './ui';

export function ApprovalCard({ approval, onDecided }: { approval: Approval; onDecided?: () => void }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = approval.status === 'pending';

  const decide = async (approved: boolean) => {
    setBusy(approved ? 'approve' : 'reject');
    setError(null);
    try {
      await api(`/approvals/${approval.id}/decision`, {
        body: { approved, comment: comment.trim() || undefined },
      });
      onDecided?.();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-amber-200">{approval.requestedAction.tool}</span>
        <StatusBadge status={approval.status} />
        <AppBadge application={approval.application} />
        {approval.agentName && <span className="text-xs text-ink-400">by {approval.agentName}</span>}
        <span className="ml-auto text-xs text-ink-400">
          requested {timeAgo(approval.requestedAt)}
          {pending && ` · expires ${new Date(approval.expiresAt).toLocaleTimeString()}`}
        </span>
      </div>

      {approval.task && (
        <p className="mb-2 text-xs text-ink-400">
          Task: <span className="text-ink-300">{approval.task}</span>
        </p>
      )}
      <div className="mb-3">
        <div className="label">Agent&apos;s reasoning</div>
        <p className="whitespace-pre-wrap text-sm text-ink-100">{approval.requestedAction.reason}</p>
      </div>
      <div className="mb-3">
        <div className="label">Action input</div>
        <JsonBlock value={approval.requestedAction.input} />
      </div>

      {pending ? (
        <div className="space-y-2">
          <input
            className="input"
            placeholder="Comment for the agent (optional)"
            value={comment}
            maxLength={1000}
            onChange={(e) => setComment(e.target.value)}
          />
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex items-center gap-2">
            <Button variant="success" loading={busy === 'approve'} disabled={busy !== null} onClick={() => void decide(true)}>
              Approve
            </Button>
            <Button variant="danger" loading={busy === 'reject'} disabled={busy !== null} onClick={() => void decide(false)}>
              Reject
            </Button>
            <span className="ml-auto text-xs">
              <TextLink href={`/executions/${approval.executionId}`}>View execution →</TextLink>
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between text-xs text-ink-400">
          <span>
            {approval.reviewedAt ? `Decided ${timeAgo(approval.reviewedAt)}` : ''}
            {approval.reviewerComment && ` — “${approval.reviewerComment}”`}
          </span>
          <TextLink href={`/executions/${approval.executionId}`}>View execution →</TextLink>
        </div>
      )}
    </div>
  );
}
