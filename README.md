# AI Fight Club — Council Console

The GitHub Pages dashboard can stream a real debate through an authenticated HTTPS bridge. It also supports the scripted demo and importing transcripts from GitHub Actions. You can run a private live debate on your machine.

## Start live debates from GitHub Pages

1. Run this repository's Node.js 22+ server on a host you control. In the server environment set `OPENROUTER_API_KEY`, `COUNCIL_BRIDGE_ORIGIN` to the public HTTPS origin (for example, `https://council.example.com`), and `COUNCIL_BRIDGE_PASSWORD` to a separate password generated with `openssl rand -hex 32`. Keep the key and password in private server configuration. Use an OpenRouter workspace without direct provider credentials (BYOK) or enforced paid plugins.
2. Start the server with `npm start`. It listens on `127.0.0.1:4173`. Have an HTTPS reverse proxy serve `/ai-fight-club/api/` on that same host, preserve the public `Host` header, set `X-Forwarded-Proto` to `https`, and stream responses without buffering or caching. Do not expose the loopback listener directly.
3. Set the GitHub Actions repository **variable** `COUNCIL_BRIDGE_ORIGIN` to that same public HTTPS origin, with no trailing slash. Run the GitHub Pages deployment. The public build receives only the bridge address.
4. On [the dashboard](https://0eroiq.github.io/ai-fight-club/), enter the mission and the dashboard password, then select **Start Live Debate**. The Debate Room displays answers as they arrive and marks the run complete after the seventh answer, the synthesis.

The bridge accepts requests from `https://0eroiq.github.io` and authenticates each debate request. The dashboard clears its password field when submitting and does not store the credential. The bridge passes the mission and preceding replies to OpenRouter. It uses the same six explicit free model variants as GitHub Actions, caps token and request prices at zero, and allows one debate at a time. Free model limits or outages can interrupt a debate, in which case replies received so far remain visible.

For example, in an nginx virtual host that already has TLS configured:

```nginx
location /ai-fight-club/api/ {
    proxy_pass http://127.0.0.1:4173;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 90s;
}
```

## Run one live debate on GitHub

After this workflow is approved and present on the default branch:

1. Open [Run live council debate](https://github.com/0eroiQ/ai-fight-club/actions/workflows/live-debate.yml) while signed in with write access. Select **Run workflow** and keep the branch set to **main**.
2. Enter a mission of 12 to 3000 characters. Confirm public sharing and the OpenRouter key settings, then select **Run workflow**. This repository is public. Choose a mission you are comfortable sharing with GitHub, OpenRouter, and the model providers. If your OpenRouter workspace has direct provider credentials (BYOK) or enforces paid plugins, use a key and workspace without those settings for this workflow.
3. Open the finished run and download **council-debate-1** under **Artifacts** (the suffix is the attempt number). Unzip it, then open the [dashboard](https://0eroiq.github.io/ai-fight-club/) and use **Import transcript** to select `debate.json`. You can also read the JSON directly. A failed run can have a partial transcript. The artifact is retained for seven days.

The workflow reads `OPENROUTER_API_KEY` from GitHub Actions repository secrets. Each run uses six explicit OpenRouter free model variants and a final synthesis, for at most seven calls. Price caps are zero and provider fallback is disabled. An unavailable or rate-limited model can interrupt the debate. The workflow runs on demand and publishes a transcript artifact. The static dashboard links to the workflow and offers transcript import when live streaming is unavailable.

### Resume an interrupted debate

1. Open the latest interrupted debate on `main`. Copy the numeric run ID from its URL after `/actions/runs/`. The run must still have its transcript artifact.
2. Open **Run workflow** on `main`, leave **mission** blank, and enter the ID in **resume_run_id**. Check both confirmations and start the run.
3. Download the new run's transcript and import `debate.json` into the dashboard. The transcript includes the previous replies and the remaining ones as they arrive. If it stops again, repeat with the new run ID.

The workflow reuses the saved mission and starts with the first missing reply. The final synthesis receives all six earlier replies. If GitHub stops the runner before it can upload a transcript, that attempt has no file to resume from.

## Run a private live debate locally

With Node.js 22 or later:

```bash
npm install
npm run build
```

In macOS Terminal (zsh), enter an OpenRouter key at the hidden prompt and start the server:

```zsh
read -rs 'OPENROUTER_API_KEY?OpenRouter API key: '
OPENROUTER_API_KEY="$OPENROUTER_API_KEY" npm start
unset OPENROUTER_API_KEY
```

Alternatively, set `OPENROUTER_API_KEY` in the local `.env` file ignored by Git. Never set it as a `VITE_*` variable. Open [the private dashboard](http://127.0.0.1:4173/ai-fight-club/) and select **Start Live Debate**. Stop the server with Ctrl+C.

The server binds to this machine only. It sends the mission and earlier replies to OpenRouter and the selected model providers. Use an OpenRouter workspace without direct provider credentials or enforced paid plugins. A complete debate makes seven free-model requests, one per model and one final synthesis from Nemotron. An interrupted run keeps the replies already received.

Use `npm run dev` for the scripted demo and `npm test` for checks. The live integration tests use simulated provider responses.
