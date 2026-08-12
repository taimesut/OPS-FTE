import { useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  CheckCircle2,
  ClipboardList,
  Gem,
  LayoutDashboard,
  Package,
  PackageCheck,
  RefreshCw,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { InternalHubOverviewTable } from "../components/InternalHubOverviewTable";
import { PageHeader } from "../components/PageHeader";
import { SectionHeading } from "../components/SectionHeading";
import { showToast } from "../components/Toast";
import { TOTable } from "../components/TOTable";
import {
  getCookies,
  getHubs,
  getSoc,
  getSocId,
  getStationId,
} from "../utils/config";
import {
  beginHubRefresh,
  createInitialHubRows,
  finishHubRefresh,
  getOverviewCooldownRemaining,
  mergeHubBranchResult,
  OVERVIEW_COOLDOWN_MS,
  OVERVIEW_HUB_CONCURRENCY,
  runWithConcurrency,
  startOverviewCooldown,
  summarizeOverview,
  validateOverviewConfig,
  type BranchResult,
  type HubDefinition,
  type HubOverviewRow,
} from "../utils/internalHubOverview";
import {
  fetchHubOverviewBranches,
  type HubBranchResults,
} from "../utils/internalHubOverviewApi";

const COOLDOWN_TICK_MS = 1_000;
const DETAIL_STORAGE_KEY = "tuy-chon-overview-noi-tinh";

const numberFormatter = new Intl.NumberFormat("vi-VN");
const updatedAtFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Asia/Bangkok",
});

const readHubs = (): HubDefinition[] =>
  getHubs().map((name) => ({ name, id: getStationId(name) }));

const formatCountdown = (milliseconds: number): string => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = seconds % 60;
  return `${String(minutesPart).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}`;
};

const formatUpdatedAt = (value: number | null): string => {
  if (value === null) return "Chưa có dữ liệu cập nhật";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Chưa có dữ liệu cập nhật"
    : `Cập nhật gần nhất: ${updatedAtFormatter.format(date)}`;
};

const replaceHubRow = (
  rows: readonly HubOverviewRow[],
  hub: HubDefinition,
  update: (row: HubOverviewRow) => HubOverviewRow,
): HubOverviewRow[] => {
  const existingIndex = rows.findIndex((row) => row.name === hub.name);
  const source =
    existingIndex === -1
      ? createInitialHubRows([hub])[0]
      : { ...rows[existingIndex], name: hub.name, id: hub.id };
  const next = update(source);

  if (existingIndex === -1) return [...rows, next];
  return rows.map((row, index) => (index === existingIndex ? next : row));
};

const reconcileRows = (
  rows: readonly HubOverviewRow[],
  hubs: readonly HubDefinition[],
): HubOverviewRow[] => {
  const byName = new Map(rows.map((row) => [row.name, row]));
  return hubs.map((hub) => {
    const row = byName.get(hub.name);
    return row ? { ...row, id: hub.id } : createInitialHubRows([hub])[0];
  });
};

const failedBranches = (message: string): HubBranchResults => {
  const failure: BranchResult<never> = { ok: false, error: message };
  return { loose: failure, packed: failure };
};

interface SummaryCardProps {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
  description: string;
  tone: string;
}

const SummaryCard = ({
  icon: Icon,
  label,
  value,
  description,
  tone,
}: SummaryCardProps) => (
  <article className="app-surface min-w-0 p-3 sm:p-4">
    <div className="flex min-w-0 items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="break-safe text-xs font-bold uppercase tracking-wide text-base-content/55">
          {label}
        </p>
        <p className="mt-1 break-safe text-2xl font-black tabular-nums text-base-content md:text-3xl">
          {value}
        </p>
      </div>
      <span className={`app-icon-badge shrink-0 ${tone}`}>
        <Icon aria-hidden="true" />
      </span>
    </div>
    <p className="mt-2 break-safe text-xs leading-relaxed text-base-content/60">
      {description}
    </p>
  </article>
);

