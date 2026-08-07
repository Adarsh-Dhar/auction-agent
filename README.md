# auction-agent

## Caspian email agent

The Next.js app exposes the auction admin API and a Caspian REST adapter for the live email channel. Copy `.env.example` into your project environment and set `CASPIAN_API_KEY` (optionally override `CASPIAN_BASE_URL`). The mailbox requested by this agent is `auction-agent@agents.trycaspianai.com`.

Run the web app with `pnpm dev`. Run the inbound agent worker separately with `pnpm agent`; it connects the email channel and consumes Caspian’s message stream. Without a Caspian key, admin routes remain available with local in-memory fallback, but live email delivery and the worker are disabled.

The current live-channel implementation intentionally supports email only. Other channel routes return an explicit unsupported-channel response rather than pretending to deliver messages.
