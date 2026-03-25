import type { Metadata } from "next";
import { PayeesView } from "@/features/payees/components/PayeesView";

export const metadata: Metadata = {
  title: "Payees — Actual Admin Panel",
};

export default function PayeesPage() {
  return <PayeesView />;
}
