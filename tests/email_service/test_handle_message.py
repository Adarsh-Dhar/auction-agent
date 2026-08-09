"""
Regression tests for handle_message() in email-service/handler.py.

The bug this guards against: parse_intent() used to try to regex-extract a
bid amount, so a conditional/ambiguous bid ("I could go to 60 if it ships by
Friday") would miss the regex and silently fall through to being logged as a
plain question — no escalation, no LLM judgment, nothing the operator would
recognize as a bid attempt at all.

Now, parse_intent() only routes join/status; everything else (including
plain bids) goes to classify_and_respond_via_api(), which calls the same LLM
classifier the web chat channel uses. These tests mock that call and assert
handle_message() reacts correctly to each outcome — in particular, that an
"escalated" outcome does NOT get logged as a bare question.

Run with:
    cd auction-agent-dashboard
    python -m pytest tests/email_service/test_handle_message.py -v
"""

import sys
import os
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../email-service"))

sys.modules.setdefault("caspian_sdk", MagicMock())
sys.modules.setdefault("flask", MagicMock())
sys.modules.setdefault("dotenv", MagicMock())
sys.modules.setdefault("dotenv.load_dotenv", MagicMock())

os.environ.setdefault("CASPIAN_API_KEY", "test-key")
os.environ.setdefault("NEXTJS_API_URL", "http://localhost:3000")
os.environ.setdefault("EMAIL_WEBHOOK_PORT", "3001")

import handler  # noqa: E402


def _make_message(text: str, sender: str = "maya@example.com"):
    msg = MagicMock()
    msg.text = text
    msg.sender = sender
    msg.conversation_id = "conv-1"
    msg.reply = MagicMock()
    return msg


FOUND_BIDDER = {
    "auction": {"id": "auc-1", "title": "Vintage Lamp", "topBid": "100", "floor": "50", "bidders": 3, "endsAt": "soon"},
    "bidder": {"id": "bd-1", "handle": "maya", "lastBid": "80"},
}


class TestHandleMessageAgentRouting(unittest.TestCase):
    """These tests cover the "agent" branch (bid/question judgment)."""

    def setUp(self):
        self.client = MagicMock()

    def test_conditional_bid_escalates_not_logged_as_plain_question(self):
        """The core regression guard: ambiguous bid -> escalated, not silently a question."""
        message = _make_message("I could go to 60 if it ships by Friday")
        escalate_result = {
            "outcome": "escalated",
            "needsEscalation": True,
            "escalation": {"id": "esc-1"},
            "classification": {"decision": "escalate", "confidence": 0.3},
        }
        with patch.object(handler, "lookup_bidder_by_email", return_value=FOUND_BIDDER), \
             patch.object(handler, "classify_and_respond_via_api", return_value=escalate_result) as mock_classify, \
             patch.object(handler, "post_question_via_api") as mock_post_question:
            handler.handle_message(message, self.client)

        # Must have gone through the classifier with the raw text, not a regex amount
        mock_classify.assert_called_once_with("auc-1", "bd-1", "I could go to 60 if it ships by Friday")
        # Must NOT have been silently logged as a bare question
        mock_post_question.assert_not_called()
        message.reply.assert_called_once()
        self.assertIn("flagged", message.reply.call_args.args[0].lower())

    def test_clean_bid_places_and_replies_success(self):
        message = _make_message("bid 150")
        placed_result = {
            "outcome": "placed",
            "auction": {"topBid": "150", "title": "Vintage Lamp"},
            "bidder": {},
            "outbid": None,
        }
        with patch.object(handler, "lookup_bidder_by_email", return_value=FOUND_BIDDER), \
             patch.object(handler, "classify_and_respond_via_api", return_value=placed_result):
            handler.handle_message(message, self.client)

        message.reply.assert_called_once()
        self.assertIn("150", message.reply.call_args.args[0])

    def test_placed_bid_with_outbid_notifies_previous_leader(self):
        message = _make_message("bid 200")
        placed_result = {
            "outcome": "placed",
            "auction": {"topBid": "200", "title": "Vintage Lamp"},
            "bidder": {},
            "outbid": {"email": "prior@example.com"},
        }
        with patch.object(handler, "lookup_bidder_by_email", return_value=FOUND_BIDDER), \
             patch.object(handler, "classify_and_respond_via_api", return_value=placed_result), \
             patch.object(handler, "notify_outbid") as mock_notify:
            handler.handle_message(message, self.client)

        mock_notify.assert_called_once()

    def test_clarify_outcome_replies_with_question(self):
        message = _make_message("60 sounds fair")
        clarify_result = {
            "outcome": "clarify",
            "needsClarification": True,
            "question": "Did you mean $60 flat or 60% of reserve?",
        }
        with patch.object(handler, "lookup_bidder_by_email", return_value=FOUND_BIDDER), \
             patch.object(handler, "classify_and_respond_via_api", return_value=clarify_result):
            handler.handle_message(message, self.client)

        message.reply.assert_called_once_with("Did you mean $60 flat or 60% of reserve?")

    def test_not_a_bid_outcome_logs_as_question(self):
        message = _make_message("what's the reserve on this?")
        not_a_bid_result = {"outcome": "not_a_bid", "classification": {"kind": "question"}}
        with patch.object(handler, "lookup_bidder_by_email", return_value=FOUND_BIDDER), \
             patch.object(handler, "classify_and_respond_via_api", return_value=not_a_bid_result), \
             patch.object(handler, "post_question_via_api") as mock_post_question:
            handler.handle_message(message, self.client)

        mock_post_question.assert_called_once_with("bd-1", "what's the reserve on this?")
        message.reply.assert_called_once()

    def test_error_outcome_falls_back_to_logging_and_apologizes(self):
        message = _make_message("bid 500")
        error_result = {"outcome": "error", "error": "API request failed: boom"}
        with patch.object(handler, "lookup_bidder_by_email", return_value=FOUND_BIDDER), \
             patch.object(handler, "classify_and_respond_via_api", return_value=error_result), \
             patch.object(handler, "post_question_via_api") as mock_post_question:
            handler.handle_message(message, self.client)

        mock_post_question.assert_called_once()
        self.assertIn("wrong", message.reply.call_args.args[0].lower())

    def test_unjoined_sender_never_reaches_classifier(self):
        message = _make_message("bid 100", sender="stranger@example.com")
        with patch.object(handler, "lookup_bidder_by_email", return_value=None), \
             patch.object(handler, "classify_and_respond_via_api") as mock_classify:
            handler.handle_message(message, self.client)

        mock_classify.assert_not_called()
        message.reply.assert_called_once()
        self.assertIn("room code", message.reply.call_args.args[0].lower())


class TestHandleMessageQuotedReplyStripping(unittest.TestCase):
    def test_quoted_history_stripped_before_classification(self):
        text = "actually make it 120\n\n> On Mon wrote:\n> bid 100"
        message = _make_message(text)
        placed_result = {"outcome": "placed", "auction": {"topBid": "120", "title": "X"}, "bidder": {}, "outbid": None}
        with patch.object(handler, "lookup_bidder_by_email", return_value=FOUND_BIDDER), \
             patch.object(handler, "classify_and_respond_via_api", return_value=placed_result) as mock_classify:
            handler.handle_message(message, MagicMock())

        sent_text = mock_classify.call_args.args[2]
        self.assertEqual(sent_text, "actually make it 120")
        self.assertNotIn("bid 100", sent_text)


if __name__ == "__main__":
    unittest.main()
