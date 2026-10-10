import React from "react";
import { User, Building2, Landmark, ShoppingBag, Terminal, Activity } from "lucide-react";
import { cn } from "../lib/utils";

export type TabKey = "citizen" | "company" | "admin" | "marketplace" | "simulator" | "events";

interface NavigationProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onSelectTab }) => {
  const tabs = [
    { key: "citizen", label: "Citizen", icon: User },
    { key: "company", label: "Enterprise Compliance", icon: Building2 },
    { key: "admin", label: "Regulator", icon: Landmark },
    { key: "marketplace", label: "Marketplace", icon: ShoppingBag },
    { key: "simulator", label: "Attestation Simulator", icon: Terminal },
    { key: "events", label: "Event Stream", icon: Activity },
  ];

  return (
    <nav className="w-full border-b border-zinc-800 bg-black px-6">
      <div className="flex space-x-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onSelectTab(tab.key as TabKey)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors",
                isActive
                  ? "border-zinc-100 text-zinc-100"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
