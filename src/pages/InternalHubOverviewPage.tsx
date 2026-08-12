import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  getOverviewHubCooldownRemaining,
  mergeHubBranchResult,
  OVERVIEW_COOLDOWN_MS,
  OVERVIEW_HUB_COOLDOWN_MS,
  OVERVIEW_HUB_CONCURRENCY,
  runWithConcurrency,
  startOverviewCooldown,
  startOverviewHubCooldown,
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

const hubKey = (hub: Pick<HubDefinition, "id" | "name">): string =>
  hub.id.trim() || hub.name;

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

type GenerationGuard = (generation: number) => boolean;

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
  const [hubCooldownRemaining, setHubCooldownRemaining] = useState<
    Record<string, number>
  >(() =>
    Object.fromEntries(
      readHubs().map((hub) => [
        hubKey(hub),
        getOverviewHubCooldownRemaining(localStorage, hubKey(hub), Date.now()),
      ]),
    ),
  );
  const [hubRunning, setHubRunning] = useState<Record<string, boolean>>({});
  const [packedResultGenerations, setPackedResultGenerations] = useState<
    Record<string, number>
  >({});
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const activeGenerationsRef = useRef(new Set<number>());
  const activeHubRequestsRef = useRef(new Set<string>());
  const globalRunningRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    const activeGenerations = activeGenerationsRef.current;
    const activeHubRequests = activeHubRequestsRef.current;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      activeGenerations.clear();
      activeHubRequests.clear();
      globalRunningRef.current = false;
    };
  }, []);

  useEffect(() => {
    const hasActiveCooldown =
      cooldownRemaining > 0 ||
      Object.values(hubCooldownRemaining).some((remaining) => remaining > 0);
    if (!hasActiveCooldown) return;

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setCooldownRemaining(getOverviewCooldownRemaining(localStorage, now));
      setHubCooldownRemaining((current) => {
        let changed = false;
        const next: Record<string, number> = {};
        Object.keys(current).forEach((key) => {
          const remaining = getOverviewHubCooldownRemaining(
            localStorage,
            key,
            now,
          );
          if (remaining > 0) next[key] = remaining;
          if (remaining !== current[key]) changed = true;
        });
        return changed ? next : current;
      });
    }, COOLDOWN_TICK_MS);

    return () => window.clearInterval(intervalId);
  }, [cooldownRemaining, hubCooldownRemaining]);

  const totals = useMemo(() => summarizeOverview(rows), [rows]);
  const hasLooseData = useMemo(
    () => rows.some((row) => row.loose.data !== null),
    [rows],
  );
  const hasPackedData = useMemo(
    () => rows.some((row) => row.packed.hasData),
    [rows],
  );
  const selectedRow = useMemo(
    () => rows.find((row) => row.name === selectedHubName) ?? null,
    [rows, selectedHubName],
  );

  const targetedRunning = Object.values(hubRunning).some(Boolean);
  const beginGeneration = () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    activeGenerationsRef.current.add(generation);
    return generation;
  };
  const isCurrentGeneration = (generation: number): boolean =>
    mountedRef.current && activeGenerationsRef.current.has(generation);

  const refreshHubData = useCallback(
    async (
      hub: HubDefinition,
      currentSoc: string,
      currentSocId: string,
      generation: number,
      isCurrentRun: GenerationGuard,
    ): Promise<{ hubName: string; branches: HubBranchResults }> => {
      if (isCurrentRun(generation)) {
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

      if (isCurrentRun(generation)) {
        if (branches.packed.ok) {
          setPackedResultGenerations((current) => ({
            ...current,
            [hub.name]: (current[hub.name] ?? 0) + 1,
          }));
        }
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
    },
    [],
  );

  const canRunHub = (hub: HubDefinition): boolean => {
    const key = hubKey(hub);
    return (
      !running &&
      !globalRunningRef.current &&
      !hubRunning[key] &&
      !activeHubRequestsRef.current.has(key) &&
      getOverviewHubCooldownRemaining(localStorage, key, Date.now()) <= 0
    );
  };

  const handleRefresh = async () => {
    const currentCooldown = getOverviewCooldownRemaining(
      localStorage,
      Date.now(),
    );
    if (
      running ||
      globalRunningRef.current ||
      targetedRunning ||
      activeHubRequestsRef.current.size > 0 ||
      currentCooldown > 0
    ) {
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
    setHubCooldownRemaining((current) =>
      Object.fromEntries(
        currentHubs.map((hub) => {
          const key = hubKey(hub);
          return [
            key,
            Math.max(
              current[key] ?? 0,
              getOverviewHubCooldownRemaining(localStorage, key, Date.now()),
            ),
          ];
        }),
      ),
    );
    setHubRunning((current) =>
      Object.fromEntries(
        currentHubs.map((hub) => [hubKey(hub), current[hubKey(hub)] ?? false]),
      ),
    );
    setRows((currentRows) => reconcileRows(currentRows, currentHubs));

    globalRunningRef.current = true;
    const generation = beginGeneration();
    const isCurrentRun: GenerationGuard = (candidateGeneration) =>
      isCurrentGeneration(candidateGeneration);

    const tasks = currentHubs.map((hub) => async () => {
      const key = hubKey(hub);
      startOverviewHubCooldown(localStorage, key, Date.now());
      if (isCurrentRun(generation)) {
        setHubCooldownRemaining((current) => ({
          ...current,
          [key]: OVERVIEW_HUB_COOLDOWN_MS,
        }));
        setHubRunning((current) => ({ ...current, [key]: true }));
      }

      let branches: HubBranchResults;
      try {
        const result = await refreshHubData(
          hub,
          currentSoc,
          currentSocId,
          generation,
          isCurrentRun,
        );
        branches = result.branches;
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Không thể tải dữ liệu.";
        branches = failedBranches(message);
      }

      if (isCurrentRun(generation)) {
        setHubRunning((current) => ({ ...current, [key]: false }));
      }

      return { hubName: hub.name, branches };
    });

    let runResults: Awaited<ReturnType<(typeof tasks)[number]>>[];
    try {
      runResults = await runWithConcurrency(tasks, OVERVIEW_HUB_CONCURRENCY);
    } finally {
      const shouldUpdate = isCurrentRun(generation);
      globalRunningRef.current = false;
      if (shouldUpdate) setRunning(false);
    }

    if (!isCurrentGeneration(generation)) return;
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
    activeGenerationsRef.current.delete(generation);
  };

  const handleHubRefresh = async (requestedHub: HubDefinition) => {
    if (!canRunHub(requestedHub)) return;

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

    const hub = currentHubs.find(
      (candidate) =>
        candidate.name === requestedHub.name || candidate.id === requestedHub.id,
    );
    if (!hub) return;

    const key = hubKey(hub);
    const currentCooldown = getOverviewHubCooldownRemaining(
      localStorage,
      key,
      Date.now(),
    );
    if (
      running ||
      globalRunningRef.current ||
      activeHubRequestsRef.current.has(key) ||
      currentCooldown > 0
    ) {
      if (currentCooldown > 0) {
        setHubCooldownRemaining((current) => ({
          ...current,
          [key]: currentCooldown,
        }));
      }
      return;
    }

    startOverviewHubCooldown(localStorage, key, Date.now());
    activeHubRequestsRef.current.add(key);
    setHubCooldownRemaining((current) => ({
      ...current,
      [key]: OVERVIEW_HUB_COOLDOWN_MS,
    }));
    setHubRunning((current) => ({ ...current, [key]: true }));
    setSoc(currentSoc);
    setHubs(currentHubs);
    setRows((currentRows) => reconcileRows(currentRows, currentHubs));

    const generation = beginGeneration();
    const isCurrentRun: GenerationGuard = (candidateGeneration) =>
      isCurrentGeneration(candidateGeneration);
    try {
      const result = await refreshHubData(
        hub,
        currentSoc,
        currentSocId,
        generation,
        isCurrentRun,
      );
      if (!isCurrentRun(generation)) return;
      const hasError = !result.branches.loose.ok || !result.branches.packed.ok;
      showToast(
        hasError
          ? `Đã cập nhật ${hub.name}, nhưng có nhánh lỗi.`
          : `Đã cập nhật ${hub.name}.`,
        hasError ? "warning" : "success",
      );
    } finally {
      const shouldUpdate = isCurrentGeneration(generation);
      activeHubRequestsRef.current.delete(key);
      activeGenerationsRef.current.delete(generation);
      if (shouldUpdate) {
        setHubRunning((current) => ({ ...current, [key]: false }));
      }
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
            disabled={
              running || targetedRunning || cooldownRemaining > 0
            }
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
            value={
              hasLooseData ? numberFormatter.format(totals.looseTotal) : "—"
            }
            description="Tổng đơn chưa đóng bao"
            tone="bg-primary/10 text-primary"
          />
          <SummaryCard
            icon={ClipboardList}
            label="Transfer Order"
            value={hasPackedData ? numberFormatter.format(totals.packedTo) : "—"}
            description="Tổng TO đã đóng bao"
            tone="bg-secondary/10 text-secondary"
          />
          <SummaryCard
            icon={Package}
            label="Số kiện"
            value={
              hasPackedData
                ? numberFormatter.format(totals.packedQuantity)
                : "—"
            }
            description="Tổng kiện trong TO"
            tone="bg-info/10 text-info"
          />
          <SummaryCard
            icon={ShieldAlert}
            label="Bao DG"
            value={hasPackedData ? numberFormatter.format(totals.packedDg) : "—"}
            description="Bao có hàng nguy hiểm"
            tone="bg-warning/10 text-warning"
          />
          <SummaryCard
            icon={Gem}
            label="Bao GTC"
            value={hasPackedData ? numberFormatter.format(totals.packedGtc) : "—"}
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
            onRefreshHub={handleHubRefresh}
            hubCooldownRemaining={hubCooldownRemaining}
            hubRunning={hubRunning}
            allRunning={running}
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
            key={`${selectedRow.name}:${packedResultGenerations[selectedRow.name] ?? 0}`}
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
