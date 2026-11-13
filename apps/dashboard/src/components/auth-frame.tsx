export function AuthFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-600 text-lg font-bold text-white">
            A
          </div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-ink-400">One skeleton, many agents.</p>
        </div>
        <div className="rounded-lg border border-ink-800 bg-ink-900 p-6">{children}</div>
      </div>
    </div>
  );
}
