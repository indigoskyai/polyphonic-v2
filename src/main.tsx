import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { installGlobalErrorHandlers } from "@/lib/observability";

// Install window.onerror + unhandledrejection handlers before the React tree
// mounts so any boot-time error gets captured. ErrorBoundary catches render
// errors inside the tree.
installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
