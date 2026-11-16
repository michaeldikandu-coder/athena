import { logger } from '@athena/shared';

/**
 * How work outlives the request that started it.
 *
 * - Long-lived server: a floating promise keeps running (the default).
 * - Vercel: the host registers waitUntil() so the function stays alive until
 *   the work settles, and a continuation handler that starts a fresh
 *   invocation when a run needs more time than one function may use.
 */
type Task = () => Promise<unknown>;

let runner: (task: Task) => void = (task) => {
  void task().catch((error) => logger.error('Background task failed', error as Error));
};

let continuation: ((executionId: string) => Promise<void>) | null = null;
let driver: ((executionId: string) => Promise<void>) | null = null;

export function setBackgroundRunner(fn: (promise: Promise<unknown>) => void): void {
  runner = (task) => {
    const promise = task().catch((error) => logger.error('Background task failed', error as Error));
    fn(promise);
  };
}

export function runInBackground(task: Task): void {
  runner(task);
}

/** Called when a run stopped because its time slice ran out */
export function setContinuationHandler(fn: (executionId: string) => Promise<void>): void {
  continuation = fn;
}

/** @internal set by the run driver */
export function registerRunDriver(fn: (executionId: string) => Promise<void>): void {
  driver = fn;
}

/** Advance a run in the background (start, resume after approval, retry) */
export function scheduleRun(executionId: string): void {
  if (!driver) throw new Error('Run driver not registered');
  const drive = driver;
  runInBackground(() => drive(executionId));
}

/** Continue a run that used up its time slice, in a new invocation when the host provides one */
export function continueRun(executionId: string): void {
  if (!continuation) {
    scheduleRun(executionId);
    return;
  }
  const next = continuation;
  runInBackground(() => next(executionId));
}

/**
 * Milliseconds a single invocation may spend advancing a run before it hands
 * over to a new one. RUN_SLICE_SECONDS overrides; on Vercel the default stays
 * well inside the 300 s function limit, elsewhere there is no limit.
 */
export function runSliceMs(): number {
  const configured = Number(process.env.RUN_SLICE_SECONDS);
  if (Number.isFinite(configured) && configured > 0) return configured * 1000;
  return process.env.VERCEL ? 200_000 : Number.POSITIVE_INFINITY;
}
