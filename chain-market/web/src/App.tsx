import React, { useState } from "react";
import { WalletProvider, useWallet } from "./context/WalletContext";
import { Header } from "./components/Header";
import { Navigation, TabKey } from "./components/Navigation";
import { CitizenPortal } from "./components/portals/CitizenPortal";
import { CompanyPortal } from "./components/portals/CompanyPortal";
import { AdminPortal } from "./components/portals/AdminPortal";
import { MarketplaceView } from "./components/portals/MarketplaceView";
import { SimulatorView } from "./components/portals/SimulatorView";
import { EventStream } from "./components/portals/EventStream";
import { DEFAULT_DEPLOYMENTS } from "./constants";
import { Check, AlertCircle, Info } from "lucide-react";

const AppContent: React.FC = () => {
  const { currentWallet, toast } = useWallet();
  const [activeTab, setActiveTab] = useState<TabKey>("citizen");

  React.useEffect(() => {
    if (currentWallet.role === "citizen" && (activeTab === "company" || activeTab === "admin")) {
      setActiveTab("citizen");
    } else if (currentWallet.role === "company" && (activeTab === "citizen" || activeTab === "admin")) {
      setActiveTab("company");
    } else if (currentWallet.role === "admin" && (activeTab === "citizen" || activeTab === "company")) {
      setActiveTab("admin");
    }
  }, [currentWallet.role]);

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans selection:bg-zinc-800">
      <Header />
      <Navigation activeTab={activeTab} onSelectTab={setActiveTab} />

      <main className="flex-1 pb-16">
        {activeTab === "citizen" && <CitizenPortal />}
        {activeTab === "company" && <CompanyPortal />}
        {activeTab === "admin" && <AdminPortal />}
        {activeTab === "marketplace" && <MarketplaceView />}
        {activeTab === "simulator" && <SimulatorView />}
        {activeTab === "events" && <EventStream />}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 bg-black px-6 py-4 text-xs font-mono text-zinc-400 flex justify-between items-center">
        <div className="flex gap-4">
          <span>AIRcoin Protocol (Workstream C)</span>
          <span>•</span>
          <span>Token: {DEFAULT_DEPLOYMENTS.AIRToken.slice(0, 10)}...</span>
          <span>•</span>
          <span>Market: {DEFAULT_DEPLOYMENTS.Marketplace.slice(0, 10)}...</span>
        </div>

        <div>
          <span>Chain ID #31337 · Polygon Amoy</span>
        </div>
      </footer>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-[#09090b] px-4 py-3 text-xs shadow-2xl animate-in slide-in-from-bottom-2">
          {toast.type === "success" ? (
            <Check className="h-4 w-4 text-emerald-400" />
          ) : toast.type === "error" ? (
            <AlertCircle className="h-4 w-4 text-red-400" />
          ) : (
            <Info className="h-4 w-4 text-zinc-400" />
          )}
          <span className="text-zinc-200">{toast.message}</span>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <WalletProvider>
      <AppContent />
    </WalletProvider>
  );
}
