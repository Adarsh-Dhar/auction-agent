"use client"

import { useEffect, useState } from "react"
import { Auction, Bidder, Escalation, Message, Settlement } from "@/lib/auction-store"
import { AuctionShell } from "@/components/auction-shell"

type Props = { auctionId?: string }
const badgeClass = (value: string) => `status-badge ${value}`

export function OverviewView() {
  const [auctions, setAuctions] = useState<Auction[]>([]); const [wizard, setWizard] = useState(false)
  useEffect(() => { fetch("/api/auctions").then((r) => r.json()).then(setAuctions) }, [])
  return <AuctionShell title="Overview" eyebrow="Auction operations" action={<button className="primary-button" onClick={() => setWizard(true)}>+ New auction</button>}><div className="stats-grid"><Stat label="Live auctions" value={String(auctions.filter((a) => a.status === "live").length).padStart(2, "0")} note="Accepting bids" /><Stat label="Active bidders" value="11" note="Across 2 auctions" /><Stat label="Open escalations" value="02" note="1 high priority" /><Stat label="Pending settlement" value="01" note="Awaiting confirmation" /></div><div className="section-heading"><div><span className="eyebrow">Command board</span><h2>Your auctions</h2></div><a className="text-link" href="/auctions/live">View live auctions →</a></div><div className="market-grid">{auctions.map((auction) => <AuctionCard key={auction.id} auction={auction} />)}</div>{wizard && <NewAuctionWizard onClose={() => setWizard(false)} onCreated={(auction) => { setAuctions((items) => [auction, ...items]); setWizard(false) }} />}</AuctionShell>
}

export function LiveAuctionsView() { const [auctions, setAuctions] = useState<Auction[]>([]); useEffect(() => { fetch("/api/auctions").then((r) => r.json()).then((items: Auction[]) => setAuctions(items.filter((a) => a.status === "live"))) }, []); return <AuctionShell title="Live auctions" eyebrow="Active rooms"><div className="market-grid">{auctions.map((auction) => <AuctionCard key={auction.id} auction={auction} />)}</div></AuctionShell> }

