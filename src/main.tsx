import { createRoot } from "react-dom/client";

import App from "./App";
import "./index.css";
import { installSaltPumperBridge } from "./lib/pumper-bridge";

const mountTarget = document.getElementById("salt-app-root") || document.getElementById("root");

if (!mountTarget) {
  throw new Error("SALT app mount target not found");
}

installSaltPumperBridge();

createRoot(mountTarget).render(<App />);
