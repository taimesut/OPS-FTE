export interface AppConfig {
  soc: string;
  soc_id?: string;
  cookies: string;
  hubs: string[];
  hub_ids?: Record<string, string>;
  socs: string[];
  soc_ids?: Record<string, string>;
  group_socs: Record<string, string[]>;
  raw_group_socs_text?: string;
  proxy_url?: string;
  ggsheet_log_url?: string;
  scanner_url?: string;
}

export const SCANNER_URL = "https://scan-qr.taimesut.net";

export const getConfigs = (): AppConfig => {
  try {
    const raw = localStorage.getItem("configs");
    if (!raw) return { soc: "", cookies: "", hubs: [], socs: [], group_socs: {} };
    return JSON.parse(raw);
  } catch {
    return { soc: "", cookies: "", hubs: [], socs: [], group_socs: {} };
  }
};

export const saveConfigs = (configs: AppConfig) => {
  localStorage.setItem("configs", JSON.stringify(configs));
};

export const getProxyUrl = (): string => {
  const configs = getConfigs();
  return configs.proxy_url || "";
};

export const getLogUrl = (): string => {
  const configs = getConfigs();
  return configs.ggsheet_log_url || "";
};

export const getScannerUrl = (): string => {
  return SCANNER_URL;
};

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

export const getCookies = (): string => {
  const configs = getConfigs();
  return configs.cookies || "";
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
