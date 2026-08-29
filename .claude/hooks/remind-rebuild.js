#!/usr/bin/env node
// PostToolUse hook (Edit|Write): after any edit under client/src/**, inject
// a reminder that client/dist is now stale — it's gitignored and only
// rebuilt via `npm run build:client`, not automatically. Advisory only:
// no "continue: false", never blocks anything.
let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input);
    const filePath = (payload.tool_input && payload.tool_input.file_path) || '';
    if (!/client[\\/]src[\\/]/i.test(filePath)) return;

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: 'client/dist устарел после этой правки в client/src — она не попадёт на прод, пока не выполнить `npm run build:client`.',
      },
    }));
  } catch {
    // malformed hook input — never let this block anything
  }
});
