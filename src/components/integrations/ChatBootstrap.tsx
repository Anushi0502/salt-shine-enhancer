import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const INBOX_SCRIPT_URL =
  import.meta.env.VITE_SHOPIFY_INBOX_SCRIPT_URL ||
  "https://cdn.shopify.com/extensions/d28e1ec2-6292-4105-93bc-76eed1989032/inbox-1255/assets/inbox-chat-loader.js";
const MOOSE_SCRIPT_URL =
  import.meta.env.VITE_MOOSEDESK_SCRIPT_URL ||
  "https://cdn.shopify.com/extensions/019c84aa-c11d-7a9c-b494-e02061c252d4/development-extensions-933/assets/moosedesk.js";
const CHAT_DOMAIN = import.meta.env.VITE_CHAT_SHOP_DOMAIN || "www.saltonlinestore.com";
const MOOSE_WIDGET_URL =
  import.meta.env.VITE_MOOSEDESK_WIDGET_URL ||
  "https://moosedesk-help-widget.moosedesk.com/58076594275/58076594275.json";
const SHOPIFY_INBOX_EXTERNAL_IDENTIFIER =
  import.meta.env.VITE_SHOPIFY_INBOX_EXTERNAL_IDENTIFIER ||
  "ikHOYMdthufTiqSDLxs_M-X3HJO-csp6PYW2lbMuKK8";
const ENABLE_SHOPIFY_INBOX = import.meta.env.VITE_ENABLE_SHOPIFY_INBOX === "true";
const ENABLE_MOOSEDESK = import.meta.env.VITE_ENABLE_MOOSEDESK === "true";

declare global {
  interface Window {
    mdSettings?: Record<string, unknown>;
    Shopify?: unknown;
  }
}

function appendScriptOnce(id: string, src: string) {
  if (document.getElementById(id)) {
    return;
  }

  const script = document.createElement("script");
  script.id = id;
  script.src = src;
  script.type = "text/javascript";
  script.defer = true;
  document.head.appendChild(script);
}

function isAllowedChatHost() {
  if (typeof window === "undefined") {
    return false;
  }

  const host = window.location.hostname.toLowerCase();
  return host === "saltonlinestore.com" || host === "www.saltonlinestore.com";
}

function appendInboxContainerOnce() {
  if (document.getElementById("chat-button-container")) {
    return;
  }

  const container = document.createElement("script");
  container.id = "chat-button-container";
  container.setAttribute("data-horizontal-position", "bottom_right");
  container.setAttribute("data-vertical-position", "lowest");
  container.setAttribute("data-icon", "hand_wave");
  container.setAttribute("data-text", "chat_with_us");
  container.setAttribute("data-color", "#000000");
  container.setAttribute("data-secondary-color", "#ffffff");
  container.setAttribute("data-ternary-color", "#6a6a6a");
  container.setAttribute("data-domain", CHAT_DOMAIN);
  container.setAttribute("data-shop-domain", CHAT_DOMAIN);
  container.setAttribute("data-external-identifier", SHOPIFY_INBOX_EXTERNAL_IDENTIFIER);
  document.body.appendChild(container);
}

const ChatBootstrap = () => {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.mdSettings = {
      shop_id: 58076594275,
      subdomain: "0309d3-72",
      shop_name: "SALT",
      widget_id: MOOSE_WIDGET_URL,
      customer_id: null,
      secret_key: null,
      page_info: {
        page_type: "spa",
        path: location.pathname,
      },
      shop_currency: "USD",
      languages: ["en", "es"],
    };

    const allowChatOnHost = isAllowedChatHost();

    if ((ENABLE_SHOPIFY_INBOX || Boolean(window.Shopify)) && allowChatOnHost) {
      appendInboxContainerOnce();
      appendScriptOnce("salt-shopify-inbox-loader", INBOX_SCRIPT_URL);
    }

    if (ENABLE_MOOSEDESK && allowChatOnHost) {
      appendScriptOnce("salt-moosedesk-loader", MOOSE_SCRIPT_URL);
    }
  }, [location.pathname]);

  return null;
};

export default ChatBootstrap;
