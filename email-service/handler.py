#!/usr/bin/env python3
"""
Caspian Email Service for Auction Agent
Handles incoming emails and routes them to auction actions via the Next.js
API: joining, placing bids, checking status, and logging questions. Also
sends a best-effort outbid notification when someone is bid past.
"""

import os
import re
import requests
from dotenv import load_dotenv
from caspian_sdk import CommClient

# Load environment variables
load_dotenv()

CASPIAN_API_KEY = os.getenv("CASPIAN_API_KEY")
CASPIAN_BASE_URL = os.getenv("CASPIAN_BASE_URL", "https://api.trycaspianai.com")
CASPIAN_MAILBOX = os.getenv("CASPIAN_MAILBOX", "bids")
NEXTJS_API_URL = os.getenv("NEXTJS_API_URL", "http://localhost:3000")

if not CASPIAN_API_KEY:
    raise ValueError("CASPIAN_API_KEY environment variable is required")

# Set once in main() after connect_email(); used to send outbid notifications
# that aren't a reply to an inbound message.
EMAIL_CONNECTION_ID = None


def parse_intent(text: str) -> dict:
    """
    Classify an inbound email body into one of: join, bid, status, question.

    Formats recognized:
    - join:   "/join K7P2QX", "join K7P2QX", or a bare 6-char code "K7P2QX"
    - bid:    "bid 2500", "bid $2,500", or a bare "$2500"
    - status: "status", "update", "how's it going"
    - anything else falls through to "question"
    """
    stripped = text.strip()
    lowered = stripped.lower()

    join_match = re.search(r'\bjoin\s+([a-z0-9]{4,8})\b', lowered)
    if join_match:
        return {"type": "join", "code": join_match.group(1).upper()}
    if re.fullmatch(r'[a-z0-9]{6}', lowered):
        return {"type": "join", "code": lowered.upper()}

    bid_match = re.search(r'\bbid\b[^\d]*([\d,]+(?:\.\d+)?)', lowered)
    if not bid_match:
        bid_match = re.search(r'\$\s*([\d,]+(?:\.\d+)?)', stripped)
    if bid_match:
        return {"type": "bid", "amount": bid_match.group(1)}

    if lowered.strip("?! ") in ("status", "update", "how's it going", "hows it going"):
        return {"type": "status"}

    return {"type": "question", "text": stripped}


def lookup_bidder_by_email(email: str):
    """Find which auction/bidder record this sender already belongs to."""
    try:
        response = requests.get(
            f"{NEXTJS_API_URL}/api/bidders/lookup",
            params={"email": email},
            timeout=10,
        )
        if response.status_code == 200:
            return response.json()
        return None
    except Exception as e:
        print(f"Lookup failed: {e}")
        return None


def join_auction_via_api(code: str, name: str, handle: str, address: str, connection: str = "Email") -> dict:
    try:
        response = requests.post(
            f"{NEXTJS_API_URL}/api/auctions/join",
            json={"code": code, "name": name, "handle": handle, "connection": connection, "address": address},
            timeout=10,
        )
        if response.status_code == 201:
            return response.json()
        return {"error": response.json().get("error", "Failed to join auction")}
    except Exception as e:
        return {"error": f"API request failed: {str(e)}"}


def place_bid_via_api(auction_id: str, bidder_id: str, amount: str) -> dict:
    try:
        response = requests.post(
            f"{NEXTJS_API_URL}/api/auctions/{auction_id}/bid",
            json={"bidderId": bidder_id, "amount": amount},
            timeout=10,
        )
        if response.status_code == 200:
            return response.json()
        return {"error": response.json().get("error", "Failed to place bid")}
    except Exception as e:
        return {"error": f"API request failed: {str(e)}"}


def get_auction_status(auction_id: str):
    try:
        response = requests.get(f"{NEXTJS_API_URL}/api/auctions/{auction_id}", timeout=10)
        if response.status_code == 200:
            return response.json()
        return None
    except Exception as e:
        print(f"Status fetch failed: {e}")
        return None


def post_question_via_api(bidder_id: str, text: str) -> dict:
    try:
        response = requests.post(
            f"{NEXTJS_API_URL}/api/bidders/{bidder_id}",
            json={"body": text},
            timeout=10,
        )
        if response.status_code == 201:
            return response.json()
        return {"error": "Failed to log question"}
    except Exception as e:
        return {"error": f"API request failed: {str(e)}"}


def notify_outbid(client: CommClient, outbid_bidder: dict, auction_title: str, new_top_bid: str):
    """
    Best-effort outbid notice, sent cold (not as a reply to an inbound message)
    via client.initiate(). Caspian's docs explicitly confirm initiate() for
    phone/SMS and Google Meet; email isn't explicitly documented either way,
    so this is defensive - if initiate() isn't supported for email on your
    gateway version, this will raise and get logged instead of crashing the
    handler. Test this path with a real outbid before relying on it.
    """
    address = outbid_bidder.get("email")
    if not address or not EMAIL_CONNECTION_ID:
        return
    try:
        client.initiate(
            EMAIL_CONNECTION_ID,
            address,
            f"You've been outbid on \"{auction_title}\". "
            f"The new top bid is {new_top_bid}. Reply with \"bid <amount>\" to get back in.",
        )
        print(f"Sent outbid notice to {address}")
    except Exception as e:
        print(f"Could not send outbid notice to {address}: {e}")


