#!/usr/bin/env python3
"""
Caspian Email Service for Auction Agent
Handles incoming emails and joins bidders to auctions via the Next.js API
"""

import os
import re
import json
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

def parse_join_command(text: str) -> dict:
    """
    Parse email body to extract auction join information.
    Supports formats:
    - "/join K7P2QX"
    - "join K7P2QX"
    - "K7P2QX"
    """
    text = text.strip().lower()
    
    # Try to extract a 6-character alphanumeric code
    code_match = re.search(r'([a-z0-9]{6})', text)
    if code_match:
        return {"code": code_match.group(1).upper()}
    
    return None

def join_auction_via_api(code: str, name: str, handle: str, connection: str = "Email") -> dict:
    """
    Call the Next.js API to join the auction
    """
    try:
        response = requests.post(
            f"{NEXTJS_API_URL}/api/auctions/join",
            json={
                "code": code,
                "name": name,
                "handle": handle,
                "connection": connection
            },
            timeout=10
        )
        
        if response.status_code == 201:
            return response.json()
        else:
            return {"error": response.json().get("error", "Failed to join auction")}
    except Exception as e:
        return {"error": f"API request failed: {str(e)}"}

def handle_message(message):
    """
    Handle incoming email messages
    """
    # Handle sender being either a string or dict
    sender = message.sender
    if isinstance(sender, dict):
        sender = sender.get('address', 'unknown@example.com')
    
    text = message.text
    conversation_id = message.conversation_id
    
    print(f"[{conversation_id}] Received email from {sender}: {text[:100]}...")
    
    # Extract name from sender email (use the part before @ as default handle)
    email_handle = sender.split('@')[0]
    display_name = email_handle.replace('.', ' ').title()
    
    # Parse the join command
    parsed = parse_join_command(text)
    
    if not parsed:
        reply = (
            "I couldn't find an auction code in your email. "
            "Please include a 6-character code like 'K7P2QX'. "
            "You can send it as:\n"
            "- '/join K7P2QX'\n"
            "- 'join K7P2QX'\n"
            "- Just the code: 'K7P2QX'"
        )
        message.reply(reply)
        print(f"[{conversation_id}] No code found, sent help message")
        return
    
    code = parsed["code"]
    print(f"[{conversation_id}] Extracted code: {code}")
    
    # Join the auction via API
    result = join_auction_via_api(code, display_name, email_handle, "Email")
    
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
            f"You'll receive updates via email. Good luck!"
        )
    
    message.reply(reply)
    print(f"[{conversation_id}] Sent reply: {reply[:100]}...")

def main():
    """
    Initialize Caspian client and start listening for emails
    """
    print("Starting Caspian Email Service for Auction Agent...")
    print(f"Mailbox: {CASPIAN_MAILBOX}")
    print(f"Next.js API: {NEXTJS_API_URL}")
    
    # Initialize Caspian client
    client = CommClient()
    
    # Connect to email
    print("Connecting to email service...")
    email = client.connect_email(username=CASPIAN_MAILBOX)
    print(f"✅ Agent email address: {email['address']}")
    print(f"   Send emails to this address to join auctions!")
    
    # Register message handler
    client.on_message(handle_message)
    
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
