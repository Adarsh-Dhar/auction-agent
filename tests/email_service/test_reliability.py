"""
Tests for the remaining uncovered pieces of email-service/handler.py:
  - main(): CommClient construction and webhook thread startup
  - _post_with_retry / _get_with_retry: one retry on transient failure
  - _already_processed(): idempotency guard against redelivered messages
  - Updated reply copy no longer instructs a rigid "bid <amount>" syntax

Run with:
    cd auction-agent-dashboard
    python -m pytest tests/email_service/test_reliability.py -v
"""

import sys
import os
import unittest
from unittest.mock import MagicMock, patch, call

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../email-service"))

sys.modules.setdefault("caspian_sdk", MagicMock())
sys.modules.setdefault("flask", MagicMock())
sys.modules.setdefault("dotenv", MagicMock())
sys.modules.setdefault("dotenv.load_dotenv", MagicMock())

os.environ.setdefault("CASPIAN_API_KEY", "test-key")
os.environ.setdefault("NEXTJS_API_URL", "http://localhost:3000")
os.environ.setdefault("EMAIL_WEBHOOK_PORT", "3001")

import handler  # noqa: E402
import requests  # noqa: E402


# ─── main() ──────────────────────────────────────────────────────────────────

class TestMainClientConstruction(unittest.TestCase):
    def test_comm_client_constructed_with_api_key_and_base_url(self):
        mock_client_cls = MagicMock()
        mock_client_instance = mock_client_cls.return_value
        mock_client_instance.connect_email.return_value = {"id": "conn-1", "address": "bids@agent.test"}
        mock_client_instance.listen.side_effect = KeyboardInterrupt()

        with patch.object(handler, "CommClient", mock_client_cls), \
             patch.object(handler.threading, "Thread") as mock_thread_cls:
            mock_thread_instance = mock_thread_cls.return_value
            handler.main()

        mock_client_cls.assert_called_once_with(
            api_key=handler.CASPIAN_API_KEY,
            base_url=handler.CASPIAN_BASE_URL,
        )
        # Webhook server started as a daemon thread
        mock_thread_cls.assert_called_once_with(target=handler._start_webhook_server, daemon=True)
        mock_thread_instance.start.assert_called_once()

    def test_email_connection_id_and_client_set_globally(self):
        mock_client_cls = MagicMock()
        mock_client_instance = mock_client_cls.return_value
        mock_client_instance.connect_email.return_value = {"id": "conn-xyz", "address": "bids@agent.test"}
        mock_client_instance.listen.side_effect = KeyboardInterrupt()

        with patch.object(handler, "CommClient", mock_client_cls), \
             patch.object(handler.threading, "Thread"):
            handler.main()

        self.assertEqual(handler.EMAIL_CONNECTION_ID, "conn-xyz")
        self.assertIs(handler._client, mock_client_instance)


# ─── Retry helpers ───────────────────────────────────────────────────────────

class TestPostWithRetry(unittest.TestCase):
    def test_succeeds_first_try_no_retry_needed(self):
        good_response = MagicMock(status_code=200)
        with patch.object(handler.requests, "post", return_value=good_response) as mock_post:
            result = handler._post_with_retry("http://x/y", {"a": 1})
        self.assertIs(result, good_response)
        mock_post.assert_called_once()

    def test_retries_once_on_connection_error_then_succeeds(self):
        good_response = MagicMock(status_code=200)
        with patch.object(
            handler.requests, "post",
            side_effect=[requests.ConnectionError("boom"), good_response],
        ) as mock_post:
            result = handler._post_with_retry("http://x/y", {"a": 1}, retries=1)
        self.assertIs(result, good_response)
        self.assertEqual(mock_post.call_count, 2)

    def test_raises_after_exhausting_retries(self):
        with patch.object(handler.requests, "post", side_effect=requests.Timeout("timed out")):
            with self.assertRaises(requests.Timeout):
                handler._post_with_retry("http://x/y", {"a": 1}, retries=1)

    def test_does_not_retry_on_non_transient_error(self):
        """A ValueError (e.g. bad JSON) isn't a connection/timeout issue — no retry."""
        with patch.object(handler.requests, "post", side_effect=ValueError("nope")) as mock_post:
            with self.assertRaises(ValueError):
                handler._post_with_retry("http://x/y", {"a": 1}, retries=1)
        mock_post.assert_called_once()


