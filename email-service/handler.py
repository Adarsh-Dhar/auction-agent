#!/usr/bin/env python3
"""
Caspian Email Service for Auction Agent
Handles incoming emails and routes them to auction actions via the Next.js
API: joining, checking status, and — for everything else, including bids —
handing raw text to the same LLM classifier the web chat channel uses (see
classify_and_respond_via_api). This keeps bid/question judgment consistent
across channels instead of relying on a local regex that could silently
misroute ambiguous or conditional bids. Also sends a best-effort outbid
notification when someone is bid past, and dispatches escalation-resolution
notes back to bidders over email.
"""

import os
import re
import threading
import requests
from dotenv import load_dotenv
from flask import Flask, request as flask_request, jsonify
from caspian_sdk import CommClient

# Load environment variables
load_dotenv()

CASPIAN_API_KEY = os.getenv("CASPIAN_API_KEY")
CASPIAN_BASE_URL = os.getenv("CASPIAN_BASE_URL", "https://api.trycaspianai.com")
CASPIAN_MAILBOX = os.getenv("CASPIAN_MAILBOX", "bids")
NEXTJS_API_URL = os.getenv("NEXTJS_API_URL", "http://localhost:3000")
# Port the internal webhook server listens on for resolution notifications
WEBHOOK_PORT = int(os.getenv("EMAIL_WEBHOOK_PORT", "3001"))

if not CASPIAN_API_KEY:
    raise ValueError("CASPIAN_API_KEY environment variable is required")

# Set once in main() after connect_email(); used to send outbid notifications
# that aren't a reply to an inbound message.
EMAIL_CONNECTION_ID = None

# CommClient instance — set in main() so webhook handler can use it.
_client: CommClient | None = None


def strip_quoted_reply(text: str) -> str:
    """
    Cut off quoted history from an email reply so an old bid/question in a
    thread doesn't get re-matched alongside the new message.

    Stops at the first line that looks like a quote marker ("> ...") or a
    client-generated "On ... wrote:" header. If neither is found, the text
    is returned unchanged.
    """
    lines = text.splitlines()
    for i, line in enumerate(lines):
        stripped_line = line.strip()
        if stripped_line.startswith(">"):
            return "\n".join(lines[:i]).strip()
        if re.match(r'^On .{0,120} wrote:\s*$', stripped_line):
            return "\n".join(lines[:i]).strip()
    return text.strip()


def parse_intent(text: str) -> dict:
    """
    Route an inbound email body to one of: join, status, or "agent" (bid or
    question — anything that needs real judgment).

    This function ONLY does cheap, unambiguous routing. It deliberately does
    NOT try to extract a bid amount via regex anymore — that used to mean a
    conditional/negated/ambiguous bid sent by email ("I could go to 60 if it
    ships by Friday") would silently miss the regex and get misrouted as a
    plain question, bypassing the LLM classifier entirely. Now, anything
    that isn't clearly a join code or a status check is handed to the LLM
    classifier via classify_and_respond(), the same as the web chat channel.

    Formats recognized:
    - join:   "/join K7P2QX", "join K7P2QX", or a bare 6-char code "K7P2QX"
    - status: "status", "update", "how's it going"
    - anything else → "agent" (bid or question; the LLM decides which)
    """
    stripped = text.strip()
    lowered = stripped.lower()

    join_match = re.search(r'\bjoin\s+([a-z0-9]{4,8})\b', lowered)
    if join_match:
        return {"type": "join", "code": join_match.group(1).upper()}

    # Check status keywords BEFORE the bare 6-char join-code fallback below —
    # "status" and "update" are themselves exactly 6 characters, so without
    # this ordering they'd incorrectly match as a join code (pre-existing
    # bug, caught by tests/email_service/test_parse_intent.py).
    if lowered.strip("?! ") in ("status", "update", "how's it going", "hows it going"):
        return {"type": "status"}

    if re.fullmatch(r'[a-z0-9]{6}', lowered):
        return {"type": "join", "code": lowered.upper()}

    return {"type": "agent", "text": stripped}


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


