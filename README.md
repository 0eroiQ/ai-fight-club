# AI Fight Club — Council Console

The public GitHub Pages dashboard runs a scripted demo. The same dashboard can run privately on your machine with six live OpenRouter models.

## Run live debates

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

The server binds to this machine only. It sends the mission and earlier replies to OpenRouter and the selected model providers. A complete debate makes seven potentially billed requests: one per model and one final synthesis from Nemotron. Replies are discussion only. An interrupted run keeps the replies already received.

Use `npm run dev` for the scripted demo and `npm test` for checks. The live integration tests use simulated provider responses.
