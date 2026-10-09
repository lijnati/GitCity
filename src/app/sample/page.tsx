import type { Metadata } from "next";
import { Explorer } from "@/components/explorer/explorer";
import { sampleSnapshot } from "@/lib/sample";

const name = `${sampleSnapshot.repo.owner}/${sampleSnapshot.repo.name}`;

export const metadata: Metadata = {
  title: `Sample city: ${name}`,
  description: `Explore a bundled snapshot of ${name} as a 3D city — no GitHub request needed.`,
};

export default function SamplePage() {
  return <Explorer snapshot={sampleSnapshot} />;
}
