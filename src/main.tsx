import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import "./index.css";
import App from "./App";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string;

if (!convexUrl) {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-gray-300 gap-4">
        <p className="text-lg font-semibold text-white">Convex nicht verbunden</p>
        <p className="text-sm text-gray-400">Bitte <code className="bg-gray-800 px-1.5 py-0.5 rounded text-blue-400">npx convex dev</code> ausführen und <code className="bg-gray-800 px-1.5 py-0.5 rounded text-blue-400">VITE_CONVEX_URL</code> in <code className="bg-gray-800 px-1.5 py-0.5 rounded text-blue-400">.env.local</code> setzen.</p>
      </div>
    </StrictMode>
  );
} else {
  const convex = new ConvexReactClient(convexUrl);
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ConvexProvider client={convex}>
        <App />
      </ConvexProvider>
    </StrictMode>
  );
}