export const InternalHubOverviewPage = () => {
  const [soc, setSoc] = useState(() => getSoc());
  const [hubs, setHubs] = useState<HubDefinition[]>(readHubs);
  const [rows, setRows] = useState<HubOverviewRow[]>(() =>
    createInitialHubRows(readHubs()),
  );
  const [selectedHubName, setSelectedHubName] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(() =>
    getOverviewCooldownRemaining(localStorage, Date.now()),
  );
  const mountedRef = useRef(false);
  const generationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;

    const intervalId = window.setInterval(() => {
      setCooldownRemaining(
        getOverviewCooldownRemaining(localStorage, Date.now()),
      );
    }, COOLDOWN_TICK_MS);

    return () => window.clearInterval(intervalId);
  }, [cooldownRemaining]);

  const totals = useMemo(() => summarizeOverview(rows), [rows]);
  const selectedRow = useMemo(
    () => rows.find((row) => row.name === selectedHubName) ?? null,
    [rows, selectedHubName],
  );

  const handleRefresh = async () => {
    const currentCooldown = getOverviewCooldownRemaining(
      localStorage,
      Date.now(),
    );
    if (running || currentCooldown > 0) {
      if (currentCooldown > 0) setCooldownRemaining(currentCooldown);
      return;
    }

    const currentSoc = getSoc();
    const currentSocId = getSocId();
    const cookies = getCookies();
    const currentHubs = readHubs();
    const validationError = validateOverviewConfig({
      soc: currentSoc,
      socId: currentSocId,
      cookies,
      hubs: currentHubs,
    });

    if (validationError) {
      showToast(`${validationError} Vui lòng kiểm tra lại trong Cài đặt.`, "error");
      return;
    }

    const startedAt = Date.now();
    startOverviewCooldown(localStorage, startedAt);
    setCooldownRemaining(OVERVIEW_COOLDOWN_MS);
    setRunning(true);
    setSoc(currentSoc);
    setHubs(currentHubs);
    setRows((currentRows) => reconcileRows(currentRows, currentHubs));

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const isCurrentRun = () =>
      mountedRef.current && generationRef.current === generation;

    const tasks = currentHubs.map((hub) => async () => {
      if (isCurrentRun()) {
        setRows((currentRows) =>
          replaceHubRow(currentRows, hub, beginHubRefresh),
        );
      }

      let branches: HubBranchResults;
      try {
        branches = await fetchHubOverviewBranches(
          currentSoc,
          currentSocId,
          hub,
          Math.floor(Date.now() / 1_000),
        );
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Không thể tải dữ liệu.";
        branches = failedBranches(message);
      }

      if (isCurrentRun()) {
        setRows((currentRows) =>
          replaceHubRow(currentRows, hub, (row) => {
            const withLoose = mergeHubBranchResult(
              row,
              "loose",
              branches.loose,
            );
            const withPacked = mergeHubBranchResult(
              withLoose,
              "packed",
              branches.packed,
            );
            return finishHubRefresh(withPacked, Date.now());
          }),
        );
      }

      return { hubName: hub.name, branches };
    });

    let runResults: Awaited<ReturnType<(typeof tasks)[number]>>[];
    try {
      runResults = await runWithConcurrency(tasks, OVERVIEW_HUB_CONCURRENCY);
    } finally {
      if (isCurrentRun()) setRunning(false);
    }

    if (!isCurrentRun()) return;
    const hubsWithErrors = runResults.filter(
      ({ branches }) => !branches.loose.ok || !branches.packed.ok,
    ).length;

    if (hubsWithErrors === 0) {
      showToast(
        `Đã kiểm tra xong toàn bộ ${runResults.length} Hub.`,
        "success",
      );
    } else {
      showToast(
        `Hoàn tất kiểm tra, có ${hubsWithErrors} Hub chứa lỗi.`,
        "warning",
      );
    }
  };

  const refreshLabel = running
    ? "Đang kiểm tra toàn bộ Hub"
    : cooldownRemaining > 0
      ? `Làm mới sau ${formatCountdown(cooldownRemaining)}`
      : totals.latestUpdatedAt
        ? "Làm mới"
        : "Kiểm tra toàn bộ";

  return (
    <div className="app-page space-y-5 text-base-content md:space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Overview nội tỉnh"
        description={`Tổng quan hàng xá lẻ và hàng đã đóng bao từ ${soc || "SOC nguồn"} tới toàn bộ Hub nội tỉnh`}
        actions={
          <button
            type="button"
            className="btn btn-primary min-h-11 w-full gap-2 rounded-xl shadow-xs sm:w-auto"
            disabled={running || cooldownRemaining > 0}
            onClick={handleRefresh}
          >
            {running ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {refreshLabel}
          </button>
        }
      />

      <section aria-label="Chỉ số tổng quan" className="space-y-2">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <SummaryCard
            icon={CheckCircle2}
            label="Hub hoàn tất"
            value={`${totals.completedHubs}/${totals.totalHubs}`}
            description="Hub có kết quả gần nhất"
            tone="bg-success/10 text-success"
          />
          <SummaryCard
            icon={Boxes}
            label="Hàng xá lẻ"
            value={numberFormatter.format(totals.looseTotal)}
            description="Tổng đơn chưa đóng bao"
            tone="bg-primary/10 text-primary"
          />
          <SummaryCard
            icon={ClipboardList}
            label="Transfer Order"
            value={numberFormatter.format(totals.packedTo)}
            description="Tổng TO đã đóng bao"
            tone="bg-secondary/10 text-secondary"
          />
          <SummaryCard
            icon={Package}
            label="Số kiện"
            value={numberFormatter.format(totals.packedQuantity)}
            description="Tổng kiện trong TO"
            tone="bg-info/10 text-info"
          />
          <SummaryCard
            icon={ShieldAlert}
            label="Bao DG"
            value={numberFormatter.format(totals.packedDg)}
            description="Bao có hàng nguy hiểm"
            tone="bg-warning/10 text-warning"
          />
          <SummaryCard
            icon={Gem}
            label="Bao GTC"
            value={numberFormatter.format(totals.packedGtc)}
            description="Bao có hàng giá trị cao"
            tone="bg-error/10 text-error"
          />
        </div>
        <p className="break-safe text-xs font-medium text-base-content/60">
          {formatUpdatedAt(totals.latestUpdatedAt)}
        </p>
      </section>

      <section aria-labelledby="internal-hub-overview-heading" className="space-y-3">
        <SectionHeading
          icon={LayoutDashboard}
          id="internal-hub-overview-heading"
          title="Tổng quan theo Hub"
          description="So sánh hàng xá lẻ và hàng đã đóng bao của từng Hub nội tỉnh"
          tone="primary"
        />

        {hubs.length === 0 ? (
          <div className="app-surface flex min-h-56 flex-col items-center justify-center p-6 text-center sm:p-10">
            <span className="app-icon-badge bg-base-200 text-base-content/45">
              <Settings aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-lg font-black">Chưa cấu hình Hub nội tỉnh</h3>
            <p className="mt-1 max-w-md break-safe text-sm leading-relaxed text-base-content/60">
              Vào Cài đặt để thêm danh sách Hub và station ID trước khi kiểm tra toàn bộ.
            </p>
          </div>
        ) : (
          <InternalHubOverviewTable
            rows={rows}
            totals={totals}
            selectedHubName={selectedHubName}
            onSelectHub={(name) =>
              setSelectedHubName((current) => (current === name ? null : name))
            }
          />
        )}
      </section>

      {selectedRow?.packed.hasData ? (
        <section aria-labelledby="overview-hub-detail" className="space-y-3">
          <SectionHeading
            icon={PackageCheck}
            id="overview-hub-detail"
            title={`Chi tiết TO — ${selectedRow.name}`}
            description={`${selectedRow.packed.orders.length} Transfer Order trong kết quả gần nhất`}
            tone="success"
          />
          {selectedRow.packed.stale && selectedRow.packed.error ? (
            <div role="alert" className="alert alert-warning break-safe">
              Đang hiển thị kết quả cũ: {selectedRow.packed.error}
            </div>
          ) : null}
          <TOTable
            orders={selectedRow.packed.orders}
            storageKey={DETAIL_STORAGE_KEY}
            emptyTitle={`Không có TO sót tới ${selectedRow.name}`}
            emptyDescription="Hub này không có Transfer Order trong kết quả kiểm tra gần nhất."
          />
        </section>
      ) : null}
    </div>
  );
};