def classify_and_respond_via_api(auction_id: str, bidder_id: str, raw_message: str) -> dict:
    """
    Send the bidder's raw text to the SAME LLM classification path the web
    chat channel uses — POST /api/auctions/:auctionId/bid with `rawMessage` 
    and no `amount`. This is deliberate: sending a pre-extracted amount
    (the old behaviour) skips classify.ts entirely, so conditional bids,
    negation, and ambiguous phrasing never got judged, they just silently
    misfired. Passing raw text keeps email and web chat at parity.

    Returns the raw JSON body plus an HTTP status-derived `outcome` field:
      - "placed"        → 200, no needsEscalation/needsClarification flags, bid went through
      - "escalated"      → 202, classification.decision was "escalate" or low-confidence
      - "clarify"        → 200, classification.decision was "clarify"
      - "not_a_bid"      → 200, classification ran but this wasn't a bid (log as question)
      - "error"          → request failed or non-2xx status
    """
    try:
        response = requests.post(
            f"{NEXTJS_API_URL}/api/auctions/{auction_id}/bid",
            json={"bidderId": bidder_id, "rawMessage": raw_message},
            timeout=15,
        )
    except Exception as e:
        return {"outcome": "error", "error": f"API request failed: {str(e)}"}

    try:
        body = response.json()
    except Exception:
        body = {}

    if response.status_code == 202 and body.get("needsEscalation"):
        return {**body, "outcome": "escalated"}
    if response.status_code == 200 and body.get("needsClarification"):
        return {**body, "outcome": "clarify"}
    if response.status_code == 200 and "classification" in body and "auction" not in body:
        # Classifier ran but didn't produce a placed bid (e.g. kind != "bid")
        return {**body, "outcome": "not_a_bid"}
    if response.status_code == 200 and "auction" in body:
        return {**body, "outcome": "placed"}

    return {**body, "outcome": "error", "error": body.get("error", "Failed to process message")}


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
    """
    Log plain text to the bidder's message thread with no classification.
    Used only as a last-resort fallback if classify_and_respond_via_api()
    itself fails to reach the API (outcome == "error") — NOT used for normal
    question routing anymore, since classify_and_respond_via_api() already
    runs everything through the LLM classifier first.
    """
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


def fetch_bidder_by_id(bidder_id: str) -> dict | None:
    """Look up a bidder record from the Next.js API by their internal ID."""
    try:
        response = requests.get(
            f"{NEXTJS_API_URL}/api/bidders/{bidder_id}",
            timeout=10,
        )
        if response.status_code == 200:
            return response.json().get("bidder")
        return None
    except Exception as e:
        print(f"Bidder lookup failed for {bidder_id}: {e}")
        return None


def notify_escalation_resolved(client: CommClient, bidder_id: str, note: str):
    """
    Send the operator's resolution note to the bidder via email.

    Only fires when:
    - bidder.connection == "Email"  (the bidder joined via the email channel)
    - bidder.email is set           (we have a real address to send to)
    - EMAIL_CONNECTION_ID is set    (the email connection is active)
    - note is non-empty             (there is something to say)

    Uses client.initiate() — a cold outbound message, same pattern as
    notify_outbid(). Telegram / WhatsApp are not yet supported and are
    silently skipped until those channel handlers are built.

    Best-effort: exceptions are logged, never re-raised, so a send failure
    never blocks the operator's resolve action from completing.
    """
    if not note or not note.strip():
        return

    bidder = fetch_bidder_by_id(bidder_id)
    if not bidder:
        print(f"notify_escalation_resolved: bidder {bidder_id} not found, skipping")
        return

    connection = bidder.get("connection", "")
    if connection != "Email":
        # Telegram / WhatsApp channels are not yet implemented — skip silently.
        print(f"notify_escalation_resolved: bidder {bidder_id} uses '{connection}', not email — skipping")
        return

    address = bidder.get("email")
    if not address or not EMAIL_CONNECTION_ID:
        print(f"notify_escalation_resolved: no email address or connection id for {bidder_id}, skipping")
        return

    try:
        client.initiate(EMAIL_CONNECTION_ID, address, note.strip())
        print(f"Sent resolution notice to {address} for bidder {bidder_id}")
    except Exception as e:
        print(f"Could not send resolution notice to {address}: {e}")


