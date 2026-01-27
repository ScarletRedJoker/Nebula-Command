import { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Influencer Pipeline | Dashboard",
  description: "Automated content generation with character consistency and scheduling",
};

export default function InfluencerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
