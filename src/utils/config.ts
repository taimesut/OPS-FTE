export interface AppConfig {
  soc: string;
  soc_id?: string;
  soc_code?: string;
  number_prefix?: string;
  hubs: string[];
  hub_ids?: Record<string, string>;
  hub_codes?: Record<string, string>;
  socs: string[];
  soc_ids?: Record<string, string>;
  soc_codes?: Record<string, string>;
  group_socs: Record<string, string[]>;
  raw_group_socs_text?: string;
  ggsheet_log_url?: string;
  scanner_url?: string;
}

export const SCANNER_URL = "https://scan-qr.taimesut.net";

type LegacyAppConfig = Partial<AppConfig> & {
  cookies?: unknown;
  proxy_url?: unknown;
};

const emptyConfig = (): AppConfig => ({
  soc: "",
  hubs: [],
  socs: [],
  group_socs: {},
});

export const getConfigs = (): AppConfig => {
  try {
    const raw = localStorage.getItem("configs");
    if (!raw) return emptyConfig();

    const parsed = JSON.parse(raw) as LegacyAppConfig;
    const {
      cookies: legacyCookies,
      proxy_url: legacyProxyUrl,
      ...currentConfig
    } = parsed;
    void legacyCookies;
    void legacyProxyUrl;

    const normalized: AppConfig = {
      ...emptyConfig(),
      ...currentConfig,
      hubs: Array.isArray(parsed.hubs) ? parsed.hubs : [],
      socs: Array.isArray(parsed.socs) ? parsed.socs : [],
      group_socs:
        parsed.group_socs && typeof parsed.group_socs === "object"
          ? parsed.group_socs
          : {},
    };

    // Tự dọn dữ liệu legacy để Cookie/proxy cũ không còn nằm trong localStorage.
    if ("cookies" in parsed || "proxy_url" in parsed) {
      localStorage.setItem("configs", JSON.stringify(normalized));
    }

    return normalized;
  } catch {
    return emptyConfig();
  }
};

export const saveConfigs = (configs: AppConfig) => {
  localStorage.setItem("configs", JSON.stringify(configs));
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
