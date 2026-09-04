/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
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

/**
 * API client dùng URL tương đối.
 * - Userscript trên spx.shopee.vn: browser tự gửi session đăng nhập hiện tại.
 * - Local dev: Vite proxy xử lý các route /api như trước.
 *
 * Không đọc, lưu, inject hoặc forward Cookie SPX thủ công.
 */
const apiClient = axios.create({
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    config.apiTrace ??= createApiRequestTrace(config.url || "unknown");
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
            "Phiên đăng nhập SPX không còn hợp lệ. Vui lòng đăng nhập lại trên trang SPX.",
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
          showToast(
            `Lỗi máy chủ (500): ${serverMsg || "SPX đang gặp sự cố xử lý yêu cầu."}`,
            "error",
          );
          break;
        default:
          showToast(
            `Lỗi kết nối (${error.response.status}): ${serverMsg}`,
            "error",
          );
      }
    } else if (error.request) {
      showToast(
        "Không nhận được phản hồi từ SPX. Kiểm tra mạng hoặc phiên đăng nhập hiện tại.",
        "error",
      );
    } else {
      showToast(`Lỗi khởi tạo yêu cầu: ${error.message}`, "error");
    }

    return Promise.reject(error);
  },
);

export default apiClient;
