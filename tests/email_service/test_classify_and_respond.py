"""
Unit tests for classify_and_respond_via_api() in email-service/handler.py.

This function replaced place_bid_via_api() as the entry point for anything
that isn't a join/status message. It sends `rawMessage` (not a pre-extracted
`amount`) to POST /api/auctions/:auctionId/bid, so the same LLM classifier
the web chat channel uses also judges email messages. These tests mock the
four response shapes the Next.js route can return and assert each maps to
the right `outcome`.

Run with:
    cd auction-agent-dashboard
    python -m pytest tests/email_service/test_classify_and_respond.py -v
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


def _mock_response(status_code: int, body: dict):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = body
    return resp


class TestClassifyAndRespondViaApi(unittest.TestCase):
    def test_sends_raw_message_not_amount(self):
        """The whole point of this function: rawMessage goes out, amount does not."""
        body = {"auction": {"topBid": "100"}, "bidder": {}, "outbid": None}
        with patch.object(handler.requests, "post", return_value=_mock_response(200, body)) as mock_post:
            handler.classify_and_respond_via_api("auc-1", "bd-1", "I could go to 60 if it ships Friday")

        _, kwargs = mock_post.call_args
        sent_json = kwargs["json"]
        self.assertEqual(sent_json["bidderId"], "bd-1")
        self.assertEqual(sent_json["rawMessage"], "I could go to 60 if it ships Friday")
        self.assertNotIn("amount", sent_json)

    def test_placed_outcome(self):
        body = {"auction": {"topBid": "150", "title": "Vintage Lamp"}, "bidder": {}, "outbid": None}
        with patch.object(handler.requests, "post", return_value=_mock_response(200, body)):
            result = handler.classify_and_respond_via_api("auc-1", "bd-1", "bid 150")
        self.assertEqual(result["outcome"], "placed")
        self.assertEqual(result["auction"]["topBid"], "150")

    def test_escalated_outcome(self):
        body = {
            "needsEscalation": True,
            "escalation": {"id": "esc-1"},
            "classification": {"decision": "escalate", "confidence": 0.3},
        }
        with patch.object(handler.requests, "post", return_value=_mock_response(202, body)):
            result = handler.classify_and_respond_via_api("auc-1", "bd-1", "I'll match whoever's ahead, within reason")
        self.assertEqual(result["outcome"], "escalated")
        self.assertEqual(result["escalation"]["id"], "esc-1")

    def test_clarify_outcome(self):
        body = {
            "needsClarification": True,
            "question": "Did you mean $60 or 60% of the reserve?",
            "classification": {"decision": "clarify"},
        }
        with patch.object(handler.requests, "post", return_value=_mock_response(200, body)):
            result = handler.classify_and_respond_via_api("auc-1", "bd-1", "60 sounds fair")
        self.assertEqual(result["outcome"], "clarify")
        self.assertIn("mean", result["question"])

    def test_not_a_bid_outcome(self):
        body = {"classification": {"kind": "question", "confidence": 0.9}}
        with patch.object(handler.requests, "post", return_value=_mock_response(200, body)):
            result = handler.classify_and_respond_via_api("auc-1", "bd-1", "what's the reserve on this?")
        self.assertEqual(result["outcome"], "not_a_bid")

    def test_error_outcome_on_non_2xx(self):
        body = {"error": "Auction is closed and no longer accepting bids."}
        with patch.object(handler.requests, "post", return_value=_mock_response(409, body)):
            result = handler.classify_and_respond_via_api("auc-1", "bd-1", "bid 500")
        self.assertEqual(result["outcome"], "error")
        self.assertIn("closed", result["error"])

    def test_error_outcome_on_request_exception(self):
        with patch.object(handler.requests, "post", side_effect=ConnectionError("boom")):
            result = handler.classify_and_respond_via_api("auc-1", "bd-1", "bid 500")
        self.assertEqual(result["outcome"], "error")
        self.assertIn("API request failed", result["error"])


if __name__ == "__main__":
    unittest.main()
