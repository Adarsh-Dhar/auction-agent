#!/usr/bin/env python3
"""
watch_email_service.py

Runs the Caspian email service (handler.py) as a subprocess and highlights
each pipeline stage in its stdout, so a live verification pass (see
docs/inbound-delivery-verification.md) is easy to follow in real time
instead of scanning raw log output.

Every line is also written, unmodified and timestamped, to a log file under
email-service/verification-logs/ — that file is the evidence artifact to
attach to the checklist for each test-matrix row.

Usage:
    cd email-service
    python3 watch_email_service.py

    # Or point it at a different command if you're not using start.sh's
    # venv setup and just want to run handler.py directly:
    python3 watch_email_service.py --cmd "python3 handler.py"

Exits when handler.py exits (Ctrl+C stops both, same as running it directly).
"""

import argparse
import datetime
import os
import re
import subprocess
import sys

# ANSI colors — kept minimal so this still reads fine in a plain terminal
# or when the log file is opened later without color support.
COLOR_RESET = "\033[0m"
COLOR_DIM = "\033[2m"
COLOR_GREEN = "\033[32m"
COLOR_YELLOW = "\033[33m"
COLOR_RED = "\033[31m"
COLOR_CYAN = "\033[36m"
COLOR_MAGENTA = "\033[35m"

# Ordered so the first matching pattern wins. Each entry:
#   (regex, color, stage label)
# Stage labels correspond to the rows in docs/inbound-delivery-verification.md
# so it's obvious which checklist row a given log line satisfies.
STAGE_PATTERNS = [
    (r"Agent email address:", COLOR_GREEN, "[SETUP] mailbox connected"),
    (r"Webhook server listening", COLOR_GREEN, "[SETUP] webhook up (notify-resolved + notify-reminder)"),
    (r"Received email from", COLOR_CYAN, "[INBOUND] message received"),
    (r"Duplicate delivery of message .* — skipping", COLOR_YELLOW, "[IDEMPOTENCY] duplicate skipped (row 9)"),
    (r"Handled join", COLOR_GREEN, "[JOIN] (row 1)"),
    (r"Handled status", COLOR_GREEN, "[STATUS] (row 2)"),
    (r"Handled bid \(classified\)", COLOR_GREEN, "[BID PLACED] (row 3)"),
    (r"Handled bid \(escalated\)", COLOR_MAGENTA, "[ESCALATED] (row 4)"),
    (r"Handled bid \(needs clarification\)", COLOR_MAGENTA, "[CLARIFY] (row 5)"),
    (r"Sent outbid notice to", COLOR_GREEN, "[OUTBID NOTICE] (row 6)"),
    (r"Sent resolution notice to", COLOR_GREEN, "[ESCALATION RESOLVED -> NOTIFIED] (row 7)"),
    (r"Handled question \(classified\)", COLOR_CYAN, "[QUESTION LOGGED]"),
    (r"No joined auction found for", COLOR_YELLOW, "[UNJOINED SENDER]"),
    (r"Error handling message", COLOR_RED, "[ERROR]"),
    (r"Could not send", COLOR_RED, "[ERROR] notification send failed"),
    (r"Lookup failed|Status fetch failed|Bidder lookup failed", COLOR_RED, "[ERROR] API call failed"),
    (r"Transient failure calling .* retrying", COLOR_YELLOW, "[RETRY]"),
]


def highlight(line: str) -> str:
    for pattern, color, label in STAGE_PATTERNS:
        if re.search(pattern, line):
            return f"{color}{label}{COLOR_RESET} {line}"
    return f"{COLOR_DIM}{line}{COLOR_RESET}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cmd",
        default="./start.sh",
        help="Command to run the email service (default: ./start.sh)",
    )
    args = parser.parse_args()

    log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "verification-logs")
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(
        log_dir, f"verification-{datetime.datetime.now().strftime('%Y%m%d-%H%M%S')}.log"
    )

    print(f"Watching email service via: {args.cmd}")
    print(f"Raw (unhighlighted, timestamped) log will be saved to: {log_path}")
    print("Send test emails per docs/inbound-delivery-verification.md and watch below.\n")

    with open(log_path, "w") as log_file:
        process = subprocess.Popen(
            args.cmd,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
        )
        try:
            for raw_line in process.stdout:
                line = raw_line.rstrip("\n")
                timestamp = datetime.datetime.now().strftime("%H:%M:%S")
                log_file.write(f"[{timestamp}] {line}\n")
                log_file.flush()
                print(f"{COLOR_DIM}[{timestamp}]{COLOR_RESET} {highlight(line)}")
        except KeyboardInterrupt:
            print("\nStopping...")
            process.terminate()
        finally:
            process.wait()

    print(f"\nSaved evidence log: {log_path}")
    print("Attach the relevant excerpts to each row in docs/inbound-delivery-verification.md.")


if __name__ == "__main__":
    sys.exit(main())
