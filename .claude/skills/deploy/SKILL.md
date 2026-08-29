---
name: deploy
description: Push the current branch to origin/main and give the one-line SSH command to force-trigger the Игротека VPS auto-deploy immediately, instead of waiting for its cron interval.
disable-model-invocation: true
---

# Deploying Игротека

This project deploys to a VPS (papaluha.online) that already runs its own auto-deploy: a cron job periodically runs `/root/igroteka/auto-deploy.sh`, which does `git fetch`, compares `HEAD` to `origin/main`, and if they differ, runs `git pull`, `npm install`, `npm run build:client` (rebuilds the React client — this step was missing until it was added; don't remove it), and `pm2 restart igroteka`, logging to `/root/igroteka/auto-deploy.log`.

So most of the time, pushing to `main` is the whole deploy — the VPS picks it up on its own within its cron interval. This skill exists for the case where the user wants it live *now*, not on the next cron tick.

## Steps

1. **Check git state.** Run `git status --short` and `git log origin/main..HEAD --oneline`. If there's nothing to push and the working tree is clean, say so and stop — there's nothing to deploy.
2. **Never commit without being asked.** If there are uncommitted changes the user hasn't explicitly asked to commit, stop and ask first — this skill only pushes and triggers deploy, it doesn't decide what goes in a commit.
3. **Push.** `git push origin main`.
4. **Give the manual-trigger command.** Claude Code's sandbox blocks outbound SSH directly (confirmed: the auto-mode classifier denies it even with a valid key), so this step is always handed to the user to run themselves, never attempted directly:

   ```bash
   ssh -i ~/.ssh/igroteka_vps root@195.19.199.246 "cd /root/igroteka && bash auto-deploy.sh && tail -20 auto-deploy.log"
   ```

   (The dedicated key `~/.ssh/igroteka_vps` — comment `claude-igroteka-vps` — already exists in the user's own `~/.ssh/`. If that IP no longer resolves, the other historically-seen candidate was `95.85.232.143`; ask the user to confirm rather than guessing silently.)

5. **After the user reports the log output**, check it for `git pull`/`npm install`/`npm run build:client`/`pm2 restart igroteka` all completing without errors, and confirm the deploy actually changed anything — the auto-deploy script only runs its body when `git rev-parse main` differs from `git rev-parse origin/main` at the start, so if the log shows no new timestamped entry, the push likely hadn't reached the remote yet or the VPS's `origin/main` was already current.

## Verifying after deploy

Don't just trust the log — confirm the live behavior:
- If `client/` changed: ask the user to hard-refresh (or open in incognito) the affected page, since a stale cached `index.html` pointing at a now-deleted hashed asset filename is a real failure mode here (Vite regenerates hashes on every build) and looks like a broken layout, not a missing-file error, in casual testing.
- If server-side game logic changed: a quick real playthrough beats reading the log.

If something looks wrong live and reproduces consistently (not just once), reproduce it locally first (`npm run build:client` + `node server.js` from repo root, same commit as the VPS) before assuming it's a code bug — this repo has a working local repro path for everything that runs on the VPS.