def handle_message(message, client: CommClient):
    """
    Handle incoming email messages: join / status / agent (bid or question).

    Quoted reply history is stripped first so an old bid/question further
    down a thread doesn't get re-classified alongside the new message.
    """
    sender = message.sender
    if isinstance(sender, dict):
        sender = sender.get('address', 'unknown@example.com')

    text = strip_quoted_reply(message.text)
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

    # Everything else (a bid in any phrasing, a genuine question, an
    # ambiguous/conditional message) goes through the SAME LLM classifier
    # the web chat channel uses. This is what item #1 in the audit fixed:
    # previously a regex tried to extract a bid amount here, so anything
    # phrased outside its pattern ("I could go to 60 if it ships by Friday")
    # silently fell through to "question" and never got real judgment.
    assert intent["type"] == "agent"
    result = classify_and_respond_via_api(auction["id"], bidder["id"], text)
    outcome = result.get("outcome")

    if outcome == "placed":
        new_auction = result.get("auction", {})
        reply = (
            f"✅ Bid accepted at {new_auction.get('topBid')} on \"{new_auction.get('title')}\".\n"
            f"You're currently in the lead."
        )
        outbid = result.get("outbid")
        if outbid:
            notify_outbid(client, outbid, new_auction.get("title", "the auction"), new_auction.get("topBid", ""))
        message.reply(reply)
        print(f"[{conversation_id}] Handled bid (classified)")
        return

    if outcome == "escalated":
        reply = (
            "Thanks — that one needs a human to weigh in. I've flagged it for "
            "the auction team and they'll follow up shortly.\n\n"
            f"Current top bid on \"{auction['title']}\" is {auction['topBid']}."
        )
        message.reply(reply)
        print(f"[{conversation_id}] Handled bid (escalated)")
        return

    if outcome == "clarify":
        question = result.get("question") or "Could you clarify your offer?"
        message.reply(question)
        print(f"[{conversation_id}] Handled bid (needs clarification)")
        return

    if outcome == "not_a_bid":
        # Classifier ran and determined this wasn't a bid attempt — log it
        # as a question for the operator, same as before, but now it's a
        # judgment call made by the LLM rather than "didn't match a regex."
        post_question_via_api(bidder["id"], text)
        reply = (
            "Got your question — I've logged it for the auction team.\n\n"
            f"Current top bid on \"{auction['title']}\" is {auction['topBid']}. "
            "Reply any time to jump back in."
        )
        message.reply(reply)
        print(f"[{conversation_id}] Handled question (classified)")
        return

    # outcome == "error" — the classify/bid API call itself failed (network,
    # 5xx, etc). Fall back to logging the raw text so nothing is silently
    # dropped, and let the bidder know something went wrong rather than
    # pretending it worked.
    post_question_via_api(bidder["id"], text)
    message.reply(
        "Sorry, something went wrong processing that on our end. "
        "I've logged your message and the auction team will follow up — "
        "feel free to resend in a few minutes too."
    )
    print(f"[{conversation_id}] Error handling message: {result.get('error')}")


# ─── Internal webhook server ──────────────────────────────────────────────────
# Runs in a background daemon thread alongside client.listen().
# Next.js POSTs here after an operator resolves an escalation with a note,
# so the email service can dispatch the resolution outbound via Caspian.

_webhook_app = Flask(__name__)
_webhook_app.logger.disabled = True  # suppress Flask's default access logs


@_webhook_app.route("/notify-resolved", methods=["POST"])
def handle_notify_resolved():
    """
    POST /notify-resolved  body: { "bidderId": str, "note": str }

    Called fire-and-forget by the Next.js PATCH /api/escalations/:id route.
    Looks up the bidder and dispatches via the right channel.
    Currently only email is implemented; other channels are no-ops.
    """
    global _client
    data = flask_request.get_json(silent=True) or {}
    bidder_id = data.get("bidderId", "")
    note = data.get("note", "")

    if not bidder_id or not note:
        return jsonify({"error": "bidderId and note are required"}), 400

    if _client is None:
        return jsonify({"error": "email client not initialised yet"}), 503

    notify_escalation_resolved(_client, bidder_id, note)
    return jsonify({"ok": True})


def _start_webhook_server():
    """Start the Flask webhook server in a daemon thread."""
    _webhook_app.run(host="127.0.0.1", port=WEBHOOK_PORT, use_reloader=False, threaded=True)


def main():
    """
    Initialize Caspian client and start listening for emails
    """
    global EMAIL_CONNECTION_ID, _client

    print("Starting Caspian Email Service for Auction Agent...")
    print(f"Mailbox: {CASPIAN_MAILBOX}")
    print(f"Next.js API: {NEXTJS_API_URL}")

    # Initialize Caspian client. CommClient() actually reads CASPIAN_BASE_URL
    # from the environment internally if base_url isn't passed, so this was
    # never truly "dead" — but passing it explicitly here makes that
    # relationship visible instead of relying on undocumented SDK behavior.
    client = CommClient(api_key=CASPIAN_API_KEY, base_url=CASPIAN_BASE_URL)

    # Connect to email
    print("Connecting to email service...")
    email = client.connect_email(username=CASPIAN_MAILBOX)
    EMAIL_CONNECTION_ID = email.get("id")
    _client = client
    print(f"✅ Agent email address: {email['address']}")
    print(f"   Send emails to this address to join auctions, bid, or check status!")

    # Start the internal webhook server in a daemon thread so it doesn't
    # block client.listen(). Next.js POSTs to /notify-resolved here after an
    # operator resolves an escalation with a note.
    webhook_thread = threading.Thread(target=_start_webhook_server, daemon=True)
    webhook_thread.start()
    print(f"🔔 Webhook server listening on http://127.0.0.1:{WEBHOOK_PORT}/notify-resolved")

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
