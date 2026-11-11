import type { Metadata } from "next";
import { DEMO_PATH } from "@/lib/fingerprint";
import { DocPage, Onward, PageHead } from "../doc-parts";
import { FaqList } from "../faq-list";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Short answers about Tally on NEAR, in four groups: trust and verification, privacy, verified cards, and AI and payments.",
};

export default function Questions() {
  return (
    <DocPage current="faq">
      <PageHead title="Questions, answered briefly.">Four groups. Search them, or open any row.</PageHead>

      <FaqList />

      <Onward href={DEMO_PATH} label="Open the demo">
        Easier to see than to read
      </Onward>
    </DocPage>
  );
}