def handle_message(message, client: CommClient):
    """
    Handle incoming email messages: join / bid / status / question.
    """
    sender = message.sender
    if isinstance(sender, dict):
        sender = sender.get('address', 'unknown@example.com')

    text = message.text
    conversation_id = message.conversation_id

    print(f"[{conversation_id}] Received email from {sender}: {text[:100]}...")

    email_handle = sender.split('@')[0]
    display_name = email_handle.replace('.', ' ').title()
    intent = parse_intent(text)

    if intent["type"] == "join":
        result = join_auction_via_api(intent["code"], display_name, email_handle, sender)
        if "error" in result:
            reply = f"Sorry, I couldn't join you to the auction: {result['error']}"
        else:
            auction = result.get("auction", {})
            bidder = result.get("bidder", {})
            reply = (
                f"✅ You've joined the auction!\n\n"
                f"Auction: {auction.get('title', 'Unknown')}\n"
                f"Your handle: {bidder.get('handle', email_handle)}\n"
                f"Your ID: {bidder.get('id', 'Unknown')}\n\n"
                f"To bid, reply with \"bid <amount>\" (e.g. \"bid 2500\"). "
                f"Send \"status\" any time for an update."
            )
        message.reply(reply)
        print(f"[{conversation_id}] Handled join")
        return

    # Bid / status / question all require the sender to already be on a roster.
    found = lookup_bidder_by_email(sender)
    if not found:
        message.reply(
            "I couldn't find an auction you've joined with this email address. "
            "Send the 6-character room code from the seller first, e.g. 'join K7P2QX'."
        )
        print(f"[{conversation_id}] No joined auction found for {sender}")
        return

    auction = found["auction"]
    bidder = found["bidder"]

    if intent["type"] == "bid":
        result = place_bid_via_api(auction["id"], bidder["id"], intent["amount"])
        if "error" in result:
            reply = f"Bid not accepted: {result['error']}"
        else:
            new_auction = result.get("auction", {})
            reply = (
                f"✅ Bid accepted at {new_auction.get('topBid')} on \"{new_auction.get('title')}\".\n"
                f"You're currently in the lead."
            )
            outbid = result.get("outbid")
            if outbid:
                notify_outbid(client, outbid, new_auction.get("title", "the auction"), new_auction.get("topBid", ""))
        message.reply(reply)
        print(f"[{conversation_id}] Handled bid")
        return

    if intent["type"] == "status":
        status = get_auction_status(auction["id"])
        if not status:
            message.reply("Couldn't fetch the auction status right now — try again shortly.")
            return
        a = status["auction"]
        reply = (
            f"📊 Status for \"{a['title']}\"\n\n"
            f"Top bid: {a['topBid']}\n"
            f"Floor: {a['floor']}\n"
            f"Bidders: {a['bidders']}\n"
            f"Ends: {a['endsAt']}\n"
            f"Your last bid: {bidder.get('lastBid', '—')}"
        )
        message.reply(reply)
        print(f"[{conversation_id}] Handled status")
        return

    # Fallback: log it as a question for the operator to see in the dashboard.
    post_question_via_api(bidder["id"], text)
    reply = (
        "Got your question — I've logged it for the auction team.\n\n"
        f"Current top bid on \"{auction['title']}\" is {auction['topBid']}. "
        "Reply with \"bid <amount>\" any time to jump back in."
    )
    message.reply(reply)
    print(f"[{conversation_id}] Handled question")


def main():
    """
    Initialize Caspian client and start listening for emails
    """
    global EMAIL_CONNECTION_ID

    print("Starting Caspian Email Service for Auction Agent...")
    print(f"Mailbox: {CASPIAN_MAILBOX}")
    print(f"Next.js API: {NEXTJS_API_URL}")

    # Initialize Caspian client
    client = CommClient()

    # Connect to email
    print("Connecting to email service...")
    email = client.connect_email(username=CASPIAN_MAILBOX)
    EMAIL_CONNECTION_ID = email.get("id")
    print(f"✅ Agent email address: {email['address']}")
    print(f"   Send emails to this address to join auctions, bid, or check status!")

    # Register message handler (bound to the client so it can send outbid notices)
    client.on_message(lambda message: handle_message(message, client))

    # Start listening (blocking call)
    print("🎧 Listening for incoming emails...")
    try:
        client.listen()
    except KeyboardInterrupt:
        print("\n⏹️  Shutting down...")
    except Exception as e:
        print(f"❌ Error: {e}")
        raise


if __name__ == "__main__":
    main()
