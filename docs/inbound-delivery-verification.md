# Caspian Inbound Delivery — Live Verification Checklist

## Why this document exists

Everything in `email-service/handler.py` is unit-tested (56 tests, `python -m
pytest tests/email_service/ -v`), but unit tests mock `CommClient` and
`requests` — they prove the *logic* is correct given a certain input, not
that a real email sent to a real Caspian mailbox actually reaches that logic
and comes back out the other side. This checklist is the difference between
those two claims. "Caspian inbound delivery" only moves from unverified to
verified once every row below has a ✅ and an attached artifact.

Nothing in code changes as a result of this document. It is a runbook +
evidence template for a manual pass against live infrastructure.

---

## Prerequisites

- [ ] `CASPIAN_API_KEY` in `.env` is a real key (sandbox is acceptable —
      note in your write-up whether it was sandbox or production).
- [ ] `OPENAI_API_KEY` is set — the classifier needs this for every row
      below except the pure join/status checks.
- [ ] `NEXTJS_API_URL` in `.env` points somewhere the email service can
      actually reach. If running everything on one machine, the default
      `http://localhost:3000` is fine. If Caspian's webhook needs to reach
      your machine from the outside (check their docs — some setups are
      poll-based via `client.listen()` and don't need inbound webhook
      exposure, others do), you may need `ngrok` or similar.
- [ ] `npm run dev` is running (Next.js + Prisma/SQLite).
- [ ] `npm run email-service` is running in a separate terminal, and its
      startup log printed a real address:
      ```
      ✅ Agent email address: <something>@<caspian-domain>
      ```
      If this line doesn't appear, stop here — nothing below will work
      until the Caspian connection itself is established. Screenshot this
      line; it's your first piece of evidence (Row 0 below).
- [ ] A real external mailbox you can send from (Gmail, Outlook, etc.) —
      not the Caspian test-email API. The test-email API is a useful smoke
      check but is Caspian's synthetic path, not proof of real delivery.
      Use it first if you want a cheap sanity check, but don't stop there:
      ```bash
      curl -s -X POST https://api.trycaspianai.com/v1/test-emails \
        -H "Authorization: Bearer $CASPIAN_API_KEY" \
        -H 'Content-Type: application/json' \
        -d '{"text":"join K7P2QX"}'
      ```
- [ ] An active auction with a known join code and a floor price low
      enough that a couple of test bids can clear it.
- [ ] The dashboard (`/escalations`, a bidder's message drawer) open in a
      browser tab so you can visually confirm state changes as you go.

---

## Test matrix

Run these **in order** — several rows depend on state created by an
earlier row (e.g. you need to have joined before you can bid). For each
row, capture: (a) the email you sent, (b) the reply you received, (c) the
matching terminal log line(s) from the email service, and (d) where noted,
a dashboard screenshot.

| # | Send this (from a real external inbox) | What it proves | Evidence to capture |
|---|---|---|---|
| 0 | *(setup only)* | Caspian mailbox connection actually established | Screenshot of `✅ Agent email address: ...` |
| 1 | `join <your-code>` | Join flow: email → Caspian → handler → `/api/auctions/join` → reply | Reply email + terminal log `[...] Handled join` |
| 2 | `status` | Status round-trip after joining | Reply email showing current top bid/floor/etc |
| 3 | `bid 500` (or any amount that clears your floor) | Clean bid via the LLM classifier reaches `placeBid` and confirms | Reply email `✅ Bid accepted...` + dashboard bidder shows updated `lastBid` |
| 4 | `I could go to 60 if it ships by Friday` (or any genuinely conditional phrasing above your floor) | Escalation path — the exact bug the LLM-routing patch fixed. A regex would've silently miscategorized this as a question | Reply email says it's been flagged + **dashboard `/escalations` shows a new open item** |
| 5 | Something ambiguous enough to trigger clarification (e.g. a bare number with no context, if your classifier's prompt treats that as unclear) | Clarify path returns a real question, not a canned error | Reply email containing an actual clarifying question |
| 6 | From a **second** real inbox, send a bid that beats #3's amount | Outbid notice reaches bidder #1 **unprompted** (via `client.initiate`, not a reply to their message) | New unprompted email in inbox #1 |
| 7 | From the dashboard, resolve #4's escalation with a resolution note | The full escalation → resolve → notify loop reaches a real inbox, not just the in-app Message table | New unprompted email in the inbox that sent #4, containing your note |
| 8 | Reply to any earlier thread (so your email client includes quoted history below your new text) | `strip_quoted_reply` works against real Gmail/Outlook quoting conventions, not just the synthetic text used in unit tests | Reply email confirms only your new line was processed |
| 9 | Resend an identical email (use your client's "resend" or just copy/paste the same text+subject as an earlier row) | Idempotency guard (`_already_processed`) prevents a duplicate bid/escalation from being created twice | Dashboard shows no duplicate entry; terminal log shows `Duplicate delivery of message ... — skipping` |

---

## Things to specifically watch for that unit tests cannot catch

These are real-world conditions the mocked tests can't simulate — note
anything unexpected here even if it doesn't break the flow:

- [ ] **HTML-only emails.** Some clients send HTML with no plain-text
      alternative. Confirm `message.text` isn't empty/`None` when this
      happens — if it is, `parse_intent("")` / `strip_quoted_reply("")` 
      need a look.
- [ ] **Signature blocks.** A real signature ("Sent from my iPhone", a
      name + title block) sitting below your message — does it get fed
      into the classifier as noise, and does that change the
      classification outcome?
- [ ] **Non-ASCII / emoji** in subject or body — does anything break on
      encoding?
- [ ] **Real end-to-end latency.** Real Caspian round-trip + real OpenAI
      call stacked together — does the reply consistently arrive well
      under the 15s timeout used in `_post_with_retry`, or does this need
      raising?
- [ ] **Quoting format variance.** Gmail, Outlook, and Apple Mail all
      quote replies slightly differently. Row 8 only proves one client's
      format — if you have access to more than one, worth trying.

---

## Sign-off

This item can be marked done once:

- [ ] Rows 0–9 are all ✅ with evidence attached (screenshots / log
      excerpts / a short screen recording — whatever fits your bounty
      submission format).
- [ ] Any surprises from the "watch for" section above are either
      resolved or explicitly noted as a known follow-up.
- [ ] The evidence is linked from wherever your submission write-up lives
      (README, bounty submission doc, etc.) — an unlinked screenshot in a
      folder doesn't count as verified for someone reviewing the
      submission.

**Until this checklist is fully checked off, keep reporting this item as
unverified** — the code being correct (which the 56 unit tests do prove)
is a different claim from the channel being proven end-to-end.
