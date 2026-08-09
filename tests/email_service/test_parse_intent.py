"""
Unit tests for parse_intent() and strip_quoted_reply() in email-service/handler.py.

parse_intent() used to also try to regex-extract a bid amount, which meant
any phrasing outside its pattern (conditional bids, negation, etc.) silently
fell through to "question" and never reached the LLM classifier. It now only
routes join/status/agent — bid vs. question judgment moved to the LLM via
classify_and_respond_via_api(). These tests lock in that routing contract.

Run with:
    cd auction-agent-dashboard
    python -m pytest tests/email_service/test_parse_intent.py -v
"""

import sys
import os
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../email-service"))

sys.modules.setdefault("caspian_sdk", MagicMock())
sys.modules.setdefault("flask", MagicMock())
sys.modules.setdefault("dotenv", MagicMock())
sys.modules.setdefault("dotenv.load_dotenv", MagicMock())

os.environ.setdefault("CASPIAN_API_KEY", "test-key")
os.environ.setdefault("NEXTJS_API_URL", "http://localhost:3000")
os.environ.setdefault("EMAIL_WEBHOOK_PORT", "3001")

import handler  # noqa: E402


class TestParseIntentJoin(unittest.TestCase):
    def test_join_with_keyword(self):
        self.assertEqual(handler.parse_intent("join K7P2QX"), {"type": "join", "code": "K7P2QX"})

    def test_join_with_slash(self):
        result = handler.parse_intent("/join k7p2qx")
        self.assertEqual(result, {"type": "join", "code": "K7P2QX"})

    def test_bare_six_char_code(self):
        result = handler.parse_intent("k7p2qx")
        self.assertEqual(result, {"type": "join", "code": "K7P2QX"})

    def test_bare_code_with_whitespace(self):
        result = handler.parse_intent("  K7P2QX  \n")
        self.assertEqual(result, {"type": "join", "code": "K7P2QX"})


class TestParseIntentStatus(unittest.TestCase):
    def test_status_keyword(self):
        self.assertEqual(handler.parse_intent("status"), {"type": "status"})

    def test_status_with_punctuation(self):
        self.assertEqual(handler.parse_intent("status?"), {"type": "status"})

    def test_update_keyword(self):
        self.assertEqual(handler.parse_intent("update"), {"type": "status"})

    def test_hows_it_going(self):
        self.assertEqual(handler.parse_intent("how's it going"), {"type": "status"})
        self.assertEqual(handler.parse_intent("hows it going"), {"type": "status"})


class TestParseIntentAgentFallthrough(unittest.TestCase):
    """
    Anything that isn't a clean join code or status check must route to
    "agent" — this is the regression guard for the original bug. Bid amounts
    are NOT extracted here anymore; they're extracted by the LLM classifier.
    """

    def test_plain_bid_number_routes_to_agent_not_amount_extraction(self):
        result = handler.parse_intent("bid 2500")
        self.assertEqual(result["type"], "agent")
        self.assertNotIn("amount", result)

    def test_dollar_amount_routes_to_agent(self):
        result = handler.parse_intent("$2,500")
        self.assertEqual(result["type"], "agent")

    def test_conditional_bid_routes_to_agent(self):
        result = handler.parse_intent("I could go to 60 if it ships by Friday")
        self.assertEqual(result["type"], "agent")

    def test_ambiguous_relative_bid_routes_to_agent(self):
        result = handler.parse_intent("I'll match whoever's ahead, within reason")
        self.assertEqual(result["type"], "agent")

    def test_plain_question_routes_to_agent(self):
        result = handler.parse_intent("What's the highest bid rn?")
        self.assertEqual(result["type"], "agent")

    def test_agent_result_carries_original_text(self):
        result = handler.parse_intent("  put me down for 55, final  ")
        self.assertEqual(result, {"type": "agent", "text": "put me down for 55, final"})


class TestStripQuotedReply(unittest.TestCase):
    def test_no_quote_returns_unchanged(self):
        text = "bid 100"
        self.assertEqual(handler.strip_quoted_reply(text), "bid 100")

    def test_strips_gt_prefixed_quote_block(self):
        text = "bid 100\n\n> On Mon, Jan 1 wrote:\n> bid 50"
        self.assertEqual(handler.strip_quoted_reply(text), "bid 100")

    def test_strips_on_wrote_header(self):
        text = "actually make it 120\n\nOn Tue, Aug 5, 2026 at 3:00 PM Jane <jane@example.com> wrote:\nbid 100"
        self.assertEqual(handler.strip_quoted_reply(text), "actually make it 120")

    def test_leaves_text_without_quote_markers_alone(self):
        text = "I could go to 60 if it ships by Friday, let me know"
        self.assertEqual(handler.strip_quoted_reply(text), text)


if __name__ == "__main__":
    unittest.main()
