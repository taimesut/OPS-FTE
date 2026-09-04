import React from "react";
import ReactDOM from "react-dom/client";
import appCss from "./global.css?inline";
import { UserscriptApp } from "./UserscriptApp";

const HOST_ID = "ops-fte-userscript-host";

function mountOpsFte() {
  if (document.getElementById(HOST_ID)) return;

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
    "bottom:20px",
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
    "pointer-events:auto",
    "display:none",
  ].join(";");
  shadow.appendChild(panel);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Đóng OPS FTE");
  closeButton.style.cssText = [
    "position:fixed",
    "right:12px",
    "top:10px",
    "z-index:2147483647",
    "width:40px",
    "height:40px",
    "border:0",
    "border-radius:9999px",
    "background:rgba(0,0,0,.08)",
    "font:700 26px/40px system-ui,sans-serif",
    "cursor:pointer",
  ].join(";");
  panel.appendChild(closeButton);

  const reactRoot = document.createElement("div");
  reactRoot.style.minHeight = "100vh";
  panel.appendChild(reactRoot);

  const root = ReactDOM.createRoot(reactRoot);
  root.render(
    <React.StrictMode>
      <UserscriptApp />
    </React.StrictMode>,
  );

  const open = () => {
    panel.style.display = "block";
    launcher.style.display = "none";
  };

  const close = () => {
    panel.style.display = "none";
    launcher.style.display = "block";
  };

  launcher.addEventListener("click", open);
  closeButton.addEventListener("click", close);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountOpsFte, { once: true });
} else {
  mountOpsFte();
}
