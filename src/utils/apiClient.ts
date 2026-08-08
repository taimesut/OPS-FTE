/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { type InternalAxiosRequestConfig, type AxiosResponse } from "axios";
import { getCookies, getProxyUrl } from "./config";
import { showToast } from "../components/Toast";

declare module "axios" {
  interface AxiosRequestConfig {
    suppressErrorToast?: boolean;
  }
}

const apiClient = axios.create({
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Custom adapter cho Google Apps Script Server-side UrlFetchApp
const gasAdapter = (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
  return new Promise<AxiosResponse>((resolve, reject) => {
    const google = (window as any).google;
    const cookies = getCookies();
    const endpoint = config.url || "";

    console.log("[GAS Adapter Request]", { endpoint, method: config.method });

    google.script.run
      .withSuccessHandler((res: any) => {
        console.log("[GAS Adapter Response Success]", res);
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

          console.error("[GAS Adapter Response Error]", res);

          reject({
            response: {
              data: res ? res.data : null,
              status: res ? res.status : 500,
              statusText: errMsg,
              headers: {},
              config,
            },
          });
        }
      })
      .withFailureHandler((err: any) => {
        console.error("[GAS Adapter Execution Failure]", err);
        const errMsg = err?.message || err?.toString() || "Lỗi thực thi hàm Apps Script";
        reject({
          message: errMsg,
          config,
        });
      })
      .fetchShopeeApi(endpoint, cookies, config.method || "get", config.data);
  });
};

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const cookies = getCookies();
    const customProxy = getProxyUrl();
    const isGAS = Boolean((window as any).google?.script?.run);

    if (cookies && config.headers) {
      config.headers["x-shopee-cookie"] = cookies;
    }

    // Nếu chạy trên Google Apps Script Web App:
    if (isGAS && !customProxy) {
      config.adapter = gasAdapter;
      return config;
    }

    // Môi trường thông thường:
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
  (error) => {
    console.error("[API Request Interceptor Error]", error);
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error) => {
    console.error("[API Response Error Object]", error);

    if (error.config?.suppressErrorToast) {
      return Promise.reject(error);
    }

    if (error.response) {
      const serverMsg =
        error.response.statusText ||
        error.response.data?.msg ||
        error.response.data?.message ||
        "";

      console.error("[API Response Error Detail]", {
        status: error.response.status,
        data: error.response.data,
        message: serverMsg,
      });

      switch (error.response.status) {
        case 401:
          showToast("Cookie SPX đã hết hạn hoặc không hợp lệ. Vui lòng cập nhật trong Cài đặt!", "error");
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
      showToast("Không nhận được phản hồi từ server! Kiểm tra lại mạng hoặc Cookie SPX.", "error");
    } else {
      showToast(`Lỗi khởi tạo yêu cầu: ${error.message}`, "error");
    }

    return Promise.reject(error);
  }
);

export default apiClient;
