import React from "react";
import { Wallet, Building2, Landmark, ShoppingBag } from "lucide-react";
import { cn } from "../lib/utils";
import type { PersonaRole } from "../types";

export type TabKey = "citizen" | "company" | "admin" | "marketplace";

/** Each persona sees its own home plus the shared marketplace. */
const HOME: Record<PersonaRole, { key: TabKey; label: string; icon: typeof Wallet }> = {
  citizen: { key: "citizen", label: "My wallet", icon: Wallet },
  company: { key: "company", label: "Compliance", icon: Building2 },
  admin: { key: "admin", label: "Regulator", icon: Landmark },
};

export const homeTab = (role: PersonaRole): TabKey => HOME[role].key;

export const Navigation: React.FC<{ role: PersonaRole; activeTab: TabKey; onSelectTab: (tab: TabKey) => void }> = ({ role, activeTab, onSelectTab }) => {
  const tabs = [HOME[role], { key: "marketplace" as TabKey, label: "Marketplace", icon: ShoppingBag }];
  return (
    <nav className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl gap-1 px-6">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onSelectTab(key)}
            className={cn(
              "flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors",
              activeTab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
};
