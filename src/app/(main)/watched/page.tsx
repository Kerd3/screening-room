import type { Metadata } from "next";
import { WatchedView } from "@/components/WatchedView";

export const metadata: Metadata = { title: "Watch history" };

export default function WatchedPage() {
  return <WatchedView />;
}
