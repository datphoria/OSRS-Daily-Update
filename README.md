OSRS-Daily-Update

Purpose:
Daily Wise Old Man / OSRS hiscores summary and goal-tracking notifications delivered to Discord.

Setup:
1. Create a GitHub repository named `OSRS-Daily-Update` and push this folder (or push this workspace folder to a new repo).
2. Add a repository secret named `DISCORD_WEBHOOK` containing your Discord webhook URL.
3. (Optional) Add WISEOLDMAN_API_KEY if you request higher rate limits.
4. Trigger the workflow manually or wait for the scheduled run (07:30 UTC daily).

Files of interest:
- scripts/wiseoldman-report.js — Node script that fetches Wise Old Man timelines, computes deltas and ETA, posts to Discord.
- .github/workflows/daily-report.yml — GitHub Actions workflow that runs the script daily at 07:30 UTC.

Notes:
- The script uses the Wise Old Man public API v2. It sets a User-Agent header as recommended.
- No secrets are stored in the repo; put the DISCORD_WEBHOOK URL in GitHub Secrets before running.
