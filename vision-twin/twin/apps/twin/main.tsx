import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TwinApp } from "../../src/apps/twin/TwinApp";
import "../../src/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TwinApp />
  </StrictMode>,
);
