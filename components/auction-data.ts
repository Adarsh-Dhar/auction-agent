export const auctions = [
  { id: 'AUC-1048', item: 'Signed first-edition design book', category: 'Collectibles', status: 'Live', floor: '$240', highest: '$680', bidders: 18, escalations: 2, end: '02h 14m', image: 'BOOK' },
  { id: 'AUC-1052', item: 'Custom walnut studio desk', category: 'Furniture', status: 'Live', floor: '$420', highest: '$1,180', bidders: 11, escalations: 0, end: '06h 38m', image: 'DESK' },
  { id: 'AUC-1041', item: 'Limited run ceramic sculpture', category: 'Art', status: 'Closed', floor: '$160', highest: '$940', bidders: 24, escalations: 1, end: 'Settled yesterday', image: 'FORM' },
  { id: 'AUC-1037', item: 'Hand-built modular synthesizer', category: 'Music', status: 'Draft', floor: '$600', highest: '—', bidders: 0, escalations: 0, end: 'Not launched', image: 'SYNTH' },
] as const

export const bidders = [
  { name: 'Priya S.', channel: 'Telegram', bid: '$680', status: 'active', last: 'just now' },
  { name: 'Raj K.', channel: 'WhatsApp', bid: '$640', status: 'quiet', last: '40 min ago' },
  { name: 'Mina L.', channel: 'Email', bid: '$590', status: 'active', last: '4 min ago' },
  { name: 'Theo M.', channel: 'Telegram', bid: '$520', status: 'dropped', last: '2 hr ago' },
] as const

export const events = [
  { time: '09:42:18', label: 'Bid accepted', detail: 'Priya bid $680 — clears the $20 minimum increment.', tone: 'positive', tag: 'BID' },
  { time: '09:40:03', label: 'Probe deflected', detail: 'A bidder asked who is leading — hidden per disclosure policy.', tone: 'neutral', tag: 'PROBE' },
  { time: '09:36:55', label: 'Nudge sent', detail: 'Raj has been quiet for 40 min — reminder sent on WhatsApp.', tone: 'warning', tag: 'NUDGE' },
  { time: '09:31:44', label: 'Escalation raised', detail: 'Two bidders claim priority on the same shipping condition.', tone: 'negative', tag: 'DECISION' },
] as const

export type Auction = (typeof auctions)[number]
