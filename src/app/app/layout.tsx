import BottomNav from "@/components/BottomNav";
import { requireSalon } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { isOwner } = await requireSalon();
  return (
    <div className="min-h-screen pb-24">
      <div className="mx-auto max-w-3xl">{children}</div>
      <div className="print:hidden"><BottomNav isOwner={isOwner} /></div>
    </div>
  );
}
