import { lazy, Suspense, useState } from "react";
import { Box, Loader2 } from "lucide-react";

const TwinApp = lazy(() => import("./apps/twin/TwinApp"));
const DashboardApp = lazy(() =>
  import("./apps/dashboard/DashboardApp").then((m) => ({ default: m.DashboardApp }))
);

type ViewMode = "twin" | "dashboard";

export function App() {
  const getInitialView = (): ViewMode => {
    if (typeof window === "undefined") return "twin";
    const param = new URLSearchParams(window.location.search).get("view");
    if (param === "dashboard" || window.location.hash.includes("dashboard")) {
      return "dashboard";
    }
    return "twin";
  };

  const [viewMode, setViewMode] = useState<ViewMode>(getInitialView);

  const switchToTwin = () => {
    setViewMode("twin");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "#twin");
    }
  };

  const switchToDashboard = () => {
    setViewMode("dashboard");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "#dashboard");
    }
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      {viewMode === "twin" ? (
        <Suspense
          fallback={
            <div
              style={{
                display: "flex",
                height: "100%",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                color: "var(--muted, #56616f)",
                fontFamily: "var(--font, sans-serif)",
              }}
            >
              <Loader2 size={20} />
              <span>Loading 3D Digital Twin...</span>
            </div>
          }
        >
          <TwinApp onOpenDashboard={switchToDashboard} />
        </Suspense>
      ) : (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          <Suspense
            fallback={
              <div
                style={{
                  display: "flex",
                  height: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  color: "var(--muted, #56616f)",
                  fontFamily: "var(--font, sans-serif)",
                }}
              >
                <Loader2 size={20} />
                <span>Loading Owner Dashboard...</span>
              </div>
            }
          >
            <DashboardApp onOpenTwin={switchToTwin} />
          </Suspense>
        </div>
      )}
    </div>
  );
}

export default App;
