#!/usr/bin/env node
/**
 * PreToolUse hook: before the agent writes a file, ask the user to confirm if
 * the target is a secrets file (.env, .env.*, but not .env.example).
 * Reads the hook's JSON from stdin and searches it for such a path, so it
 * works whatever the exact field name is.
 */
let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  const paths = input.match(/[^"'\s]*\.env(\.[A-Za-z0-9_-]+)?(?=["'\s]|$)/g) || [];
  const secret = paths.find((p) => !/\.env\.example$/.test(p));
  if (secret) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          permissionDecision: 'ask',
          permissionDecisionReason: `This edit touches ${secret}, which holds secrets. Confirm before Kiro changes it.`,
        },
      })
    );
  }
  process.exit(0);
});
