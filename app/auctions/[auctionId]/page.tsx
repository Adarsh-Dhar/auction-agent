import { AuctionDetailView } from '@/components/auction-route-views'

export default async function Page({ params }: { params: Promise<{ auctionId: string }> }) {
  const { auctionId } = await params
  return <AuctionDetailView auctionId={auctionId} />
}
