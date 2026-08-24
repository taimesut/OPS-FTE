import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Database,
  Download,
  FileSpreadsheet,
  Globe2,
  Key,
  MapPin,
  RefreshCw,
  Save,
  ScanLine,
  Settings,
  Trash2,
  Upload,
} from "lucide-react";
import { MobileActionBar } from "../components/MobileActionBar";
import { PageHeader } from "../components/PageHeader";
import { SocGroupEditor } from "../components/SocGroupEditor";
import { StationSelect } from "../components/StationSelect";
import { showToast } from "../components/Toast";
import {
  clearCookies,
  getConfigs,
  saveConfigs,
  SCANNER_URL,
  type AppConfig,
} from "../utils/config";
import {
  buildStationConfig,
  findConfiguredSocId,
  getExternalSocs,
  reconcileGroupSocs,
  type ConfiguredSocReference,
} from "../utils/stationConfiguration";
import {
  loadStationCatalog,
  loadStationHubs,
  type StationCatalogHub,
  type StationCatalogSoc,
} from "../utils/stationCatalog";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

const EMPTY_CONFIG: AppConfig = {
  soc: "",
  cookies: "",
  hubs: [],
  socs: [],
  group_socs: {},
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim()
    ? error.message
    : "Không thể tải dữ liệu LIST SOC.";

const areGroupsEqual = (
  first: Record<string, string[]>,
  second: Record<string, string[]>,
): boolean => JSON.stringify(first) === JSON.stringify(second);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readImportedReference = (
  imported: Record<string, unknown>,
): ConfiguredSocReference => ({
  soc: typeof imported.soc === "string" ? imported.soc : undefined,
  soc_id: typeof imported.soc_id === "string" ? imported.soc_id : undefined,
  soc_code:
    typeof imported.soc_code === "string" ? imported.soc_code : undefined,
});

export const SettingsPage = () => {
  const [initialConfig] = useState(() => getConfigs());
  const savedConfigRef = useRef(initialConfig);
  const hubRequestRef = useRef(0);

  const [cookies, setCookies] = useState(initialConfig.cookies || "");
  const [hasSavedCookies, setHasSavedCookies] = useState(
    Boolean(initialConfig.cookies),
  );
  const [logUrl, setLogUrl] = useState(initialConfig.ggsheet_log_url || "");
  const [catalog, setCatalog] = useState<StationCatalogSoc[]>([]);
  const [catalogState, setCatalogState] = useState<LoadState>({
    status: "loading",
  });
  const [catalogRetryToken, setCatalogRetryToken] = useState(0);
  const [selectedSocId, setSelectedSocId] = useState("");
  const [hubs, setHubs] = useState<StationCatalogHub[]>([]);
  const [hubState, setHubState] = useState<LoadState>({ status: "idle" });
  const [hubRetryToken, setHubRetryToken] = useState(0);
  const [groupSocs, setGroupSocs] = useState<Record<string, string[]>>({});
  const [groupAdjustmentMessage, setGroupAdjustmentMessage] = useState("");

  const selectedSoc = useMemo(
    () => catalog.find(({ id }) => id === selectedSocId),
    [catalog, selectedSocId],
  );
  const externalSocs = useMemo(
    () =>
      selectedSocId ? getExternalSocs(catalog, selectedSocId) : [],
    [catalog, selectedSocId],
  );
  const canSave =
    catalogState.status === "ready" &&
    hubState.status === "ready" &&
    Boolean(selectedSoc);

  useEffect(() => {
    let cancelled = false;

    loadStationCatalog().then(
      (nextCatalog) => {
        if (cancelled) return;

        const savedConfig = savedConfigRef.current;
        const matchedSocId = findConfiguredSocId(savedConfig, nextCatalog);
        const nextExternalSocs = matchedSocId
          ? getExternalSocs(nextCatalog, matchedSocId)
          : [];
        const nextGroups = reconcileGroupSocs(
          savedConfig.group_socs,
          nextExternalSocs,
        );

        setCatalog(nextCatalog);
        setCatalogState({ status: "ready" });
        setSelectedSocId(matchedSocId);
        setHubs([]);
        setHubState(
          matchedSocId ? { status: "loading" } : { status: "idle" },
        );
        setGroupSocs(nextGroups);

        if (
          Object.keys(savedConfig.group_socs || {}).length > 0 &&
          !areGroupsEqual(savedConfig.group_socs || {}, nextGroups)
        ) {
          setGroupAdjustmentMessage(
            "Một số nhóm cũ đã được loại vì không còn phù hợp với LIST SOC.",
          );
        } else {
          setGroupAdjustmentMessage("");
        }
      },
      (error) => {
        if (cancelled) return;
        hubRequestRef.current += 1;
        setCatalog([]);
        setCatalogState({ status: "error", message: getErrorMessage(error) });
        setSelectedSocId("");
        setHubs([]);
        setHubState({ status: "idle" });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [catalogRetryToken]);

  useEffect(() => {
    if (!selectedSocId || catalogState.status !== "ready") return;

    const requestId = ++hubRequestRef.current;
    loadStationHubs(selectedSocId).then(
      (nextHubs) => {
        if (requestId !== hubRequestRef.current) return;
        setHubs(nextHubs);
        setHubState({ status: "ready" });
      },
      (error) => {
        if (requestId !== hubRequestRef.current) return;
        setHubs([]);
        setHubState({ status: "error", message: getErrorMessage(error) });
      },
    );
  }, [catalogState.status, hubRetryToken, selectedSocId]);

  const handleSocChange = (socId: string) => {
    hubRequestRef.current += 1;
    setSelectedSocId(socId);
    setHubs([]);
    setHubState(socId ? { status: "loading" } : { status: "idle" });

    const nextExternalSocs = socId ? getExternalSocs(catalog, socId) : [];
    const nextGroups = reconcileGroupSocs(groupSocs, nextExternalSocs);
    if (!areGroupsEqual(groupSocs, nextGroups)) {
      setGroupAdjustmentMessage(
        "SOC vừa chọn đã được loại khỏi các nhóm đại diện hoặc thành viên. Hãy kiểm tra lại trước khi lưu.",
      );
    }
    setGroupSocs(nextGroups);
  };

  const handleRetryCatalog = () => {
    hubRequestRef.current += 1;
    setCatalog([]);
    setCatalogState({ status: "loading" });
    setSelectedSocId("");
    setHubs([]);
    setHubState({ status: "idle" });
    setCatalogRetryToken((current) => current + 1);
  };

  const handleRetryHubs = () => {
    if (!selectedSocId) return;
    hubRequestRef.current += 1;
    setHubs([]);
    setHubState({ status: "loading" });
    setHubRetryToken((current) => current + 1);
  };

  const handleSave = () => {
    if (!canSave) {
      showToast("Hãy tải xong LIST SOC và Hub nội tỉnh trước khi lưu.", "error");
      return;
    }

    try {
      const nextConfig = buildStationConfig({
        previousConfig: getConfigs(),
        catalog,
        currentSocId: selectedSocId,
        hubs,
        groupSocs,
        cookies,
        logUrl,
      });
      saveConfigs(nextConfig);
      savedConfigRef.current = nextConfig;
      setHasSavedCookies(Boolean(nextConfig.cookies));
      setGroupAdjustmentMessage("");
      showToast("Đã lưu cấu hình SOC và Hub từ LIST SOC.", "success");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const handleExportJSON = () => {
    const config = getConfigs();
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `station-config-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Đã xuất tệp JSON cấu hình.", "info");
  };

  const handleImportJSON = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (catalogState.status !== "ready") {
      showToast("Cần tải LIST SOC thành công trước khi nhập cấu hình.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      try {
        const imported = JSON.parse(String(readerEvent.target?.result || ""));
        if (!isRecord(imported)) throw new Error("Tệp JSON không hợp lệ.");

        const importedSocId = findConfiguredSocId(
          readImportedReference(imported),
          catalog,
        );
        if (!importedSocId) {
          throw new Error("SOC trong tệp nhập không còn tồn tại trong LIST SOC.");
        }

        const importedExternalSocs = getExternalSocs(catalog, importedSocId);
        const nextGroups = reconcileGroupSocs(
          imported.group_socs,
          importedExternalSocs,
        );
        const importedCookies =
          typeof imported.cookies === "string" ? imported.cookies : "";
        const importedLogUrl =
          typeof imported.ggsheet_log_url === "string"
            ? imported.ggsheet_log_url
            : "";

        hubRequestRef.current += 1;
        setSelectedSocId(importedSocId);
        setHubs([]);
        setHubState({ status: "loading" });
        setHubRetryToken((current) => current + 1);
        setGroupSocs(nextGroups);
        setCookies(importedCookies);
        setLogUrl(importedLogUrl);
        setGroupAdjustmentMessage(
          "Cấu hình nhập đã được đối chiếu với LIST SOC. Hub nội tỉnh đang được tải lại từ sheet.",
        );
        showToast(
          "Đã nạp cấu hình vào biểu mẫu. Hãy kiểm tra rồi bấm Lưu Cài Đặt.",
          "info",
        );
      } catch (error) {
        showToast(getErrorMessage(error), "error");
      }
    };
    reader.onerror = () => {
      showToast("Không thể đọc tệp JSON đã chọn.", "error");
    };
    reader.readAsText(file);
  };

  const handleClearCookies = () => {
    if (!cookies.trim() && !hasSavedCookies) return;
    if (!confirm("Bạn có chắc chắn muốn xóa Cookie SPX đã lưu?")) return;

    try {
      const nextConfig = clearCookies();
      savedConfigRef.current = nextConfig;
      setCookies("");
      setHasSavedCookies(false);
      showToast(
        "Đã xóa Cookie SPX. Các cấu hình khác được giữ nguyên.",
        "success",
      );
    } catch {
      showToast("Không thể xóa Cookie SPX. Vui lòng thử lại.", "error");
    }
  };

  const handleReset = () => {
    if (!confirm("Bạn có chắc chắn muốn xóa tất cả cài đặt hiện tại?")) return;

    localStorage.removeItem("configs");
    savedConfigRef.current = { ...EMPTY_CONFIG };
    hubRequestRef.current += 1;
    setSelectedSocId("");
    setHubs([]);
    setHubState({ status: "idle" });
    setCookies("");
    setHasSavedCookies(false);
    setGroupSocs({});
    setGroupAdjustmentMessage("");
    setLogUrl("");
    showToast("Đã xóa toàn bộ cấu hình local.", "info");
  };

  return (
    <div className="settings-page app-page max-w-4xl space-y-5 text-base-content md:space-y-6">
      <PageHeader
        icon={Settings}
        title="Cài Đặt Cấu Hình"
        description="Chọn SOC từ LIST SOC, quản lý Cookie và các kết nối vận hành"
        actions={
          <div className="grid w-full gap-2 sm:flex sm:w-auto">
            <button
              type="button"
              onClick={handleExportJSON}
              className="btn btn-outline min-h-11 w-full touch-manipulation gap-1.5 rounded-xl active:opacity-70 sm:w-auto"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Xuất JSON
            </button>
            <label
              aria-disabled={catalogState.status !== "ready"}
              className={`btn btn-outline min-h-11 w-full gap-1.5 rounded-xl sm:w-auto ${
                catalogState.status === "ready"
                  ? "cursor-pointer touch-manipulation active:opacity-70"
                  : "btn-disabled cursor-not-allowed opacity-50"
              }`}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Nhập JSON
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleImportJSON}
                disabled={catalogState.status !== "ready"}
                className="hidden"
              />
            </label>
          </div>
        }
      />

      <div className="space-y-5">
        <section className="app-surface space-y-4 p-4 sm:p-5" aria-labelledby="current-soc-heading">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Building className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="current-soc-heading" className="font-bold text-base-content">
                SOC hiện tại
              </h2>
              <p className="mt-0.5 text-sm leading-relaxed text-base-content/65">
                Danh sách được đọc trực tiếp từ sheet LIST SOC.
              </p>
            </div>
          </div>

          {catalogState.status === "loading" ? (
            <div className="space-y-2" aria-live="polite" aria-label="Đang tải LIST SOC">
              <div className="h-11 animate-pulse rounded-xl bg-base-200" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-base-200" />
            </div>
          ) : null}

          {catalogState.status === "error" ? (
            <div role="alert" className="rounded-2xl border border-error/25 bg-error/10 p-4 text-error">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">Không tải được LIST SOC</p>
                  <p className="mt-1 break-words text-sm leading-relaxed">{catalogState.message}</p>
                  <button
                    type="button"
                    onClick={handleRetryCatalog}
                    className="btn btn-error btn-outline mt-3 min-h-11 touch-manipulation gap-2 rounded-xl active:opacity-70"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Thử lại
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {catalogState.status === "ready" ? (
            <div className="space-y-3">
              <StationSelect
                value={selectedSocId}
                options={catalog}
                onChange={handleSocChange}
                placeholder="Chọn SOC hiện tại"
                ariaLabel="Chọn SOC hiện tại"
              />
              {!selectedSocId ? (
                <p className="text-sm leading-relaxed text-base-content/60">
                  Chọn một SOC để hệ thống tải Hub nội tỉnh từ cột E.
                </p>
              ) : null}
            </div>
          ) : null}

          {hubState.status === "loading" ? (
            <div className="rounded-2xl border border-info/20 bg-info/10 p-4" aria-live="polite">
              <p className="font-bold text-info">Đang tải Hub nội tỉnh...</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="h-14 animate-pulse rounded-xl bg-info/10" />
                ))}
              </div>
            </div>
          ) : null}

          {hubState.status === "error" ? (
            <div role="alert" className="rounded-2xl border border-error/25 bg-error/10 p-4 text-error">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">Không tải được Hub nội tỉnh</p>
                  <p className="mt-1 break-words text-sm leading-relaxed">{hubState.message}</p>
                  <button
                    type="button"
                    onClick={handleRetryHubs}
                    className="btn btn-error btn-outline mt-3 min-h-11 touch-manipulation gap-2 rounded-xl active:opacity-70"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Thử lại
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {selectedSoc && hubState.status === "ready" ? (
            <div className="rounded-2xl border border-success/25 bg-success/5 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Dữ liệu SOC đã sẵn sàng
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <div>
                  <dt className="text-xs font-semibold text-base-content/55">Tên SOC</dt>
                  <dd className="mt-1 break-words text-sm font-bold">{selectedSoc.stationName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-base-content/55">Mã SOC</dt>
                  <dd className="mt-1 break-words font-mono text-sm font-bold">{selectedSoc.stationCode}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-base-content/55">ID / Prefix</dt>
                  <dd className="mt-1 font-mono text-sm font-bold">
                    {selectedSoc.id} / {selectedSoc.numberPrefix || "Chưa có"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-base-content/55">Hub nội tỉnh</dt>
                  <dd className="mt-1 text-sm font-bold tabular-nums">{hubs.length} Hub</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </section>

        <section className="app-surface space-y-3 p-4 sm:p-5" aria-labelledby="cookie-heading">
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="cookie-heading" className="flex items-center gap-2 font-bold text-secondary">
              <Key className="h-4 w-4" aria-hidden="true" />
              Cookie Shopee Express
            </h2>
            {cookies ? (
              <span className="badge badge-success badge-sm gap-1">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Đã nhập
              </span>
            ) : (
              <span className="badge badge-warning badge-sm">Chưa có</span>
            )}
          </div>
          <textarea
            value={cookies}
            onChange={(event) => setCookies(event.target.value)}
            rows={4}
            aria-label="Cookie Shopee Express"
            placeholder="Dán chuỗi Cookie SPX"
            className="textarea textarea-bordered w-full rounded-xl font-mono text-base leading-relaxed focus:textarea-primary sm:text-xs"
          />
          <p className="text-xs leading-relaxed text-base-content/60">
            Cookie chỉ được lưu trong localStorage của trình duyệt này.
          </p>
          <div className="flex justify-end border-t border-base-200 pt-3">
            <button
              type="button"
              onClick={handleClearCookies}
              disabled={!cookies.trim() && !hasSavedCookies}
              className="btn btn-outline min-h-11 touch-manipulation gap-2 rounded-xl border-error/30 text-error active:opacity-70 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Xóa Cookie
            </button>
          </div>
        </section>

        <section className="app-surface space-y-3 p-4 sm:p-5" aria-labelledby="log-heading">
          <h2 id="log-heading" className="flex items-center gap-2 font-bold text-success">
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            Google Sheet Log Sự Vụ
          </h2>
          <input
            type="url"
            value={logUrl}
            onChange={(event) => setLogUrl(event.target.value)}
            aria-label="URL nhận Log Sự Vụ"
            placeholder="https://script.google.com/macros/s/.../exec"
            className="input input-bordered w-full rounded-xl font-mono text-base focus:input-primary sm:text-xs"
          />
          <p className="text-xs leading-relaxed text-base-content/60">
            Webhook nhận dữ liệu khi gửi Log Sự Vụ.
          </p>
        </section>

        <section className="app-surface space-y-3 p-4 sm:p-5" aria-labelledby="scanner-heading">
          <h2 id="scanner-heading" className="flex items-center gap-2 font-bold text-info">
            <ScanLine className="h-4 w-4" aria-hidden="true" />
            Scanner QR trực tiếp
          </h2>
          <div className="rounded-2xl border border-info/20 bg-info/5 p-4">
            <p className="break-words font-mono text-sm font-bold text-info">{SCANNER_URL}</p>
            <p className="mt-1 text-xs leading-relaxed text-base-content/60">
              Đường dẫn scanner được cố định trong ứng dụng.
            </p>
          </div>
        </section>

        {selectedSoc && hubState.status === "ready" ? (
          <details className="app-surface group p-4 sm:p-5">
            <summary className="flex min-h-11 cursor-pointer list-none touch-manipulation items-center justify-between gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-primary">
              <span className="flex items-center gap-2 font-bold">
                <Database className="h-4 w-4 text-primary" aria-hidden="true" />
                Dữ liệu đã nạp
              </span>
              <span className="flex items-center gap-2 text-xs font-semibold text-base-content/60">
                {hubs.length} Hub / {externalSocs.length} SOC ngoại tỉnh
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              </span>
            </summary>
            <div className="mt-4 grid gap-5 border-t border-base-200 pt-4 lg:grid-cols-2">
              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-bold text-accent">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  Hub nội tỉnh
                </h3>
                {hubs.length ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                    {hubs.map((hub) => (
                      <div key={hub.id} className="rounded-xl bg-base-200/70 px-3 py-2.5">
                        <p className="break-words text-sm font-semibold">{hub.stationName}</p>
                        <p className="mt-0.5 break-words font-mono text-xs text-base-content/55">
                          {hub.stationCode} / ID {hub.id}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-base-300 p-4 text-sm text-base-content/60">
                    SOC này chưa có Hub nội tỉnh trong cột E.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-bold text-warning">
                  <Globe2 className="h-4 w-4" aria-hidden="true" />
                  SOC ngoại tỉnh
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  {externalSocs.map((soc) => (
                    <div key={soc.id} className="rounded-xl bg-base-200/70 px-3 py-2.5">
                      <p className="break-words text-sm font-semibold">{soc.stationName}</p>
                      <p className="mt-0.5 break-words font-mono text-xs text-base-content/55">
                        {soc.stationCode} / ID {soc.id}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </details>
        ) : null}

        {catalogState.status === "ready" && selectedSoc ? (
          <section className="app-surface space-y-4 p-4 sm:p-5" aria-labelledby="group-heading">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-info/10 text-info">
                <Globe2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 id="group-heading" className="font-bold">Group SOC ngoại tỉnh</h2>
                <p className="mt-0.5 text-sm leading-relaxed text-base-content/65">
                  Chỉ tạo nhóm khi một SOC đại diện cần tra cứu thêm SOC thành viên.
                </p>
              </div>
            </div>

            {groupAdjustmentMessage ? (
              <div role="alert" className="flex items-start gap-2 rounded-2xl border border-warning/30 bg-warning/10 p-3 text-sm font-semibold text-warning-content">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="break-words">{groupAdjustmentMessage}</span>
              </div>
            ) : null}

            <SocGroupEditor
              options={externalSocs}
              groups={groupSocs}
              onChange={setGroupSocs}
            />
          </section>
        ) : null}
      </div>

      <MobileActionBar className="md:mt-2">
        <button
          type="button"
          onClick={handleReset}
          className="btn btn-ghost min-h-11 self-start touch-manipulation gap-1 rounded-xl text-error active:opacity-70"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Xóa toàn bộ
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="btn btn-primary min-h-11 w-full touch-manipulation gap-2 rounded-xl px-4 text-base font-bold shadow-md active:opacity-80 disabled:cursor-not-allowed sm:w-auto sm:px-8"
        >
          <Save className="h-5 w-5" aria-hidden="true" />
          Lưu Cài Đặt
        </button>
      </MobileActionBar>
    </div>
  );
};
