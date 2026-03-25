"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Landmark,
  Users,
  LayoutList,
  ScrollText,
  Calendar,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Rules", href: "/rules", icon: ScrollText },
  { label: "Accounts", href: "/accounts", icon: Landmark },
  { label: "Payees", href: "/payees", icon: Users },
  { label: "Categories", href: "/categories", icon: LayoutList },
  { label: "Schedules", href: "/schedules", icon: Calendar },
  { label: "Tags", href: "/tags", icon: Tag },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-background">
      <nav className="flex flex-1 flex-col gap-0.5 p-2 pt-3">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
