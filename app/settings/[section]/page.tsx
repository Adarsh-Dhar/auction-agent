import { SettingsView } from '@/components/auction-route-views'

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  return <SettingsView section={section} />
}
