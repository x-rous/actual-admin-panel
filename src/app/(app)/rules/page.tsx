import type { Metadata } from "next";
import { RulesView } from "@/features/rules/components/RulesView";

export const metadata: Metadata = {
  title: "Rules — Actual Admin Panel",
};

export default function RulesPage() {
  return <RulesView />;
}
