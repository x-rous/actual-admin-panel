import { AppShell } from "@/components/layout/AppShell";

/**
 * App layout — wraps all entity screens with the four-panel shell.
 * Connection guard is handled inside AppShell (client-side).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
