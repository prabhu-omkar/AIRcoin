import React, { useEffect, useState } from "react";
import { WalletProvider, useWallet } from "./context/WalletContext";
import { Header } from "./components/Header";
import { Navigation, homeTab, TabKey } from "./components/Navigation";
import { CitizenPortal } from "./components/portals/CitizenPortal";
import { CompanyPortal } from "./components/portals/CompanyPortal";
import { AdminPortal } from "./components/portals/AdminPortal";
import { MarketplaceView } from "./components/portals/MarketplaceView";
import { Check, AlertCircle, Info } from "lucide-react";

const AppContent: React.FC = () => {
  const { currentWallet, toast } = useWallet();
  const [activeTab, setActiveTab] = useState<TabKey>(homeTab(currentWallet.role));

  // switching persona lands on that persona's home
  useEffect(() => setActiveTab(homeTab(currentWallet.role)), [currentWallet.role]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground selection:bg-primary/15">
      <Header />
      <Navigation role={currentWallet.role} activeTab={activeTab} onSelectTab={setActiveTab} />
      <main className="flex-1 pb-16">
        {activeTab === "citizen" && <CitizenPortal />}
        {activeTab === "company" && <CompanyPortal />}
        {activeTab === "admin" && <AdminPortal />}
        {activeTab === "marketplace" && <MarketplaceView />}
      </main>
      {toast && (
        <div role="status" className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-lg">
          {toast.type === "success" ? <Check className="h-4 w-4 text-emerald-600" /> : toast.type === "error" ? <AlertCircle className="h-4 w-4 text-red-600" /> : <Info className="h-4 w-4 text-muted-foreground" />}
          <span>{toast.message}</span>
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
