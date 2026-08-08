'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlertTriangle, Clock, Gavel, KeyRound, LayoutDashboard, Radio, Send, Settings2, ShieldCheck, Trophy, Users } from 'lucide-react'
import type { ReactNode } from 'react'

const workspace = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/auctions/live', label: 'Live auctions', icon: Radio },
  { href: '/escalations', label: 'Escalations', icon: AlertTriangle },
  { href: '/settlements', label: 'Settlements', icon: Trophy },
  { href: '/policy', label: 'Policy rules', icon: ShieldCheck },
  { href: '/events', label: 'Event log', icon: Clock },
  { href: '/join', label: 'Join an auction', icon: KeyRound },
]
const configure = [
  { href: '/settings/bidders', label: 'Bidder roster', icon: Users },
  { href: '/settings/rules', label: 'Rules & policies', icon: Settings2 },
  { href: '/settings/channels', label: 'Channels', icon: Send },
]

export function AuctionShell({ children, title, eyebrow = 'Auction operations', action }: { children: ReactNode; title: string; eyebrow?: string; action?: ReactNode }) {
  const pathname = usePathname()
  return <main className="app-shell"><aside className="sidebar"><Link href="/" className="brand-mark" aria-label="Auction admin home"><Gavel className="size-4" /></Link><nav className="mt-8 flex flex-col gap-1" aria-label="Workspace"><span className="eyebrow px-3 pb-2">Workspace</span>{workspace.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-item ${pathname === href || (href !== '/' && pathname.startsWith(href)) ? 'active' : ''}`}><span className="nav-icon"><Icon className="size-4" /></span>{label}</Link>)}</nav><nav className="mt-8 flex flex-col gap-1" aria-label="Configure"><span className="eyebrow px-3 pb-2">Configure</span>{configure.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-item ${pathname.startsWith(href) ? 'active' : ''}`}><span className="nav-icon"><Icon className="size-4" /></span>{label}</Link>)}</nav><div className="mt-auto border-t border-border/70 pt-4"><div className="nav-item"><span className="avatar">AJ</span><span className="min-w-0 flex-1 truncate text-left">Alex Johnson</span><span className="eyebrow">ADMIN</span></div></div></aside><section className="content-area"><header className="topbar"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1></div><div className="flex items-center gap-3">{action}<button className="icon-button" aria-label="Notifications"><AlertTriangle className="size-4" /></button><div className="avatar">AJ</div></div></header>{children}</section></main>
}
export default AuctionShell
