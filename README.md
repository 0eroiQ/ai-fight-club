# AI Fight Club — Council Console

The GitHub Pages dashboard runs a scripted demo and can display transcripts from real GitHub Actions debates. You can also run a private live debate on your machine.

## Run one live debate on GitHub

After this workflow is approved and present on the default branch:

1. Open [Run live council debate](https://github.com/0eroiQ/ai-fight-club/actions/workflows/live-debate.yml) while signed in with write access. Select **Run workflow** and keep the branch set to **main**.
2. Enter a mission of 12 to 3000 characters. Confirm public sharing and the OpenRouter key settings, then select **Run workflow**. This repository is public. Choose a mission you are comfortable sharing with GitHub, OpenRouter, and the model providers. If your OpenRouter workspace has direct provider credentials (BYOK) or enforces paid plugins, use a key and workspace without those settings for this workflow.
3. Open the finished run and download **council-debate-1** under **Artifacts** (the suffix is the attempt number). Unzip it, then open the [dashboard](https://0eroiq.github.io/ai-fight-club/) and use **Import transcript** to select `debate.json`. You can also read the JSON directly. A failed run can have a partial transcript. The artifact is retained for seven days.

The workflow reads `OPENROUTER_API_KEY` from GitHub Actions repository secrets. Each run uses six explicit OpenRouter free model variants and a final synthesis, for at most seven calls. Price caps are zero and provider fallback is disabled. An unavailable or rate-limited model can interrupt the debate. The workflow runs on demand and publishes a transcript artifact. GitHub Pages serves static files, so the dashboard links to the authenticated GitHub Actions launch screen and reads the file you select locally.

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

The server binds to this machine only. It sends the mission and earlier replies to OpenRouter and the selected model providers. Confirm potential charges in the dashboard before each debate. A complete debate makes seven potentially billed requests, one per model and one final synthesis from Nemotron. Replies are discussion only. An interrupted run keeps the replies already received.

Use `npm run dev` for the scripted demo and `npm test` for checks. The live integration tests use simulated provider responses.
