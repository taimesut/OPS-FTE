export interface AppConfig {
  soc: string;
  soc_id?: string;
  soc_code?: string;
  number_prefix?: string;
  /** @deprecated Userscript trên SPX dùng browser session hiện tại. */
  cookies: string;
  hubs: string[];
  hub_ids?: Record<string, string>;
  hub_codes?: Record<string, string>;
  socs: string[];
  soc_ids?: Record<string, string>;
  soc_codes?: Record<string, string>;
  group_socs: Record<string, string[]>;
  raw_group_socs_text?: string;
  /** @deprecated Userscript trên SPX không cần proxy. */
  proxy_url?: string;
  ggsheet_log_url?: string;
  scanner_url?: string;
}

export const SCANNER_URL = "https://scan-qr.taimesut.net";

const emptyConfig = (): AppConfig => ({
  soc: "",
  cookies: "",
  hubs: [],
  socs: [],
  group_socs: {},
});

export const getConfigs = (): AppConfig => {
  try {
    const raw = localStorage.getItem("configs");
    if (!raw) return emptyConfig();
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return {
      ...emptyConfig(),
      ...parsed,
      hubs: Array.isArray(parsed.hubs) ? parsed.hubs : [],
      socs: Array.isArray(parsed.socs) ? parsed.socs : [],
      group_socs:
        parsed.group_socs && typeof parsed.group_socs === "object"
          ? parsed.group_socs
          : {},
    };
  } catch {
    return emptyConfig();
  }
};

export const saveConfigs = (configs: AppConfig) => {
  localStorage.setItem("configs", JSON.stringify(configs));
};

export const clearCookies = (): AppConfig => {
  const nextConfig = { ...getConfigs(), cookies: "" };
  saveConfigs(nextConfig);
  return nextConfig;
};

export const getProxyUrl = (): string => {
  const configs = getConfigs();
  return configs.proxy_url || "";
};

export const getLogUrl = (): string => {
  const configs = getConfigs();
  return configs.ggsheet_log_url || "";
};

export const getScannerUrl = (): string => SCANNER_URL;

export const getGroupSocsBySOC = (soc: string): string[] => {
  const groups = getGroupSocs();
  return groups[soc] ?? [soc];
};

export const getGroupSocs = (): Record<string, string[]> => {
  const configs = getConfigs();
  return configs.group_socs || {};
};

export const getHubs = (): string[] => {
  const configs = getConfigs();
  return configs.hubs || [];
};

export const getSocs = (): string[] => {
  const configs = getConfigs();
  return configs.socs || [];
};

/**
 * Compatibility shim cho các màn hình cũ còn kiểm tra `getCookies()`.
 * Trên SPX, giá trị này chỉ báo rằng browser session hiện tại được sử dụng;
 * nó KHÔNG phải nội dung Cookie và không được gửi thủ công qua API client.
 */
export const getCookies = (): string => {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname === "spx.shopee.vn" || hostname.endsWith(".spx.shopee.vn")) {
      return "browser-session";
    }
  }
  return getConfigs().cookies || "";
};

export const getSoc = (): string => {
  const configs = getConfigs();
  return configs.soc || "";
};

export const getSocId = (): string => getConfigs().soc_id || "";

export const getStationId = (name: string): string => {
  const configs = getConfigs();
  if (name === configs.soc) return configs.soc_id || "";
  return configs.hub_ids?.[name] || configs.soc_ids?.[name] || "";
};

export const getStationIds = (names: string[]): string[] =>
  names.map(getStationId).filter(Boolean);
