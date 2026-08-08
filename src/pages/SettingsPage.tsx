import { useState } from "react";
import { getConfigs, saveConfigs, SCANNER_URL, type AppConfig } from "../utils/config";
import {
  createStationIdMap,
  formatStationEntry,
  parseStationLines,
  validateUniqueStations,
} from "../utils/stations";
import { showToast } from "../components/Toast";
import { MobileActionBar } from "../components/MobileActionBar";
import { PageHeader } from "../components/PageHeader";
import { DEFAULT_STATION_CONFIG } from "../config/defaultStationConfig";
import {
  Settings,
  Key,
  Building,
  MapPin,
  Globe,
  Share2,
  Save,
  Download,
  Upload,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  FileSpreadsheet,
  ScanLine,
} from "lucide-react";

export const SettingsPage = () => {
  const [initialConfig] = useState(() => getConfigs());
  const initialGroupSocsText = initialConfig.raw_group_socs_text
    || Object.values(initialConfig.group_socs || {}).map((list) => list.join(" @ ")).join("\n");
  const [socText, setSocText] = useState(
    formatStationEntry(initialConfig.soc || "", initialConfig.soc_id),
  );
  const [cookies, setCookies] = useState(initialConfig.cookies || "");
  const [hubsText, setHubsText] = useState(
    (initialConfig.hubs || [])
      .map((name) => formatStationEntry(name, initialConfig.hub_ids?.[name]))
      .join("\n"),
  );
  const [socsText, setSocsText] = useState(
    (initialConfig.socs || [])
      .map((name) => formatStationEntry(name, initialConfig.soc_ids?.[name]))
      .join("\n"),
  );
  const [groupSocsText, setGroupSocsText] = useState(initialGroupSocsText);
  const [logUrl, setLogUrl] = useState(initialConfig.ggsheet_log_url || "");

  const handleSave = () => {
    try {
      const sourceEntries = parseStationLines(socText, "SOC nguồn");
      if (sourceEntries.length !== 1) {
        throw new Error("SOC nguồn phải có đúng một dòng theo định dạng Tên | ID.");
      }
      const hubEntries = parseStationLines(hubsText, "Hub nội tỉnh");
      const socEntries = parseStationLines(socsText, "SOC ngoại tỉnh");
      validateUniqueStations([...sourceEntries, ...hubEntries, ...socEntries]);
      const source = sourceEntries[0];

    const group_socs: Record<string, string[]> = {};
    const groupLines = groupSocsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    groupLines.forEach((line) => {
      const parts = line.split("@").map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) {
        group_socs[parts[0]] = parts;
      }
    });

      const configuredSocNames = new Set(socEntries.map(({ name }) => name));
      const missingGroupSoc = Object.values(group_socs)
        .flat()
        .find((name) => !configuredSocNames.has(name));
      if (missingGroupSoc) {
        throw new Error(`SOC "${missingGroupSoc}" trong nhóm chưa có dòng Tên | ID ở danh sách SOC ngoại tỉnh.`);
      }

      const previousConfig = getConfigs();
      const newConfig: AppConfig = {
      ...previousConfig,
      soc: source.name,
      soc_id: source.id,
      cookies: cookies.trim(),
      hubs: hubEntries.map(({ name }) => name),
      hub_ids: createStationIdMap(hubEntries),
      socs: socEntries.map(({ name }) => name),
      soc_ids: createStationIdMap(socEntries),
      group_socs,
      raw_group_socs_text: groupSocsText,
      ggsheet_log_url: logUrl.trim(),
      scanner_url: getConfigs().scanner_url,
      };

      saveConfigs(newConfig);
      showToast("Đã lưu cấu hình Tên và ID trạm thành công!", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Cấu hình trạm không hợp lệ.", "error");
    }
  };

  const handleExportJSON = () => {
    const config = getConfigs();
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `station-config-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Đã xuất tệp JSON cấu hình!", "info");
  };

  const handleLoadSample = () => {
    const hasFormData = [socText, cookies, hubsText, socsText, groupSocsText, logUrl]
      .some((value) => value.trim());
    if (hasFormData && !confirm("Tải mẫu sẽ thay thế dữ liệu đang hiển thị trên form. Tiếp tục?")) {
      return;
    }

    setSocText(formatStationEntry(DEFAULT_STATION_CONFIG.soc, DEFAULT_STATION_CONFIG.soc_id));
    setCookies("");
    setHubsText(DEFAULT_STATION_CONFIG.hubs.map((name) =>
      formatStationEntry(name, DEFAULT_STATION_CONFIG.hub_ids?.[name])).join("\n"));
    setSocsText(DEFAULT_STATION_CONFIG.socs.map((name) =>
      formatStationEntry(name, DEFAULT_STATION_CONFIG.soc_ids?.[name])).join("\n"));
    setGroupSocsText(DEFAULT_STATION_CONFIG.raw_group_socs_text || "");
    setLogUrl("");
    showToast("Đã điền mẫu Hub/SOC và ID. Hãy nhập Cookie rồi bấm Lưu Cài Đặt.", "info");
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (typeof imported === "object" && imported !== null) {
          saveConfigs(imported);
          setSocText(formatStationEntry(imported.soc || "", imported.soc_id));
          setCookies(imported.cookies || "");
          setHubsText((imported.hubs || []).map((name: string) =>
            formatStationEntry(name, imported.hub_ids?.[name])).join("\n"));
          setSocsText((imported.socs || []).map((name: string) =>
            formatStationEntry(name, imported.soc_ids?.[name])).join("\n"));
          setLogUrl(imported.ggsheet_log_url || "");
          if (imported.raw_group_socs_text) {
            setGroupSocsText(imported.raw_group_socs_text);
          } else if (imported.group_socs) {
            const lines = Object.values(
              imported.group_socs as Record<string, string[]>
            ).map((list) => list.join(" @ "));
            setGroupSocsText(lines.join("\n"));
          }
          showToast("Đã nhập cấu hình JSON thành công!", "success");
        }
      } catch {
        showToast("Tệp JSON không hợp lệ!", "error");
      }
    };
    reader.readAsText(file);
  };

  const handleReset = () => {
    if (confirm("Bạn có chắc chắn muốn xóa tất cả cài đặt hiện tại?")) {
      localStorage.removeItem("configs");
      setSocText("");
      setCookies("");
      setHubsText("");
      setSocsText("");
      setGroupSocsText("");
      setLogUrl("");
      showToast("Đã dọn dẹp cài đặt!", "info");
    }
  };

  return (
    <div className="settings-page app-page max-w-4xl space-y-5 text-base-content md:space-y-6">
      <PageHeader
        icon={Settings}
        title="Cài Đặt Cấu Hình"
        description="Nhập Cookie SPX, Mã SOC nguồn, danh sách Hub, SOCs và Webhook nhận Log Sự Vụ"
        actions={
          <div className="grid w-full gap-2 sm:flex sm:w-auto">
          <button
            type="button"
            onClick={handleLoadSample}
            className="btn min-h-11 w-full btn-ghost gap-1.5 rounded-xl bg-primary/10 font-bold text-primary hover:bg-primary/20 sm:w-auto"
          >
            <Sparkles className="w-4 h-4" /> Tải mẫu
          </button>
          <button
            onClick={handleExportJSON}
            className="btn min-h-11 w-full btn-outline gap-1.5 rounded-xl sm:w-auto"
          >
            <Download className="w-4 h-4" /> Xuất JSON
          </button>
          <label className="btn min-h-11 w-full cursor-pointer btn-outline gap-1.5 rounded-xl sm:w-auto">
            <Upload className="w-4 h-4" /> Nhập JSON
            <input
              type="file"
              accept=".json"
              onChange={handleImportJSON}
              className="hidden"
            />
          </label>
          </div>
        }
      />

      {/* Form Fields Section */}
      <div className="space-y-6">
        {/* 1. Mã SOC hiện tại */}
        <div className="app-surface space-y-2 p-4 sm:p-5">
          <label className="flex items-center gap-2 text-sm font-bold text-primary">
            <Building className="w-4 h-4" />
            1. SOC nguồn (Tên | ID)
          </label>
          <input
            type="text"
            value={socText}
            onChange={(e) => setSocText(e.target.value)}
            placeholder="Ví dụ: SOC nguồn | 1001"
            className="input input-bordered w-full focus:input-primary rounded-xl font-bold text-base"
          />
          <span className="text-xs text-base-content/60">
            Tên dùng để lọc TO; ID dùng làm current_station_ids khi kiểm tra hàng xá lẻ.
          </span>
        </div>

        {/* 2. Cookie Shopee Express */}
        <div className="app-surface space-y-2 p-4 sm:p-5">
          <label className="flex flex-col items-start gap-2 text-sm font-bold text-secondary sm:flex-row sm:items-center sm:justify-between">
            <span className="flex min-w-0 items-start gap-2">
              <Key className="w-4 h-4" />
              <span className="break-safe">2. Cookie Shopee Express (SPX Cookie)</span>
            </span>
            {cookies ? (
              <span className="badge badge-success badge-sm gap-1">
                <CheckCircle2 className="w-3 h-3" /> Đã nhập
              </span>
            ) : (
              <span className="badge badge-warning badge-sm">Chưa có</span>
            )}
          </label>
          <textarea
            value={cookies}
            onChange={(e) => setCookies(e.target.value)}
            rows={4}
            placeholder="Dán chuỗi cookie (SPC_EC=..., SPC_SI=...) thu thập từ trang spx.shopee.vn"
            className="textarea textarea-bordered w-full focus:textarea-primary rounded-xl font-mono text-xs leading-relaxed"
          ></textarea>
          <span className="text-xs text-base-content/60">
            Cookie giúp xác thực các yêu cầu tra cứu dữ liệu đơn hàng tới Shopee Express.
          </span>
        </div>

        {/* 3. Link Google Sheet Log Sự Vụ */}
        <div className="app-surface space-y-2 p-4 sm:p-5">
          <label className="flex items-center gap-2 text-sm font-bold text-success">
            <FileSpreadsheet className="w-4 h-4" />
            3. Link Google Sheet / GAS Web App URL nhận Log Sự Vụ
          </label>
          <input
            type="text"
            value={logUrl}
            onChange={(e) => setLogUrl(e.target.value)}
            placeholder="Ví dụ: https://script.google.com/macros/s/AKfycb.../exec"
            className="input input-bordered w-full focus:input-primary rounded-xl font-mono text-xs"
          />
          <span className="text-xs text-base-content/60">
            Khi bấm "Gửi Log Sự Vụ", dữ liệu 2 cột (LH TRIP và Đơn sự vụ) sẽ được gửi POST về Webhook này.
          </span>
        </div>

        {/* 4. Scanner live */}
        <div className="app-surface space-y-2 p-4 sm:p-5">
          <label className="flex items-center gap-2 text-sm font-bold text-info">
            <ScanLine className="w-4 h-4" />
            4. Scanner QR trực tiếp
          </label>
          <div className="flex flex-col gap-2 rounded-xl border border-info/20 bg-info/5 p-4">
            <span className="break-safe font-mono text-sm font-bold text-info">{SCANNER_URL}</span>
            <span className="text-xs text-base-content/60">
              Link quét QR đã được cố định để mở camera live. Bạn vẫn có thể dùng nút chụp ảnh nếu trình duyệt không cấp quyền camera.
            </span>
          </div>
        </div>

        {/* 5. Hubs nội tỉnh */}
        <div className="app-surface space-y-2 p-4 sm:p-5">
          <label className="flex items-center gap-2 text-sm font-bold text-accent">
            <MapPin className="w-4 h-4" />
            5. Hubs nội tỉnh — mỗi dòng Tên | ID
          </label>
          <textarea
            value={hubsText}
            onChange={(e) => setHubsText(e.target.value)}
            rows={4}
            placeholder={`Hub Alpha | 2001\nHub Beta | 2002`}
            className="textarea textarea-bordered w-full focus:textarea-primary rounded-xl font-medium text-sm leading-relaxed"
          ></textarea>
          <span className="text-xs text-base-content/60">
            Tên hiển thị trong danh sách; ID được gửi tới API hàng xá lẻ.
          </span>
        </div>

        {/* 5. SOCs ngoại tỉnh */}
        <div className="app-surface space-y-2 p-4 sm:p-5">
          <label className="flex items-center gap-2 text-sm font-bold text-warning">
            <Globe className="w-4 h-4" />
            6. SOCs ngoại tỉnh — mỗi dòng Tên | ID
          </label>
          <textarea
            value={socsText}
            onChange={(e) => setSocsText(e.target.value)}
            rows={4}
            placeholder={`HN SOC | 2001\nHCM SOC | 2002\nDN Mega SOC | 2003`}
            className="textarea textarea-bordered w-full focus:textarea-primary rounded-xl font-medium text-sm leading-relaxed"
          ></textarea>
          <span className="text-xs text-base-content/60">
            Tên hiển thị và dùng cho receiver; ID dùng cho API hàng xá lẻ.
          </span>
        </div>

        {/* 6. Nhóm SOCs ngoại tỉnh */}
        <div className="app-surface space-y-2 p-4 sm:p-5">
          <label className="flex items-center gap-2 text-sm font-bold text-info">
            <Share2 className="w-4 h-4" />
            7. Cấu hình Nhóm SOC Ngoại Tỉnh (Ký tự @ phân cách)
          </label>
          <textarea
            value={groupSocsText}
            onChange={(e) => setGroupSocsText(e.target.value)}
            rows={4}
            placeholder={`DN Mega SOC @ Vinh SOC @ Cam Xuyen SOC`}
            className="textarea textarea-bordered w-full focus:textarea-primary rounded-xl font-medium text-sm leading-relaxed"
          ></textarea>
          <span className="text-xs text-base-content/60">
            Khi chọn SOC đầu tiên, hệ thống sẽ gom tất cả các SOC phụ sau ký tự <code className="bg-base-200 px-1 py-0.5 rounded font-mono text-primary">@</code> để tìm kiếm.
          </span>
        </div>
      </div>

      {/* Sticky Bottom Save Bar for Mobile */}
      <MobileActionBar className="md:mt-2">
        <button
          type="button"
          onClick={handleReset}
          className="btn min-h-11 self-start btn-ghost text-error gap-1 rounded-xl"
        >
          <RefreshCw className="w-4 h-4 text-error" /> Xóa
        </button>

        <button
          type="button"
          onClick={handleSave}
          className="btn min-h-11 w-full gap-2 rounded-xl px-4 text-base font-bold shadow-md sm:w-auto sm:px-8"
        >
          <Save className="w-5 h-5" />
          Lưu Cài Đặt
        </button>
      </MobileActionBar>
    </div>
  );
};
