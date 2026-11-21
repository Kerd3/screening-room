import type { Metadata } from "next";
import { BrowseView } from "@/components/BrowseView";

export const metadata: Metadata = { title: "TV Series" };

export default function TvPage() {
  return <BrowseView type="tv" />;
}
