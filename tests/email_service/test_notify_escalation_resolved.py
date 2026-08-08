"""
Unit tests for notify_escalation_resolved() in email-service/handler.py.

Run with:
    cd auction-agent-dashboard
    python -m pytest tests/email_service/test_notify_escalation_resolved.py -v

No actual network calls are made — CommClient and HTTP requests are mocked.
"""

import sys
import os
import unittest
from unittest.mock import MagicMock, patch

# Ensure the email-service directory is on the path so we can import handler
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../email-service"))

# The handler module imports caspian_sdk and dotenv at import time. Mock them
# before the import so they don't need to be installed in the test env.
sys.modules.setdefault("caspian_sdk", MagicMock())
sys.modules.setdefault("flask", MagicMock())
sys.modules.setdefault("dotenv", MagicMock())
sys.modules.setdefault("dotenv.load_dotenv", MagicMock())

# Provide a dummy API key so the module-level check doesn't raise
os.environ.setdefault("CASPIAN_API_KEY", "test-key")
os.environ.setdefault("NEXTJS_API_URL", "http://localhost:3000")
os.environ.setdefault("EMAIL_WEBHOOK_PORT", "3001")

import handler  # noqa: E402  (import after sys.path setup)


class TestNotifyEscalationResolved(unittest.TestCase):
    """Tests for handler.notify_escalation_resolved()."""

    def _make_client(self) -> MagicMock:
        """Return a mock CommClient with an initiate() spy."""
        client = MagicMock()
        client.initiate = MagicMock()
        return client

    def _patch_bidder(self, bidder: dict | None):
        """Context manager that patches fetch_bidder_by_id to return bidder."""
        return patch.object(handler, "fetch_bidder_by_id", return_value=bidder)

    def _set_connection_id(self, value: str | None):
        """Directly set the module-level EMAIL_CONNECTION_ID."""
        handler.EMAIL_CONNECTION_ID = value

    # ── Happy path ────────────────────────────────────────────────────────────

    def test_sends_email_for_email_bidder(self):
        """Resolving with a note sends via client.initiate for Email bidder."""
        client = self._make_client()
        self._set_connection_id("conn-123")
        bidder = {"id": "bd-1", "name": "Maya Chen", "connection": "Email", "email": "maya@example.com"}

        with self._patch_bidder(bidder):
            handler.notify_escalation_resolved(client, "bd-1", "Your bid was approved.")

        client.initiate.assert_called_once_with(
            "conn-123",
            "maya@example.com",
            "Your bid was approved.",
        )

    def test_note_is_stripped_before_send(self):
        """Leading/trailing whitespace is stripped from the note."""
        client = self._make_client()
        self._set_connection_id("conn-123")
        bidder = {"id": "bd-1", "name": "Maya", "connection": "Email", "email": "maya@example.com"}

        with self._patch_bidder(bidder):
            handler.notify_escalation_resolved(client, "bd-1", "  Reserve met.  ")

        _, _, sent_text = client.initiate.call_args.args
        assert sent_text == "Reserve met."

    # ── No-ops that must NOT call initiate ────────────────────────────────────

    def test_skips_web_chat_bidder(self):
        """Bidder with connection='Web chat' does not get an email."""
        client = self._make_client()
        self._set_connection_id("conn-123")
        bidder = {"id": "bd-2", "name": "Jon Bell", "connection": "Web chat", "email": None}

        with self._patch_bidder(bidder):
            handler.notify_escalation_resolved(client, "bd-2", "Note for web chat bidder.")

        client.initiate.assert_not_called()

    def test_skips_when_bidder_not_found(self):
        """If the bidder lookup returns None, initiate is not called."""
        client = self._make_client()
        self._set_connection_id("conn-123")

        with self._patch_bidder(None):
            handler.notify_escalation_resolved(client, "bd-ghost", "Some note.")

        client.initiate.assert_not_called()

    def test_skips_when_note_is_empty(self):
        """Empty note — nothing to send."""
        client = self._make_client()
        self._set_connection_id("conn-123")
        bidder = {"id": "bd-3", "name": "Ali Hassan", "connection": "Email", "email": "ali@example.com"}

        with self._patch_bidder(bidder):
            handler.notify_escalation_resolved(client, "bd-3", "")

        client.initiate.assert_not_called()

    def test_skips_when_note_is_whitespace_only(self):
        """Whitespace-only note is treated as empty — nothing to send."""
        client = self._make_client()
        self._set_connection_id("conn-123")
        bidder = {"id": "bd-4", "name": "Ali Hassan", "connection": "Email", "email": "ali@example.com"}

        with self._patch_bidder(bidder):
            handler.notify_escalation_resolved(client, "bd-4", "   ")

        client.initiate.assert_not_called()

    def test_skips_when_no_email_address(self):
        """Email bidder whose email field is None is silently skipped."""
        client = self._make_client()
        self._set_connection_id("conn-123")
        bidder = {"id": "bd-5", "name": "No Email", "connection": "Email", "email": None}

        with self._patch_bidder(bidder):
            handler.notify_escalation_resolved(client, "bd-5", "Important note.")

        client.initiate.assert_not_called()

    def test_skips_when_connection_id_not_set(self):
        """If EMAIL_CONNECTION_ID is None (startup failed), skip silently."""
        client = self._make_client()
        self._set_connection_id(None)
        bidder = {"id": "bd-6", "name": "Rae Okafor", "connection": "Email", "email": "rae@example.com"}

        with self._patch_bidder(bidder):
            handler.notify_escalation_resolved(client, "bd-6", "Should not send.")

        client.initiate.assert_not_called()

    # ── Error resilience ──────────────────────────────────────────────────────

    def test_does_not_raise_when_initiate_throws(self):
        """initiate() failure is caught and logged, never re-raised."""
        client = self._make_client()
        client.initiate.side_effect = RuntimeError("SDK connection dropped")
        self._set_connection_id("conn-123")
        bidder = {"id": "bd-7", "name": "Rae Okafor", "connection": "Email", "email": "rae@example.com"}

        with self._patch_bidder(bidder):
            # Must not raise
            handler.notify_escalation_resolved(client, "bd-7", "Should try but not crash.")

        client.initiate.assert_called_once()


if __name__ == "__main__":
    unittest.main()
