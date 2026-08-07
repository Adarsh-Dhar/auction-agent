# Caspian Email Service for Auction Agent

This service enables bidders to join auctions by sending emails to a dedicated email address. It uses the Caspian SDK to receive emails and integrates with the existing Next.js auction join API.

## Setup

### 1. Environment Variables

Copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

The `.env` file should contain:

```env
CASPIAN_API_KEY=comm_sandbox_e6e9f019461b7c4787ccf4d4b56a0db715c5b40f
CASPIAN_BASE_URL=https://api.trycaspianai.com
CASPIAN_MAILBOX=bids
```

- `CASPIAN_API_KEY`: Your Caspian API key (already configured)
- `CASPIAN_BASE_URL`: Caspian API endpoint (default: https://api.trycaspianai.com)
- `CASPIAN_MAILBOX`: Email mailbox name (default: "bids")

### 2. Install Dependencies

```bash
cd email-service
./start.sh
```

Or manually:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Start the Service

```bash
./start.sh
```

Or manually:

```bash
source venv/bin/activate
python handler.py
```

The service will:
1. Connect to Caspian email service
2. Display the agent's email address (e.g., `bids@agents.trycaspianai.com`)
3. Start listening for incoming emails

## Usage

### For Bidders

Bidders can join auctions by sending an email to the agent's address with:

- **Format 1**: `/join K7P2QX`
- **Format 2**: `join K7P2QX`  
- **Format 3**: Just the code: `K7P2QX`

The service will:
1. Extract the 6-character auction code from the email
2. Use the sender's email to generate a handle (part before @)
3. Call the Next.js API to join the auction
4. Reply with confirmation or error details

### Example Email Flow

**Sender**: john.doe@gmail.com  
**To**: bids@agents.trycaspianai.com  
**Body**: `/join K7P2QX`

**Response**: 
```
✅ You've joined the auction!

Auction: Vintage Camera Collection
Your handle: john.doe
Your ID: bidder_123

You'll receive updates via email. Good luck!
```

## Testing

### Test with Caspian's Test Email API

```bash
curl -s -X POST https://api.trycaspianai.com/v1/test-emails \
  -H "Authorization: Bearer $CASPIAN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"text":"join K7P2QX"}'
```

This will send a test email to your agent. Check the service logs to see the message being processed.

## Architecture

```
Email → Caspian Service → Python Handler → Next.js API → Auction Store
```

1. **Caspian Service**: Receives emails and forwards to Python handler
2. **Python Handler**: Parses email, extracts auction code, calls Next.js API
3. **Next.js API**: Validates code, adds bidder to auction store
4. **Auction Store**: In-memory store managing auction state

## Configuration

### Changing the Mailbox Name

Edit `.env`:
```env
CASPIAN_MAILBOX=auction-bids
```

This changes the email address to `auction-bids@agents.trycaspianai.com`

### Next.js API URL

By default, the handler calls `http://localhost:3000`. To change:

```env
NEXTJS_API_URL=https://your-domain.com
```

## Troubleshooting

### Service won't start

- Check that Python 3 is installed: `python3 --version`
- Verify virtual environment was created: `ls venv/`
- Check dependencies: `pip list`

### Emails not being received

- Verify the service is running and listening
- Check the agent email address displayed on startup
- Ensure CASPIAN_API_KEY is valid
- Check Caspian service status

### API connection errors

- Ensure Next.js app is running on the expected URL
- Check NEXTJS_API_URL in `.env`
- Verify the `/api/auctions/join` endpoint is accessible

## Development

### Adding New Commands

Edit `parse_join_command()` in `handler.py` to support additional formats:

```python
def parse_join_command(text: str) -> dict:
    # Add your parsing logic here
    pass
```

### Custom Email Responses

Modify the `handle_message()` function to customize reply formatting.

## Production Deployment

For production:

1. Use a production Caspian API key (not sandbox)
2. Deploy the Python service to a persistent server (PM2, systemd, etc.)
3. Use environment-specific configuration
4. Add logging and monitoring
5. Implement error handling and retry logic

## License

Part of the Auction Agent Dashboard project.
