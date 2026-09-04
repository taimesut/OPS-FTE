import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building,
  CheckCircle2,
  CircleAlert,
  Download,
  Globe2,
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
    : "Không thể đọc dữ liệu SOC/Hub được tích hợp trong ứng dụng.";

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
            "Một số nhóm cũ đã được loại vì không còn khớp với dữ liệu SOC hiện tại.",
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
        "SOC vừa chọn đã được loại khỏi các nhóm không còn phù hợp. Hãy kiểm tra lại trước khi lưu.",
      );
    } else {
      setGroupAdjustmentMessage("");
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
      showToast("Hãy chọn SOC và chờ dữ liệu Hub tải xong trước khi lưu.", "error");
      return;
    }

    try {
      const nextConfig = buildStationConfig({
        previousConfig: getConfigs(),
        catalog,
        currentSocId: selectedSocId,
        hubs,
        groupSocs,
        cookies: "",
        logUrl,
      });
      saveConfigs({
        ...nextConfig,
        cookies: "",
        proxy_url: undefined,
      });
      savedConfigRef.current = {
        ...nextConfig,
        cookies: "",
        proxy_url: undefined,
      };
      setGroupAdjustmentMessage("");
      showToast("Đã lưu cấu hình SOC và Hub.", "success");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const handleExportJSON = () => {
    const current = getConfigs();
    const exportConfig = {
      ...current,
      cookies: "",
      proxy_url: undefined,
    };
    const blob = new Blob([JSON.stringify(exportConfig, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ops-fte-config-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Đã xuất cấu hình JSON (không chứa Cookie SPX).", "info");
  };

  const handleImportJSON = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (catalogState.status !== "ready") {
      showToast("Dữ liệu SOC chưa sẵn sàng. Vui lòng thử lại sau.", "error");
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
          throw new Error("SOC trong tệp nhập không tồn tại trong dữ liệu hiện tại.");
        }

        const importedExternalSocs = getExternalSocs(catalog, importedSocId);
        const nextGroups = reconcileGroupSocs(
          imported.group_socs,
          importedExternalSocs,
        );
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
        setLogUrl(importedLogUrl);
        setGroupAdjustmentMessage(
          "Đã đối chiếu cấu hình nhập với dữ liệu SOC/Hub tích hợp. Cookie và proxy cũ được bỏ qua.",
        );
        showToast(
          "Đã nạp cấu hình. Hãy kiểm tra rồi bấm Lưu Cài Đặt.",
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

  const handleReset = () => {
    if (!confirm("Bạn có chắc chắn muốn xóa toàn bộ cài đặt OPS FTE hiện tại?")) {
      return;
    }

    localStorage.removeItem("configs");
    savedConfigRef.current = { ...EMPTY_CONFIG };
    hubRequestRef.current += 1;
    setSelectedSocId("");
    setHubs([]);
    setHubState({ status: "idle" });
    setGroupSocs({});
    setGroupAdjustmentMessage("");
    setLogUrl("");
    showToast("Đã xóa toàn bộ cấu hình OPS FTE.", "info");
  };

  return (
    <div className="settings-page app-page max-w-4xl space-y-5 pb-24 text-base-content md:space-y-6">
      <PageHeader
        icon={Settings}
        title="Cài Đặt Cấu Hình"
        description="Chọn SOC và cấu hình vận hành. API sử dụng trực tiếp phiên đăng nhập SPX của tab hiện tại."
        actions={
          <div className="grid w-full gap-2 sm:flex sm:w-auto">
            <button
              type="button"
              onClick={handleExportJSON}
              className="btn btn-outline min-h-11 w-full gap-1.5 rounded-xl sm:w-auto"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Xuất JSON
            </button>
            <label
              aria-disabled={catalogState.status !== "ready"}
              className={`btn btn-outline min-h-11 w-full gap-1.5 rounded-xl sm:w-auto ${
                catalogState.status === "ready"
                  ? "cursor-pointer"
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

      <section className="app-surface p-4 sm:p-5" aria-labelledby="spx-session-heading">
        <div className="flex items-start gap-3">
          <span className="app-icon-badge shrink-0 bg-success/10 text-success">
            <Globe2 aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="spx-session-heading" className="font-bold">
                Phiên SPX hiện tại
              </h2>
              <span className="badge badge-success badge-outline font-semibold">
                Không cần nhập Cookie
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-base-content/65">
              OPS FTE chạy ngay trên SPX và gửi request cùng origin. Trình duyệt tự sử dụng phiên đăng nhập đang mở; ứng dụng không yêu cầu dán hoặc lưu Cookie SPX.
            </p>
          </div>
        </div>
      </section>

      <section className="app-surface space-y-4 p-4 sm:p-5" aria-labelledby="current-soc-heading">
        <div className="flex items-start gap-3">
          <span className="app-icon-badge shrink-0 bg-primary/10 text-primary">
            <Building aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="current-soc-heading" className="font-bold">
              SOC hiện tại
            </h2>
            <p className="mt-0.5 text-sm leading-relaxed text-base-content/65">
              Danh sách SOC và Hub được tích hợp sẵn trong userscript, không cần đọc Google Sheet khi chạy.
            </p>
          </div>
        </div>

        {catalogState.status === "loading" ? (
          <div className="flex min-h-12 items-center gap-2 text-sm text-base-content/60">
            <span className="loading loading-spinner loading-sm" />
            Đang nạp dữ liệu SOC...
          </div>
        ) : catalogState.status === "error" ? (
          <div role="alert" className="alert alert-error items-start">
            <CircleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">Không thể nạp dữ liệu SOC</p>
              <p className="mt-1 break-words text-sm">{catalogState.message}</p>
            </div>
            <button
              type="button"
              onClick={handleRetryCatalog}
              className="btn btn-sm min-h-10 gap-1.5"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Thử lại
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <StationSelect
              value={selectedSocId}
              options={catalog}
              onChange={handleSocChange}
              placeholder="Chọn SOC hiện tại"
              ariaLabel="Chọn SOC hiện tại"
            />

            {selectedSoc ? (
              <div className="grid gap-2 rounded-xl bg-base-200/50 p-3 text-sm sm:grid-cols-3">
                <div>
                  <span className="block text-xs text-base-content/50">Mã SOC</span>
                  <strong>{selectedSoc.stationCode}</strong>
                </div>
                <div>
                  <span className="block text-xs text-base-content/50">Station ID</span>
                  <strong>{selectedSoc.id}</strong>
                </div>
                <div>
                  <span className="block text-xs text-base-content/50">Prefix</span>
                  <strong>{selectedSoc.numberPrefix || "—"}</strong>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="app-surface space-y-4 p-4 sm:p-5" aria-labelledby="hub-heading">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="app-icon-badge shrink-0 bg-secondary/10 text-secondary">
              <MapPin aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="hub-heading" className="font-bold">Hub nội tỉnh</h2>
              <p className="mt-0.5 text-sm text-base-content/65">
                Tự động xác định theo SOC đã chọn.
              </p>
            </div>
          </div>
          {hubState.status === "ready" ? (
            <span className="badge badge-outline shrink-0 font-semibold">
              {hubs.length} Hub
            </span>
          ) : null}
        </div>

        {!selectedSocId ? (
          <p className="rounded-xl border border-dashed border-base-300 p-4 text-center text-sm text-base-content/55">
            Chọn SOC để xem danh sách Hub nội tỉnh.
          </p>
        ) : hubState.status === "loading" ? (
          <div className="flex min-h-12 items-center gap-2 text-sm text-base-content/60">
            <span className="loading loading-spinner loading-sm" />
            Đang tải Hub...
          </div>
        ) : hubState.status === "error" ? (
          <div role="alert" className="alert alert-error items-start">
            <CircleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">Không thể nạp Hub</p>
              <p className="mt-1 break-words text-sm">{hubState.message}</p>
            </div>
            <button
              type="button"
              onClick={handleRetryHubs}
              className="btn btn-sm min-h-10 gap-1.5"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Thử lại
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {hubs.length ? (
              hubs.map((hub) => (
                <span
                  key={hub.id}
                  className="badge badge-lg h-auto min-h-8 max-w-full whitespace-normal py-1 text-left"
                  title={`${hub.stationCode} · ID ${hub.id}`}
                >
                  {hub.stationName}
                </span>
              ))
            ) : (
              <p className="text-sm text-base-content/55">
                SOC này chưa có Hub nội tỉnh trong dữ liệu hiện tại.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="app-surface space-y-4 p-4 sm:p-5" aria-labelledby="soc-group-heading">
        <div>
          <h2 id="soc-group-heading" className="font-bold">
            Nhóm SOC ngoại tỉnh
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-base-content/65">
            Gộp nhiều SOC vào một lựa chọn khi kiểm tra sót ngoại tỉnh.
          </p>
        </div>

        {groupAdjustmentMessage ? (
          <div role="alert" className="alert alert-warning text-sm">
            <CircleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{groupAdjustmentMessage}</span>
          </div>
        ) : null}

        <SocGroupEditor
          options={externalSocs}
          groups={groupSocs}
          onChange={setGroupSocs}
          disabled={!selectedSocId || catalogState.status !== "ready"}
        />
      </section>

      <section className="app-surface space-y-4 p-4 sm:p-5" aria-labelledby="integration-heading">
        <div>
          <h2 id="integration-heading" className="font-bold">
            Tiện ích bổ sung
          </h2>
          <p className="mt-1 text-sm text-base-content/65">
            Các kết nối này không dùng để gọi API SPX.
          </p>
        </div>

        <label className="form-control w-full">
          <span className="label-text mb-2 font-semibold">
            Webhook Google Sheet nhận log sự vụ
          </span>
          <input
            type="url"
            value={logUrl}
            onChange={(event) => setLogUrl(event.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
            className="input input-bordered min-h-11 w-full rounded-xl"
          />
          <span className="mt-1 text-xs text-base-content/55">
            Chỉ dùng cho tính năng gửi log biên bản sự vụ.
          </span>
        </label>

        <div className="rounded-xl border border-base-200 p-3">
          <div className="flex items-start gap-3">
            <ScanLine className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold">QR Scanner</p>
              <p className="mt-1 break-all text-xs text-base-content/60">
                {SCANNER_URL}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="app-surface p-4 sm:p-5" aria-labelledby="reset-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="reset-heading" className="font-bold">Đặt lại cấu hình</h2>
            <p className="mt-1 text-sm text-base-content/60">
              Xóa SOC, nhóm, Hub đã lưu và webhook khỏi trình duyệt này.
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="btn btn-outline btn-error min-h-11 gap-2 rounded-xl"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Xóa toàn bộ
          </button>
        </div>
      </section>

      <MobileActionBar>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="btn btn-primary min-h-12 w-full gap-2 rounded-xl shadow-lg sm:w-auto sm:min-w-48"
        >
          {canSave ? (
            <Save className="h-5 w-5" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-5 w-5 opacity-50" aria-hidden="true" />
          )}
          Lưu Cài Đặt
        </button>
      </MobileActionBar>
    </div>
  );
};
