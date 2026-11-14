'use client';

import { useState } from 'react';
import { api, describeError } from '@/lib/api';
import type { Approval } from '@/lib/types';
import { timeAgo } from '@/lib/format';
import { AppBadge, Button, JsonBlock, StatusBadge, TextLink } from './ui';

function minutesLeft(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000));
}

export function ApprovalCard({ approval, onDecided }: { approval: Approval; onDecided?: () => void }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = approval.status === 'pending';

  const decide = async (approved: boolean) => {
    setBusy(approved ? 'approve' : 'reject');
    setError(null);
    try {
      await api(`/approvals/${approval.id}/decision`, { body: { approved, comment: comment.trim() || undefined } });
      onDecided?.();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className={`card overflow-hidden ${pending ? 'border-warn-line' : ''}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-5 py-3.5">
        <span className="mono text-[15px] font-medium text-ink">{approval.requestedAction.tool}</span>
        <StatusBadge status={approval.status} kind="approval" />
        {approval.application !== undefined && <AppBadge application={approval.application} />}
        <span className="w-full text-label text-muted sm:ml-auto sm:w-auto">
          {approval.agentName ? `${approval.agentName} · ` : ''}asked {timeAgo(approval.requestedAt)}
          {pending && ` · ${minutesLeft(approval.expiresAt)} min left`}
        </span>
      </header>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {approval.task && <p className="mb-3 break-words text-[14px] text-muted">{approval.task}</p>}
          <div className="label">Why the agent wants this</div>
          <p className="whitespace-pre-wrap break-words text-[16px] leading-relaxed text-ink">{approval.requestedAction.reason}</p>
        </div>
        <div className="min-w-0">
          <div className="label">What it will send</div>
          <JsonBlock value={approval.requestedAction.input} />
        </div>
      </div>

      {pending ? (
        <footer className="space-y-3 border-t border-line bg-bg px-5 py-4">
          <label className="block">
            <span className="label">Note to the agent (optional)</span>
            <input
              className="input"
              placeholder="For example: refund half, the customer kept one item"
              value={comment}
              maxLength={1000}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
          {error && <p className="text-[14px] text-bad">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button loading={busy === 'approve'} disabled={busy !== null} onClick={() => void decide(true)}>
              Approve action
            </Button>
            <Button variant="danger" loading={busy === 'reject'} disabled={busy !== null} onClick={() => void decide(false)}>
              Reject
            </Button>
            <span className="ml-auto">
              <TextLink href={`/executions/${approval.executionId}`}>Open the run</TextLink>
            </span>
          </div>
        </footer>
      ) : (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-[14px] text-muted">
          <span>
            {approval.reviewedAt ? `Decided ${timeAgo(approval.reviewedAt)}` : ''}
            {approval.reviewerComment && ` · “${approval.reviewerComment}”`}
          </span>
          <TextLink href={`/executions/${approval.executionId}`}>Open the run</TextLink>
        </footer>
      )}
    </article>
  );
}
