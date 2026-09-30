const WEBHOOK_MESSAGE_TYPE = "ops-fte:webhook-post";
const ALLOWED_WEBHOOK_ORIGINS = new Set([
  "https://script.google.com",
  "https://script.googleusercontent.com",
]);

const isAllowedWebhookUrl = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    return ALLOWED_WEBHOOK_ORIGINS.has(url.origin);
  } catch {
    return false;
  }
};

browser.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== WEBHOOK_MESSAGE_TYPE) return undefined;

  return (async () => {
    const url = typeof message.url === "string" ? message.url.trim() : "";
    const body = typeof message.body === "string" ? message.body : "";

    if (!isAllowedWebhookUrl(url)) {
      return {
        ok: false,
        error: "Webhook URL không thuộc Google Apps Script.",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=UTF-8",
        },
        body,
        redirect: "follow",
        signal: controller.signal,
      });

      return {
        ok: true,
        status: response.status,
        statusText: response.statusText,
        responseText: await response.text(),
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error && error.name === "AbortError"
            ? "Apps Script phản hồi quá lâu. Vui lòng thử lại."
            : error instanceof Error && error.message
              ? error.message
              : "Không thể kết nối Apps Script.",
      };
    } finally {
      clearTimeout(timeout);
    }
  })();
});