class TestGetWithRetry(unittest.TestCase):
    def test_retries_once_on_timeout_then_succeeds(self):
        good_response = MagicMock(status_code=200)
        with patch.object(
            handler.requests, "get",
            side_effect=[requests.Timeout("slow"), good_response],
        ) as mock_get:
            result = handler._get_with_retry("http://x/y", retries=1)
        self.assertIs(result, good_response)
        self.assertEqual(mock_get.call_count, 2)


# ─── Idempotency guard ───────────────────────────────────────────────────────

class TestAlreadyProcessed(unittest.TestCase):
    def setUp(self):
        handler._seen_message_ids.clear()

    def test_first_seen_returns_false(self):
        self.assertFalse(handler._already_processed("msg-1"))

    def test_second_seen_returns_true(self):
        handler._already_processed("msg-1")
        self.assertTrue(handler._already_processed("msg-1"))

    def test_missing_id_never_blocks(self):
        self.assertFalse(handler._already_processed(None))
        self.assertFalse(handler._already_processed(None))
        self.assertFalse(handler._already_processed(""))

    def test_bounded_eviction(self):
        handler._SEEN_MESSAGE_IDS_MAX_ORIG = handler._SEEN_MESSAGE_IDS_MAX
        try:
            handler._seen_message_ids.clear()
            # Fill past the cap and confirm the oldest gets evicted
            cap = 5
            with patch.object(handler, "_SEEN_MESSAGE_IDS_MAX", cap):
                for i in range(cap + 2):
                    handler._already_processed(f"msg-{i}")
                self.assertLessEqual(len(handler._seen_message_ids), cap)
                # The earliest messages should have been evicted
                self.assertNotIn("msg-0", handler._seen_message_ids)
        finally:
            handler._seen_message_ids.clear()

    def test_handle_message_skips_duplicate_delivery(self):
        message = MagicMock()
        message.id = "dup-1"
        message.sender = "maya@example.com"
        message.text = "bid 100"
        message.conversation_id = "conv-1"
        message.reply = MagicMock()

        with patch.object(handler, "lookup_bidder_by_email") as mock_lookup:
            handler._already_processed("dup-1")  # simulate first delivery already processed
            handler.handle_message(message, MagicMock())

        mock_lookup.assert_not_called()
        message.reply.assert_not_called()


# ─── Reply copy no longer prescribes rigid syntax ────────────────────────────

class TestReplyCopyReflectsNaturalLanguage(unittest.TestCase):
    def test_join_confirmation_does_not_prescribe_rigid_bid_syntax(self):
        message = MagicMock()
        message.id = "join-msg-1"
        message.sender = "new.bidder@example.com"
        message.text = "join K7P2QX"
        message.conversation_id = "conv-join"
        message.reply = MagicMock()

        join_result = {
            "auction": {"title": "Vintage Lamp"},
            "bidder": {"handle": "new.bidder", "id": "bd-99"},
        }
        with patch.object(handler, "join_auction_via_api", return_value=join_result):
            handler.handle_message(message, MagicMock())

        reply_text = message.reply.call_args.args[0]
        self.assertNotIn('"bid <amount>"', reply_text)

    def test_outbid_notice_does_not_prescribe_rigid_bid_syntax(self):
        client = MagicMock()
        handler.EMAIL_CONNECTION_ID = "conn-1"
        handler.notify_outbid(client, {"email": "prior@example.com"}, "Vintage Lamp", "150")
        sent_text = client.initiate.call_args.args[2]
        self.assertNotIn('"bid <amount>"', sent_text)


if __name__ == "__main__":
    unittest.main()
