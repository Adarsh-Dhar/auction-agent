# auction-agent

A Next.js dashboard for managing auctions with real-time bidder participation.

## Features

- **Dashboard UI**: Monitor auctions, bidders, and settlements in real-time
- **Email Integration**: Bidders can join auctions via email using Caspian SDK
- **Real-time Updates**: Live auction status and bidder activity
- **Mock Data**: In-memory store for development and testing

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.8+ (for email service)
- npm or pnpm

### Installation

```bash
# Install dependencies
npm install
# or
pnpm install
```

### Running the Application

```bash
# Start Next.js dashboard
npm run dev
# or
pnpm dev
```

The dashboard will be available at `http://localhost:3000`

## Email Service Setup

The email service allows bidders to join auctions by sending emails to a dedicated address.

### Quick Start

```bash
# Start the email service
npm run email-service
```

This will:
1. Set up a Python virtual environment
2. Install Caspian SDK dependencies
3. Start the email handler
4. Display the agent's email address (e.g., `bids@agents.trycaspianai.com`)

### Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

The `.env` file contains:
- `CASPIAN_API_KEY`: Your Caspian API key (pre-configured)
- `CASPIAN_BASE_URL`: Caspian API endpoint
- `CASPIAN_MAILBOX`: Email mailbox name

### Usage

Bidders can join auctions by emailing the agent address with:

- `/join K7P2QX`
- `join K7P2QX`
- Just the code: `K7P2QX`

For detailed documentation, see [email-service/README.md](./email-service/README.md)

## Architecture

```
┌─────────────┐
│   Email     │
│  (Caspian)  │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Python     │────▶│  Next.js    │────▶│  Auction    │
│  Handler    │     │  API        │     │  Store      │
└─────────────┘     └─────────────┘     └─────────────┘
```

## Development

### Project Structure

- `app/`: Next.js app directory with pages and API routes
- `components/`: React components
- `lib/`: Shared utilities and auction store
- `email-service/`: Python email handler with Caspian SDK

### Key Files

- `lib/auction-store.ts`: In-memory auction state management
- `app/api/auctions/join/route.ts`: API endpoint for joining auctions
- `email-service/handler.py`: Email processing logic

## Testing

### Test Email Service

```bash
curl -s -X POST https://api.trycaspianai.com/v1/test-emails \
  -H "Authorization: Bearer $CASPIAN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"text":"join K7P2QX"}'
```

## License

MIT