export function AuctionDetailView({ auctionId = "AUC-1048" }: Props) {
  const [data, setData] = useState<{ auction: Auction; bidders: Bidder[] } | null>(null); const [selected, setSelected] = useState<Bidder | null>(null); const [events, setEvents] = useState<string[]>([]); const [copied, setCopied] = useState(false); const [rotating, setRotating] = useState(false)
  useEffect(() => { fetch(`/api/auctions/${auctionId}`).then((r) => r.json()).then(setData); const source = new EventSource(`/api/auctions/${auctionId}/stream`); source.onmessage = (event) => { const value = JSON.parse(event.data); if (value.type !== "heartbeat") setEvents((items) => [`${value.type} · just now`, ...items].slice(0, 8)) }; return () => source.close() }, [auctionId])
  const copyCode = async () => { if (!data) return; await navigator.clipboard?.writeText(data.auction.joinCode); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const rotateCode = async () => { setRotating(true); const response = await fetch(`/api/auctions/${auctionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rotateCode" }) }); const updated = await response.json(); setData((current) => current ? { ...current, auction: updated.auction } : current); setRotating(false) }
  if (!data) return <AuctionShell title="Loading mission control" eyebrow="Auction room"><div className="empty-state">Connecting to auction stream…</div></AuctionShell>
  return <AuctionShell title="Mission control" eyebrow={data.auction.id} action={<span className="live-indicator"><i /> Live stream connected</span>}><div className="detail-hero"><div><span className={badgeClass(data.auction.status)}>{data.auction.status}</span><h2>{data.auction.title}</h2><p>{data.auction.terms}</p></div><div className="hero-metrics"><Metric label="Top bid" value={data.auction.topBid} /><Metric label="Floor" value={data.auction.floor} /><Metric label="Ends" value="02:18:42" /></div></div><div className="join-code-bar"><div><span className="eyebrow">Room code · share to invite bidders</span><strong className="join-code-value">{data.auction.joinCode}</strong></div><div className="flex items-center gap-2"><button className="secondary-button" onClick={copyCode}>{copied ? "Copied" : "Copy code"}</button><button className="text-button" onClick={rotateCode} disabled={rotating}>{rotating ? "Rotating…" : "Rotate code"}</button></div></div><div className="mission-grid"><section className="panel"><PanelTitle label="Bidder roster" note={`${data.bidders.length} connected`} /><div className="roster-list">{data.bidders.map((bidder) => <button className="roster-row" key={bidder.id} onClick={() => setSelected(bidder)}><span className={`presence-dot ${bidder.status}`} /><span><strong>{bidder.name}</strong><small>{bidder.handle} · {bidder.connection}</small></span><b>{bidder.lastBid}</b></button>)}</div></section><section className="panel"><PanelTitle label="Activity feed" note="SSE / live" /><div className="activity-list">{events.length ? events.map((event, index) => <div className="activity-row" key={`${event}-${index}`}><span className="event-tag">LIVE</span><span>{event}</span></div>) : <div className="empty-state"><p>Waiting for live events</p><small>New bids and messages will appear here.</small></div>}</div></section><section className="panel"><PanelTitle label="Escalation queue" note="Needs review" /><div className="decision-card"><strong>Reserve exception request</strong><p>Rae Okafor asked for a reserve exception before placing a bid.</p><button className="secondary-button" onClick={() => setEvents((items) => ["escalation.resolved · just now", ...items])}>Resolve escalation</button></div><div className="decision-card"><strong>Operator controls</strong><p>Pause the room to stop new bids while you review a bidder thread.</p><button className="secondary-button">Pause auction</button></div></section></div>{selected && <BidderDrawer bidder={selected} onClose={() => setSelected(null)} />}</AuctionShell>
}

// This stands in for what happens when a bidder DMs the agent "/join CODE" on
// Telegram, WhatsApp, or email — same store function, just a web form as the channel.
export function JoinView() {
  const [form, setForm] = useState({ code: "", name: "", handle: "" })
  const [state, setState] = useState<"idle" | "loading" | "joined" | "error">("idle")
  const [error, setError] = useState("")
  const [result, setResult] = useState<{ auction: Auction; bidder: Bidder } | null>(null)
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async () => {
    setState("loading"); setError("")
    const response = await fetch("/api/auctions/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: form.code, name: form.name, handle: form.handle, connection: "Web chat" }) })
    const data = await response.json()
    if (!response.ok) { setError(data.error || "Couldn't join that auction."); setState("error"); return }
    setResult(data); setState("joined")
  }
  return <AuctionShell title="Join an auction" eyebrow="Bidder entry">
    <div className="join-panel">
      <p className="hero-copy">Got a room code from the seller? Enter it below — this mirrors sending <code>/join CODE</code> to the auction agent on chat.</p>
      {state !== "joined" ? <div className="form-stack join-form">
        <label>Room code<input value={form.code} onChange={(e) => update("code", e.target.value.toUpperCase())} placeholder="e.g. K7P2QX" maxLength={8} /></label>
        <label>Your name<input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Maya Chen" /></label>
        <label>Handle / contact<input value={form.handle} onChange={(e) => update("handle", e.target.value)} placeholder="@maya.chen or email" /></label>
        {error && <div className="policy-note" style={{ borderColor: "oklch(0.68 0.2 25 / 40%)", color: "oklch(0.75 0.18 25)" }}>{error}</div>}
        <button className="primary-button" disabled={!form.code || !form.name || !form.handle || state === "loading"} onClick={submit}>{state === "loading" ? "Joining…" : "Join auction"}</button>
      </div> : result && <div className="preview-card">
        <span className="live-indicator"><i /> You're in</span>
        <p>You've joined <strong>{result.auction.title}</strong> as {result.bidder.name}.</p>
        <small>Floor is {result.auction.floor}. Message the agent whenever you're ready to bid.</small>
      </div>}
    </div>
  </AuctionShell>
}

export function EscalationsView() { const [items, setItems] = useState<Escalation[]>([]); const [filter, setFilter] = useState("all"); useEffect(() => { fetch("/api/escalations").then((r) => r.json()).then(setItems) }, []); const update = async (item: Escalation) => { const status = item.status === "open" ? "resolved" : "open"; const response = await fetch(`/api/escalations/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); const updated = await response.json(); setItems((rows) => rows.map((row) => row.id === updated.id ? updated : row)) }; const visible = items.filter((item) => filter === "all" || item.status === filter || item.severity === filter); return <AuctionShell title="Escalations" eyebrow="Operator review"><div className="toolbar"><div className="segmented-control">{["all", "open", "resolved", "high"].map((value) => <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{value}</button>)}</div><span className="eyebrow">{visible.length} visible</span></div><div className="list-panel">{visible.map((item) => <div className="list-row" key={item.id}><div><span className={badgeClass(item.severity)}>{item.severity}</span><h3>{item.reason}</h3><p>{item.bidder} · {item.auctionId} · {item.status}</p></div><button className="secondary-button" onClick={() => update(item)}>{item.status === "open" ? "Resolve" : "Reopen"}</button></div>)}</div></AuctionShell> }
export function SettlementsView() {
  const [items, setItems] = useState<Settlement[]>([])
  const [selected, setSelected] = useState<Settlement | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const create = async () => {
    const response = await fetch("/api/settlements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auctionId: "AUC-1048", winner: "Maya Chen", amount: "2.45", asset: "SOL", wallet: "7Gf...k91Q" }) })
    const created = await response.json()
    setItems((current) => [created, ...current])
    setSelected(created)
  }
  const runAction = async (item: Settlement, action: "verify" | "confirm" | "retry") => {
    setBusy(item.id)
    const response = await fetch(`/api/settlements/${item.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })
    const updated = await response.json()
    setItems((current) => current.map((row) => row.id === updated.id ? updated : row))
    setSelected(updated)
    setBusy(null)
  }
  useEffect(() => { fetch("/api/settlements").then((r) => r.json()).then(setItems) }, [])
  return <AuctionShell title="Settlements" eyebrow="Simulated Solana ledger" action={<button className="primary-button" onClick={create}>Create payment request</button>}>
    <div className="settlement-summary"><div><span className="eyebrow">Settlement rail</span><strong>Solana Pay simulation</strong><small>Wallet signatures are simulated in this operator environment.</small></div><div className="settlement-summary-meta"><span>Network<strong>Devnet → Mainnet</strong></span><span>Verification<strong>Wallet + amount</strong></span></div></div>
    <div className="settlement-layout"><div className="list-panel">{items.map((item) => <button className={`settlement-row ${selected?.id === item.id ? "selected" : ""}`} key={item.id} onClick={() => setSelected(item)}><div className="settlement-row-main"><span className={badgeClass(item.status)}>{item.status}</span><h3>{item.amount} {item.asset} · {item.winner}</h3><p>{item.wallet} · {item.network}</p></div><div className="settlement-row-side"><strong>{item.verification.confirmations}</strong><small>confirmations</small></div></button>)}</div>{selected && <SettlementReceipt settlement={selected} busy={busy === selected.id} onAction={runAction} onClose={() => setSelected(null)} />}</div>
  </AuctionShell>
}

function SettlementReceipt({ settlement, busy, onAction, onClose }: { settlement: Settlement; busy: boolean; onAction: (settlement: Settlement, action: "verify" | "confirm" | "retry") => void; onClose: () => void }) {
  const canVerify = settlement.status === "pending"
  const canConfirm = settlement.status === "verifying"
  const canRetry = settlement.status === "failed"
  return <aside className="settlement-receipt"><div className="receipt-heading"><div><span className="eyebrow">Settlement receipt</span><h2>{settlement.amount} {settlement.asset}</h2><p>{settlement.winner} · {settlement.auctionId}</p></div><button className="icon-button" onClick={onClose}>×</button></div><div className="receipt-status"><span className={`status-pip ${settlement.status}`} /><div><strong>{settlement.status === "pending" ? "Payment request ready" : settlement.status === "verifying" ? "Verifying transaction" : settlement.status === "confirmed" ? "Settlement confirmed" : "Verification failed"}</strong><small>{settlement.updatedAt}</small></div></div><div className="receipt-grid"><div><span>Wallet</span><strong>{settlement.wallet}</strong></div><div><span>Network</span><strong>{settlement.network}</strong></div><div><span>Signature</span><strong>{settlement.signature}</strong></div><div><span>Request</span><strong>{settlement.paymentRequest}</strong></div></div><div className="verification-list"><div><span>Wallet match</span><b className={settlement.verification.wallet}>{settlement.verification.wallet}</b></div><div><span>Amount match</span><b className={settlement.verification.amount}>{settlement.verification.amount}</b></div><div><span>Confirmations</span><b>{settlement.verification.confirmations} / 32</b></div></div><div className="receipt-actions">{canVerify && <button className="primary-button" disabled={busy} onClick={() => onAction(settlement, "verify")}>{busy ? "Checking transaction…" : "Verify payment"}</button>}{canConfirm && <button className="primary-button" disabled={busy} onClick={() => onAction(settlement, "confirm")}>{busy ? "Finalizing…" : "Confirm settlement"}</button>}{canRetry && <button className="primary-button" disabled={busy} onClick={() => onAction(settlement, "retry")}>Create new request</button>}{settlement.status === "confirmed" && <button className="secondary-button" onClick={() => navigator.clipboard?.writeText(settlement.signature)}>Copy signature</button>}</div></aside>
}
export function SettingsView({ section = "rules" }: { section?: string }) { const rules = section === "rules"; const [settings, setSettings] = useState<Record<string, boolean>>({}); useEffect(() => { fetch("/api/settings").then((r) => r.json()).then(setSettings) }, []); const items = rules ? [{ key: "reserveProtection", title: "Reserve protection", body: "Block bids below the configured floor." }, { key: "autoExtend", title: "Auto-extend", body: "Extend the closing window when a bid arrives near close." }, { key: "humanApproval", title: "Human approval", body: "Route unusual bidder requests to the operator queue." }] : [{ key: "webChat", title: "Web chat", body: "Connected · 12 active sessions" }, { key: "email", title: "Email", body: "Connected · inbound replies enabled" }, { key: "sms", title: "SMS", body: "Not connected" }]; const flip = async (key: string) => { const next = { [key]: !settings[key] }; setSettings((current) => ({ ...current, ...next })); await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }) }; return <AuctionShell title={rules ? "Rules & policies" : "Channel connections"} eyebrow="Configuration"><div className="settings-grid">{items.map((item) => <div className="setting-card" key={item.key}><button className="toggle-row" onClick={() => flip(item.key)}><span><strong>{item.title}</strong><small>{item.body}</small></span><span className={`toggle ${settings[item.key] ? "on" : ""}`}><span /></span></button><button className="text-button" onClick={() => flip(item.key)}>{settings[item.key] ? "Configure →" : "Connect →"}</button></div>)}</div></AuctionShell> }

function Stat({ label, value, note }: { label: string; value: string; note: string }) { return <div className="stat-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></div> }
function Metric({ label, value }: { label: string; value: string }) { return <div><small>{label}</small><strong>{value}</strong></div> }
function PanelTitle({ label, note }: { label: string; note: string }) { return <div className="panel-title"><div><span className="eyebrow">{label}</span><h3>{note}</h3></div></div> }
function AuctionCard({ auction }: { auction: Auction }) { return <a className="market-card" href={`/auctions/${auction.id}`}><div className="auction-art"><span>AUCTION / {auction.id}</span><span>↗</span></div><div className="card-top"><span className={badgeClass(auction.status)}>{auction.status}</span><span>{auction.bidders} bidders</span></div><h3>{auction.title}</h3><div className="card-metrics"><span>Top bid <b>{auction.topBid}</b></span><span>Floor <b>{auction.floor}</b></span></div><div className="card-footer"><span>{auction.channels.join(" + ")}</span><span>Ends {new Date(auction.endsAt).toLocaleDateString()}</span></div></a> }
function NewAuctionWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (auction: Auction) => void }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ title: "", floor: "", terms: "", autoExtend: true, requiresApproval: true })
  const [created, setCreated] = useState<Auction | null>(null)
  const [copied, setCopied] = useState(false)
  const update = (key: string, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }))
  const create = async () => {
    const response = await fetch("/api/auctions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, floor: `$${form.floor || "0"}`, status: "draft", endsAt: new Date(Date.now() + 7 * 86400000).toISOString(), channels: ["Web chat"] }) })
    const auction = await response.json()
    setCreated(auction)
    setStep(4)
  }
  const copyCode = async () => { if (!created) return; await navigator.clipboard?.writeText(created.joinCode); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const finish = () => { if (created) onCreated(created) }
  return <div className="modal-backdrop"><div className="wizard modal-card"><div className="modal-heading"><div><span className="eyebrow">New auction · step {Math.min(step, 4)} of 4</span><h2>{step === 1 ? "Describe the lot" : step === 2 ? "Set guardrails" : step === 3 ? "Preview the live phrasing" : "Share the room code"}</h2></div><button className="icon-button" onClick={step === 4 ? finish : onClose}>×</button></div>
    {step === 1 && <div className="form-stack"><label>Lot title<input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="e.g. Signed first-edition design book" /></label><label>Opening floor<input value={form.floor} onChange={(e) => update("floor", e.target.value)} placeholder="1800" /></label><label>Terms<textarea value={form.terms} onChange={(e) => update("terms", e.target.value)} placeholder="Winner pays within 48 hours…" /></label></div>}
    {step === 2 && <div className="form-stack"><Toggle label="Auto-extend closing window" value={form.autoExtend} onChange={(value) => update("autoExtend", value)} /><Toggle label="Require operator approval for exceptions" value={form.requiresApproval} onChange={(value) => update("requiresApproval", value)} /><div className="policy-note">Bids below the floor will be rejected. New bidder requests are classified before acceptance.</div></div>}
    {step === 3 && <div className="preview-card"><span className="live-indicator"><i /> Live phrasing preview</span><p>“{form.title || "Your auction lot"} is open. Bids start at {form.floor ? `$${form.floor}` : "$0"}. {form.autoExtend ? "The closing window extends when a bid arrives near close." : "The auction closes at the scheduled time."}”</p><small>{form.requiresApproval ? "Operator approval is enabled for unusual requests." : "The agent can handle standard requests automatically."}</small></div>}
    {step === 4 && created && <div className="form-stack"><div className="policy-note">This auction is private by default. Only people who have this code can join — share it however you like, the same way you'd share a Ludo King room code.</div><div className="join-code-display"><span className="eyebrow">Room code</span><strong className="join-code-value">{created.joinCode}</strong><button className="secondary-button" onClick={copyCode}>{copied ? "Copied" : "Copy code"}</button></div><div className="policy-note">Bidders join by sending <code>/join {created.joinCode}</code> on any connected channel, or by entering the code on your join page.</div></div>}
    <div className="modal-actions">
      {step < 4 && <button className="secondary-button" onClick={step === 1 ? onClose : () => setStep(step - 1)}>{step === 1 ? "Cancel" : "Back"}</button>}
      {step < 3 && <button className="primary-button" disabled={step === 1 && !form.title} onClick={() => setStep(step + 1)}>Continue →</button>}
      {step === 3 && <button className="primary-button" onClick={create}>Create auction</button>}
      {step === 4 && <button className="primary-button" onClick={finish}>Done</button>}
    </div>
  </div></div>
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) { return <button className="toggle-row" onClick={() => onChange(!value)}><span>{label}</span><span className={`toggle ${value ? "on" : ""}`}><span /></span></button> }
function BidderDrawer({ bidder, onClose }: { bidder: Bidder; onClose: () => void }) { const [messages, setMessages] = useState<Message[]>([]); const [reply, setReply] = useState(""); useEffect(() => { fetch(`/api/bidders/${bidder.id}`).then((r) => r.json()).then((data) => setMessages(data.messages)) }, [bidder.id]); const send = async () => { if (!reply.trim()) return; const response = await fetch(`/api/bidders/${bidder.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: reply }) }); const created = await response.json(); setMessages((items) => [...items, created]); setReply("") }; return <div className="drawer-backdrop"><aside className="bidder-drawer"><div className="modal-heading"><div><span className="eyebrow">Bidder thread</span><h2>{bidder.name}</h2><p>{bidder.handle} · {bidder.connection}</p></div><button className="icon-button" onClick={onClose}>×</button></div><div className="thread">{messages.map((message) => <div className={`message ${message.author === "Operator" ? "operator" : ""}`} key={message.id}><div><strong>{message.author}</strong><span className="message-tag">{message.kind}</span></div><p>{message.body}</p><small>{message.at}</small></div>)}</div><div className="reply-box"><textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write an operator reply…" /><button className="primary-button" onClick={send}>Send reply</button></div></aside></div> }

// ─── Types for policy and events ─────────────────────────────────────────────
type PolicyRule = {
  id: string
  auctionId: string | null
  name: string
  description: string
  condition: string
  action: string
  active: boolean
  createdAt: string
}

type EventLogEntry = {
  id: string
  auctionId: string | null
  type: string
  payload: string
  at: string
}

// ─── PolicyView ───────────────────────────────────────────────────────────────

export function PolicyView() {
  const [rules, setRules] = useState<PolicyRule[]>([])
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: "", description: "", condition: "", action: "", auctionId: "" })
  const [saving, setSaving] = useState(false)
  const [filterAuction, setFilterAuction] = useState("")

  useEffect(() => {
    const url = filterAuction ? `/api/policy?auctionId=${filterAuction}` : "/api/policy"
    fetch(url).then((r) => r.json()).then(setRules)
  }, [filterAuction])

  useEffect(() => {
    fetch("/api/auctions").then((r) => r.json()).then(setAuctions)
  }, [])

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const save = async () => {
    if (!form.name || !form.condition || !form.action) return
    setSaving(true)
    const res = await fetch("/api/policy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, auctionId: form.auctionId || undefined }),
    })
    const created = await res.json()
    setRules((r) => [created, ...r])
    setForm({ name: "", description: "", condition: "", action: "", auctionId: "" })
    setShowForm(false)
    setSaving(false)
  }

  const toggle = async (rule: PolicyRule) => {
    const res = await fetch("/api/policy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, active: !rule.active }),
    })
    const updated = await res.json()
    setRules((r) => r.map((item) => (item.id === updated.id ? updated : item)))
  }

  const remove = async (id: string) => {
    await fetch(`/api/policy?id=${id}`, { method: "DELETE" })
    setRules((r) => r.filter((item) => item.id !== id))
  }

  return (
    <AuctionShell
      title="Policy rules"
      eyebrow="Agent behaviour"
      action={
        <button className="primary-button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "+ New rule"}
        </button>
      }
    >
      <div className="policy-summary">
        <p className="hero-copy">
          Rules define how the agent classifies, accepts, rejects, and escalates bidder messages.
          Global rules apply to all auctions; auction-specific rules override them for that room.
        </p>
      </div>

      {/* Auction filter */}
      <div className="toolbar" style={{ marginBottom: "1rem" }}>
        <div className="segmented-control">
          <button className={!filterAuction ? "active" : ""} onClick={() => setFilterAuction("")}>All</button>
          {auctions.map((a) => (
            <button key={a.id} className={filterAuction === a.id ? "active" : ""} onClick={() => setFilterAuction(a.id)}>
              {a.id}
            </button>
          ))}
        </div>
      </div>

      {/* New-rule form */}
      {showForm && (
        <div className="panel" style={{ marginBottom: "1.5rem" }}>
          <div className="panel-title"><span className="eyebrow">New rule</span></div>
          <div className="form-stack">
            <label>Rule name<input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Reserve floor enforcement" /></label>
            <label>Description<input value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="What this rule does…" /></label>
            <label>Condition (plain text)<input value={form.condition} onChange={(e) => update("condition", e.target.value)} placeholder="bid_amount &lt; floor" /></label>
            <label>Action<input value={form.action} onChange={(e) => update("action", e.target.value)} placeholder="reject_bid | escalate_to_operator | extend_5m" /></label>
            <label>
              Auction (optional — leave blank for global)
              <select value={form.auctionId} onChange={(e) => update("auctionId", e.target.value)}>
                <option value="">Global (all auctions)</option>
                {auctions.map((a) => <option key={a.id} value={a.id}>{a.id} — {a.title}</option>)}
              </select>
            </label>
            <button className="primary-button" disabled={!form.name || !form.condition || !form.action || saving} onClick={save}>
              {saving ? "Saving…" : "Create rule"}
            </button>
          </div>
        </div>
      )}

      {/* Rules list */}
      <div className="list-panel">
        {rules.length === 0 && (
          <div className="empty-state"><p>No policy rules yet</p><small>Create a rule to define how the agent handles bids and messages.</small></div>
        )}
        {rules.map((rule) => (
          <div className="list-row" key={rule.id}>
            <div className="list-row-main">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                <span className={badgeClass(rule.active ? "live" : "closed")}>{rule.active ? "active" : "inactive"}</span>
                {rule.auctionId && <span className="eyebrow">{rule.auctionId}</span>}
              </div>
              <h3>{rule.name}</h3>
              {rule.description && <p style={{ margin: "0.15rem 0", fontSize: "0.75rem", color: "var(--muted-foreground)" }}>{rule.description}</p>}
              <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
                <code style={{ background: "var(--surface)", padding: "1px 5px", borderRadius: 3 }}>{rule.condition}</code>
                {" → "}
                <code style={{ background: "var(--surface)", padding: "1px 5px", borderRadius: 3 }}>{rule.action}</code>
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="secondary-button" onClick={() => toggle(rule)}>{rule.active ? "Disable" : "Enable"}</button>
              <button className="secondary-button" onClick={() => remove(rule.id)} style={{ color: "var(--destructive, oklch(0.65 0.2 25))" }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </AuctionShell>
  )
}

// ─── EventsView ───────────────────────────────────────────────────────────────

const EVENT_TONE: Record<string, string> = {
  "bid.placed": "positive",
  "bidder.joined": "positive",
  "auction.created": "positive",
  "settlement.confirmed": "positive",
  "escalation.created": "negative",
  "escalation.resolved": "positive",
  "escalation.reopened": "warning",
  "settlement.failed": "negative",
  "settlement.created": "neutral",
  "settlement.verifying": "neutral",
  "message.created": "neutral",
  "settings.updated": "neutral",
  "policy.created": "neutral",
  "policy.updated": "neutral",
  "policy.deleted": "warning",
}

function eventTag(type: string): string {
  if (type.startsWith("bid")) return "BID"
  if (type.startsWith("bidder")) return "BIDDER"
  if (type.startsWith("auction")) return "AUCTION"
  if (type.startsWith("escalation")) return "ESCALATION"
  if (type.startsWith("settlement")) return "SETTLEMENT"
  if (type.startsWith("message")) return "MESSAGE"
  if (type.startsWith("policy")) return "POLICY"
  return "EVENT"
}

function formatPayload(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    // Surface the most readable fields
    const parts: string[] = []
    if (parsed.amount) parts.push(`amount: ${parsed.amount}`)
    if (parsed.auctionId) parts.push(parsed.auctionId)
    if (parsed.bidderId) parts.push(`bidder: ${parsed.bidderId}`)
    if (parsed.winner) parts.push(`winner: ${parsed.winner}`)
    if (parsed.status) parts.push(`status: ${parsed.status}`)
    if (parsed.reason) parts.push(parsed.reason)
    if (parsed.name) parts.push(parsed.name)
    return parts.join(" · ") || JSON.stringify(parsed).slice(0, 80)
  } catch {
    return raw.slice(0, 80)
  }
}

export function EventsView() {
  const [events, setEvents] = useState<EventLogEntry[]>([])
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [filterAuction, setFilterAuction] = useState("")
  const [filterType, setFilterType] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/auctions").then((r) => r.json()).then(setAuctions)
  }, [])

  useEffect(() => {
    setLoading(true)
    const url = filterAuction ? `/api/events?auctionId=${filterAuction}` : "/api/events"
    fetch(url)
      .then((r) => r.json())
      .then((data) => { setEvents(data); setLoading(false) })
  }, [filterAuction])

  const eventTypes = [...new Set(events.map((e) => e.type))].sort()
  const visible = filterType ? events.filter((e) => e.type === filterType) : events

  return (
    <AuctionShell title="Event log" eyebrow="Agent activity timeline">
      {/* Filters */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <div className="segmented-control">
          <button className={!filterAuction ? "active" : ""} onClick={() => setFilterAuction("")}>All auctions</button>
          {auctions.map((a) => (
            <button key={a.id} className={filterAuction === a.id ? "active" : ""} onClick={() => setFilterAuction(a.id)}>
              {a.id}
            </button>
          ))}
        </div>
        {eventTypes.length > 0 && (
          <div className="segmented-control">
            <button className={!filterType ? "active" : ""} onClick={() => setFilterType("")}>All types</button>
            {eventTypes.map((t) => (
              <button key={t} className={filterType === t ? "active" : ""} onClick={() => setFilterType(t)}>
                {eventTag(t)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Timeline */}
      <section className="panel">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">Agent audit trail</span>
            <h2 className="section-title">Activity feed</h2>
          </div>
          <span className="live-indicator">
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--primary, oklch(0.7 0.25 280))", marginRight: 4 }} />
            {visible.length} events
          </span>
        </div>

        {loading && <div className="empty-state"><p>Loading events…</p></div>}

        {!loading && visible.length === 0 && (
          <div className="empty-state">
            <p>No events yet</p>
            <small>Events are recorded automatically as bids, messages, and escalations happen.</small>
          </div>
        )}

        <div className="activity-list">
          {visible.map((event) => {
            const tone = EVENT_TONE[event.type] ?? "neutral"
            const tag = eventTag(event.type)
            const summary = formatPayload(event.payload)
            const time = event.at ? new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"

            return (
              <div className="activity-row" key={event.id}>
                <span className="activity-time">{time}</span>
                <span className={`activity-status ${tone}`} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.825rem", color: "var(--foreground)" }}>
                    <span>{event.type}</span>
                    <span className="event-tag">{tag}</span>
                    {event.auctionId && <span className="eyebrow">{event.auctionId}</span>}
                  </div>
                  {summary && (
                    <div style={{ marginTop: "0.2rem", fontSize: "0.72rem", color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                      {summary}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </AuctionShell>
  )
}
