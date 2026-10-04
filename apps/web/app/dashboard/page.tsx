import { type Metadata } from "next";
import { SiteHeader } from "@/components/site/site-header";
import { Dashboard } from "@/features/progress/components/Dashboard";
import { loadProgressCatalog } from "@/lib/progress-catalog";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your Git learning progress: lessons, challenges, XP and commands practiced.",
};

export default async function DashboardPage() {
  const catalog = await loadProgressCatalog();
  return (
    <>
      <SiteHeader />
      <Dashboard catalog={catalog} />
    </>
  );
}
