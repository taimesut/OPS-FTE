import { useState } from "react";
import { getConfigs, saveConfigs, SCANNER_URL, type AppConfig } from "../utils/config";
import { showToast } from "../components/Toast";
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
  const [soc, setSoc] = useState(initialConfig.soc || "");
  const [cookies, setCookies] = useState(initialConfig.cookies || "");
  const [hubsText, setHubsText] = useState((initialConfig.hubs || []).join("\n"));
  const [socsText, setSocsText] = useState((initialConfig.socs || []).join("\n"));
  const [groupSocsText, setGroupSocsText] = useState(initialGroupSocsText);
  const [logUrl, setLogUrl] = useState(initialConfig.ggsheet_log_url || "");

  const handleSave = () => {
    const hubs = hubsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const socs = socsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

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

    const newConfig: AppConfig = {
      soc: soc.trim(),
      cookies: cookies.trim(),
      hubs,
      socs,
      group_socs,
      raw_group_socs_text: groupSocsText,
      ggsheet_log_url: logUrl.trim(),
      scanner_url: getConfigs().scanner_url,
    };

    saveConfigs(newConfig);
    showToast("Đã lưu cài đặt thành công!", "success");
  };

  const handleLoadSample = () => {
    setSoc("Pleiku SOC");
    setHubsText(
      "44-GLI An Khe Hub\n44-GLI Ayun Pa Hub\n44-GLI Chu Pah Hub\n44-GLI Chu Prong 02 Hub\n44-GLI Chu Prong Hub\n44-GLI Chu Puh Hub\n44-GLI Chu Se Hub\n44-GLI Dak Doa Hub\n44-GLI Duc Co Hub\n44-GLI Ia Grai Hub\n44-GLI Kbang Hub\n44-GLI Krong Pa Hub\n44-GLI Mang Yang Hub\n44-GLI MBH An Khe Hub\n44-GLI MBH Ayun Pa Hub\n44-GLI MBH Chu Prong Hub\n44-GLI MBH Dak Doa Hub\n44-GLI MBH Ia Grai Hub\n44-GLI Phu Thien Hub\n44-GLI Pleiku 02 Hub\n44-GLI Pleiku 03 Hub\n44-GLI Pleiku 04 Hub\n44-GLI Pleiku Hub"
    );
    setSocsText("DN Mega SOC\nBD A Mega SOC\nBD B Mega SOC\nBN A Mega SOC\nBN B Mega SOC\nHCM Mega SOC\nHN SOC\nBMT SOC\nKon Tum SOC");
    setGroupSocsText(
      "DN Mega SOC @Vinh SOC @Cam Xuyen SOC @Tuy Phuoc SOC @Tuy Hoa SOC @Quang Ngai SOC @Dien Khanh SOC @Dong Hoi SOC\nBD A Mega SOC @Phan Rang SOC @Duc Trong SOC\nBMT SOC @Gia Nghia SOC"
    );
    showToast("Đã điền dữ liệu mẫu Pleiku SOC!", "info");
  };

  const handleExportJSON = () => {
    const config = getConfigs();
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pleiku-soc-config-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Đã xuất tệp JSON cấu hình!", "info");
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
          setSoc(imported.soc || "");
          setCookies(imported.cookies || "");
          setHubsText((imported.hubs || []).join("\n"));
          setSocsText((imported.socs || []).join("\n"));
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
      setSoc("");
      setCookies("");
      setHubsText("");
      setSocsText("");
      setGroupSocsText("");
      setLogUrl("");
      showToast("Đã dọn dẹp cài đặt!", "info");
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-3 pb-32 sm:p-4 md:p-6 font-sans text-base-content space-y-5 md:space-y-6">
      {/* Header */}
      <div className="border-b border-base-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-primary/10 text-primary rounded-xl">
              <Settings className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight">
              Cài Đặt Cấu Hình
            </h1>
          </div>
          <p className="text-xs md:text-sm text-base-content/70 mt-1">
            Nhập Cookie SPX, Mã SOC nguồn, danh sách Hub, SOCs và Webhook nhận Log Sự Vụ
          </p>
        </div>

        {/* Action Header Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleLoadSample}
            className="btn btn-sm btn-ghost gap-1.5 rounded-xl text-primary font-bold bg-primary/10 hover:bg-primary/20"
            title="Tải dữ liệu mẫu Pleiku SOC"
          >
            <Sparkles className="w-4 h-4" /> Tải mẫu
          </button>
          <button
            onClick={handleExportJSON}
            className="btn btn-sm btn-outline gap-1.5 rounded-xl"
          >
            <Download className="w-4 h-4" /> Xuất JSON
          </button>
          <label className="btn btn-sm btn-outline gap-1.5 rounded-xl cursor-pointer">
            <Upload className="w-4 h-4" /> Nhập JSON
            <input
              type="file"
              accept=".json"
              onChange={handleImportJSON}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Form Fields Section */}
      <div className="space-y-6">
        {/* 1. Mã SOC hiện tại */}
        <div className="card bg-base-100 border border-base-200 shadow-xs rounded-2xl p-5 space-y-2">
          <label className="flex items-center gap-2 text-sm font-bold text-primary">
            <Building className="w-4 h-4" />
            1. Tên SOC
          </label>
          <input
            type="text"
            value={soc}
            onChange={(e) => setSoc(e.target.value)}
            placeholder="Ví dụ: 44-GLI Pleiku SOC"
            className="input input-bordered w-full focus:input-primary rounded-xl font-bold text-base"
          />
          <span className="text-xs text-base-content/60">
            Dùng làm tên nơi gửi khi kiểm tra các Transfer Order xuất kho.
          </span>
        </div>

        {/* 2. Cookie Shopee Express */}
        <div className="card bg-base-100 border border-base-200 shadow-xs rounded-2xl p-5 space-y-2">
          <label className="flex items-center justify-between text-sm font-bold text-secondary">
            <span className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              2. Cookie Shopee Express (SPX Cookie)
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
        <div className="card bg-base-100 border border-base-200 shadow-xs rounded-2xl p-5 space-y-2">
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
        <div className="card bg-base-100 border border-base-200 shadow-xs rounded-2xl p-5 space-y-2">
          <label className="flex items-center gap-2 text-sm font-bold text-info">
            <ScanLine className="w-4 h-4" />
            4. Scanner QR trực tiếp
          </label>
          <div className="flex flex-col gap-2 rounded-xl border border-info/20 bg-info/5 p-4">
            <span className="font-mono text-sm font-bold text-info break-all">{SCANNER_URL}</span>
            <span className="text-xs text-base-content/60">
              Link quét QR đã được cố định để mở camera live. Bạn vẫn có thể dùng nút chụp ảnh nếu trình duyệt không cấp quyền camera.
            </span>
          </div>
        </div>

        {/* 5. Hubs nội tỉnh */}
        <div className="card bg-base-100 border border-base-200 shadow-xs rounded-2xl p-5 space-y-2">
          <label className="flex items-center gap-2 text-sm font-bold text-accent">
            <MapPin className="w-4 h-4" />
            5. Danh sách Hubs Nội Tỉnh (Mỗi dòng 1 Hub)
          </label>
          <textarea
            value={hubsText}
            onChange={(e) => setHubsText(e.target.value)}
            rows={4}
            placeholder={`44-GLI Pleiku Hub\n44-GLI Pleiku 02 Hub\n44-GLI Pleiku 03 Hub\n44-GLI Pleiku 04 Hub`}
            className="textarea textarea-bordered w-full focus:textarea-primary rounded-xl font-medium text-sm leading-relaxed"
          ></textarea>
          <span className="text-xs text-base-content/60">
            Hiển thị trong danh sách chọn của trang Kiểm Tra Sót Nội Tỉnh.
          </span>
        </div>

        {/* 5. SOCs ngoại tỉnh */}
        <div className="card bg-base-100 border border-base-200 shadow-xs rounded-2xl p-5 space-y-2">
          <label className="flex items-center gap-2 text-sm font-bold text-warning">
            <Globe className="w-4 h-4" />
            6. Danh sách SOCs Ngoại Tỉnh (Mỗi dòng 1 SOC)
          </label>
          <textarea
            value={socsText}
            onChange={(e) => setSocsText(e.target.value)}
            rows={4}
            placeholder={`HN SOC\nHCM SOC\nDN Mega SOC`}
            className="textarea textarea-bordered w-full focus:textarea-primary rounded-xl font-medium text-sm leading-relaxed"
          ></textarea>
          <span className="text-xs text-base-content/60">
            Hiển thị trong danh sách chọn của trang Kiểm Tra Sót Ngoại Tỉnh.
          </span>
        </div>

        {/* 6. Nhóm SOCs ngoại tỉnh */}
        <div className="card bg-base-100 border border-base-200 shadow-xs rounded-2xl p-5 space-y-2">
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
      <div className="fixed bottom-0 left-0 right-0 px-3 pt-3 safe-bottom bg-base-100/90 backdrop-blur-md border-t border-base-200 z-30 shadow-2xl flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleReset}
          className="btn btn-sm min-h-11 btn-ghost text-error gap-1 rounded-xl"
        >
          <RefreshCw className="w-4 h-4 text-error" /> Xóa
        </button>

        <button
          type="button"
          onClick={handleSave}
          className="btn btn-primary min-h-11 gap-2 rounded-xl px-6 sm:px-8 shadow-md font-bold text-base"
        >
          <Save className="w-5 h-5" />
          Lưu Cài Đặt
        </button>
      </div>
    </div>
  );
};
