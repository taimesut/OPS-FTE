import React from "react";
import ReactDOM from "react-dom/client";
import appCss from "./global.css?inline";
import { UserscriptApp } from "./UserscriptApp";

const HOST_ID = "ops-fte-userscript-host";
const PANEL_CLOSE_EVENT = "ops-fte:panel-close";

console.log("[OPS-FTE] userscript entry loaded", window.location.href);

function mountOpsFte() {
  console.log("[OPS-FTE] mountOpsFte called", window.location.href);

  if (document.getElementById(HOST_ID)) {
    console.log("[OPS-FTE] host already exists");
    return;
  }

  try {
    console.log("[OPS-FTE] creating host");

    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.position = "fixed";
    host.style.inset = "0";
    host.style.zIndex = "2147483646";
    host.style.pointerEvents = "none";
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = appCss;
    shadow.appendChild(style);

    const launcher = document.createElement("button");
    launcher.type = "button";
    launcher.textContent = "OPS FTE";
    launcher.setAttribute("aria-label", "Mở OPS FTE");
    launcher.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:max(20px,env(safe-area-inset-bottom))",
      "z-index:2147483647",
      "border:0",
      "border-radius:9999px",
      "padding:12px 16px",
      "background:#ee4d2d",
      "color:white",
      "font:700 14px/1.2 system-ui,sans-serif",
      "box-shadow:0 8px 28px rgba(0,0,0,.24)",
      "cursor:pointer",
      "pointer-events:auto",
    ].join(";");
    shadow.appendChild(launcher);

    const panel = document.createElement("section");
    panel.setAttribute("aria-label", "OPS FTE");
    panel.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483646",
      "background:white",
      "overflow:auto",
      "overscroll-behavior:contain",
      "pointer-events:auto",
      "display:none",
    ].join(";");
    shadow.appendChild(panel);

    const reactRoot = document.createElement("div");
    reactRoot.style.minHeight = "100dvh";
    reactRoot.style.width = "100%";
    panel.appendChild(reactRoot);

    const open = () => {
      panel.style.display = "block";
      launcher.style.display = "none";
    };

    const close = () => {
      window.dispatchEvent(new CustomEvent(PANEL_CLOSE_EVENT));
      panel.style.display = "none";
      launcher.style.display = "block";
    };

    const root = ReactDOM.createRoot(reactRoot);
    root.render(
      <React.StrictMode>
        <UserscriptApp onRequestClose={close} />
      </React.StrictMode>,
    );

    launcher.addEventListener("click", open);

    console.log("[OPS-FTE] mounted successfully");
  } catch (error) {
    console.error("[OPS-FTE] mount failed", error);
  }
}

function ensureMounted() {
  if (!document.getElementById(HOST_ID)) {
    mountOpsFte();
  }
}

function setupSpaNavigationWatch() {
  window.addEventListener("popstate", ensureMounted);

  const originalPushState = history.pushState.bind(history);
  history.pushState = (...args) => {
    originalPushState(...args);
    setTimeout(ensureMounted, 0);
  };

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = (...args) => {
    originalReplaceState(...args);
    setTimeout(ensureMounted, 0);
  };

  if ("navigation" in window) {
    const navigation = (window as Window & {
      navigation?: EventTarget;
    }).navigation;
    navigation?.addEventListener("navigate", () => {
      setTimeout(ensureMounted, 0);
    });
  }

  const observer = new MutationObserver(() => {
    ensureMounted();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function bootstrap() {
  ensureMounted();
  setupSpaNavigationWatch();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}
