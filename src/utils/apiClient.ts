/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { type InternalAxiosRequestConfig, type AxiosResponse } from "axios";
import { getCookies, getProxyUrl } from "./config";
import { showToast } from "../components/Toast";
import {
  createApiErrorRecord,
  createApiRequestTrace,
  safeLogApiError,
  type ApiRequestTrace,
} from "./apiErrorLog";

declare module "axios" {
  interface AxiosRequestConfig {
    suppressErrorToast?: boolean;
    apiTrace?: ApiRequestTrace;
  }
}

const isUserscriptRuntime = (): boolean => {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  return (
    window.location.hostname === "spx.shopee.vn" &&
    Boolean(document.getElementById("ops-fte-userscript-host"))
  );
};

const apiClient = axios.create({
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

// Custom adapter cho Google Apps Script Server-side UrlFetchApp
const gasAdapter = (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
  return new Promise<AxiosResponse>((resolve, reject) => {
    const google = (window as any).google;
    const cookies = getCookies();
    const endpoint = config.url || "";

    google.script.run
      .withSuccessHandler((res: any) => {
        if (res && res.status >= 200 && res.status < 300) {
          resolve({
            data: res.data,
            status: res.status,
            statusText: "OK",
            headers: {},
            config,
            request: {},
          });
        } else {
          const errMsg =
            res?.error ||
            res?.data?.msg ||
            res?.data?.message ||
            JSON.stringify(res?.data) ||
            "Lỗi từ GAS Server";

          reject({
            name: "GasProxyError",
            message: errMsg,
            config,
            response: {
              data: res ? res.data ?? { error: res.error } : null,
              status: res ? res.status : 500,
              statusText: errMsg,
              headers: {},
              config,
            },
          });
        }
      })
      .withFailureHandler((err: any) => {
        const errMsg = err?.message || err?.toString() || "Lỗi thực thi hàm Apps Script";
        reject({
          name: "GasExecutionError",
          message: errMsg,
          stack: typeof err?.stack === "string" ? err.stack : "",
          config,
        });
      })
      .fetchShopeeApi(
        endpoint,
        cookies,
        config.method || "get",
        config.data,
        config.apiTrace?.requestId,
      );
  });
};

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    config.apiTrace ??= createApiRequestTrace(config.url || "unknown");
    const cookies = getCookies();
    const customProxy = getProxyUrl();
    const isGAS = Boolean((window as any).google?.script?.run);
    const userscript = isUserscriptRuntime();

    // Web/GAS cũ vẫn có thể dùng cookie được cấu hình thủ công.
    // Userscript không đọc/ghi cookie: request cùng origin để trình duyệt tự gửi session hiện tại.
    if (cookies && config.headers && !userscript) {
      config.headers["x-shopee-cookie"] = cookies;
    }

    if (isGAS && !customProxy) {
      config.adapter = gasAdapter;
      return config;
    }

    // Trong userscript đang chạy trực tiếp tại spx.shopee.vn, giữ URL tương đối.
    // Điều này tránh CORS/proxy và sử dụng chính phiên đăng nhập của tab hiện tại.
    if (userscript) {
      return config;
    }

    let targetBase = customProxy ? customProxy.trim() : "";
    if (
      !targetBase &&
      typeof window !== "undefined" &&
      !window.location.hostname.includes("localhost") &&
      !window.location.hostname.includes("127.0.0.1")
    ) {
      targetBase = "https://spx.shopee.vn";
    }

    if (targetBase && config.url) {
      if (targetBase.endsWith("/") && config.url.startsWith("/")) {
        config.url = targetBase + config.url.substring(1);
      } else if (!targetBase.endsWith("/") && !config.url.startsWith("/")) {
        config.url = targetBase + "/" + config.url;
      } else {
        config.url = targetBase + config.url;
      }
    }

    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error) => {
    safeLogApiError(createApiErrorRecord(error));
    const errorConfig = error?.config ?? error?.response?.config;

    if (errorConfig?.suppressErrorToast) {
      return Promise.reject(error);
    }

    if (error.response) {
      const serverMsg =
        error.response.statusText ||
        error.response.data?.msg ||
        error.response.data?.message ||
        "";

      switch (error.response.status) {
        case 401:
          showToast(
            isUserscriptRuntime()
              ? "Phiên đăng nhập SPX không còn hợp lệ. Vui lòng đăng nhập lại trên trang SPX."
              : "Cookie SPX đã hết hạn hoặc không hợp lệ. Vui lòng cập nhật trong Cài đặt!",
            "error",
          );
          break;
        case 403:
          showToast("Bạn không có quyền truy cập tính năng này!", "warning");
          break;
        case 404:
          showToast(`Lỗi 404: Không tìm thấy API! ${serverMsg}`, "error");
          break;
        case 500:
          showToast(`Lỗi máy chủ (500): ${serverMsg || "Sự cố kết nối từ Google Apps Script hoặc Shopee!"}`, "error");
          break;
        default:
          showToast(`Lỗi kết nối (${error.response.status}): ${serverMsg}`, "error");
      }
    } else if (error.request) {
      showToast("Không nhận được phản hồi từ server! Kiểm tra lại mạng hoặc phiên đăng nhập SPX.", "error");
    } else {
      showToast(`Lỗi khởi tạo yêu cầu: ${error.message}`, "error");
    }

    return Promise.reject(error);
  },
);

export default apiClient;
