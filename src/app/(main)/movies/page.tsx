import type { Metadata } from "next";
import { BrowseView } from "@/components/BrowseView";

export const metadata: Metadata = { title: "Movies" };

export default function MoviesPage() {
  return <BrowseView type="movie" />;
}
