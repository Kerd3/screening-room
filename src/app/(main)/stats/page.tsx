import type { Metadata } from "next";
import { StatsView } from "@/components/StatsView";

export const metadata: Metadata = { title: "Cache and rate limits" };

export default function StatsPage() {
  return <StatsView />;
}
