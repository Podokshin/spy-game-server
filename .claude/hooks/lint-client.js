#!/usr/bin/env node
// PostToolUse hook (Edit|Write): runs oxlint on client/ whenever an edit
// touches client/src/**. Advisory only — never exits non-zero, so it can
// never block the edit that already happened.
const { execSync } = require('child_process');
const path = require('path');

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input);
    const filePath = (payload.tool_input && payload.tool_input.file_path) || '';
    if (!/client[\\/]src[\\/]/i.test(filePath)) return;

    const clientDir = path.join(__dirname, '..', '..', 'client');
    try {
      const output = execSync('npx oxlint', { cwd: clientDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      if (output.trim()) process.stdout.write(output);
    } catch (err) {
      // oxlint exits non-zero when it finds lint errors — that's the whole
      // point of this hook, so surface its output instead of swallowing it.
      if (err.stdout) process.stdout.write(err.stdout);
      if (err.stderr) process.stderr.write(err.stderr);
    }
  } catch {
    // malformed hook input — never let this block anything
  }
});
