import { useEffect, useMemo, useRef, useState } from "react";
import QRCodeModal from "./QRCodeModal";
import TrackingModal from "./TrackingModal";
import {
  ArrowLeft,
  ArrowRight,
  PackageCheck,
  QrCode,
  Route,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  classifyPackedOrder,
  summarizePackedOrders,
  type PackedOrderClassification,
} from "../utils/packedOrderMetrics";
import {
  matchesTransferOrderSearch,
  parseTransferOrderColumns,
  serializeTransferOrderColumns,
  TRANSFER_ORDER_COLUMNS,
  type TransferOrderColumnKey,
} from "../utils/transferOrderTable";
import { fetchTransferOrderTracking } from "../utils/transferOrderTrackingApi";
import type { TransferOrderTrackingResult } from "../utils/transferOrderTracking";

export interface TransferOrder {
  to_number: string;
  sender: string;
  receiver: string;
  operator: string;
  quantity: number;
  weight: number;
  status: string;
  complete_time: number;
  pack_name: string;
  high_value: number;
  dg_type: number[];
  current_station_name: string;
}

export const TABLE_COLUMNS = TRANSFER_ORDER_COLUMNS;

interface TOTableProps {
  orders: TransferOrder[];
  storageKey: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

const formatTransferTime = (time: number) => {
  if (!time) return "---";
  return new Date(time * 1000).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
};

const CLASSIFICATION_META: Record<
  PackedOrderClassification,
  { label: string; className: string }
> = {
  normal: { label: "NORMAL", className: "badge-ghost" },
  dg: { label: "DG", className: "badge-warning" },
  gtc: { label: "GTC", className: "badge-error text-error-content" },
  dg_and_gtc: {
    label: "DG & GTC",
    className: "border-secondary bg-secondary/15 text-secondary",
  },
};

const ClassificationBadge = ({
  classification,
}: {
  classification: PackedOrderClassification;
}) => {
  const meta = CLASSIFICATION_META[classification];
  return (
    <span className={`badge badge-sm whitespace-nowrap font-bold ${meta.className}`}>
      {meta.label}
    </span>
  );
};

interface TransferOrderCompactRowProps {
  item: TransferOrder;
  visibleColumns: TransferOrderColumnKey[];
  onViewQR: () => void;
  onViewTracking: () => void;
}

const TransferOrderCompactRow = ({
  item,
  visibleColumns,
  onViewQR,
  onViewTracking,
}: TransferOrderCompactRowProps) => {
  const showToNumber = visibleColumns.includes("to_number");
  const showAction = visibleColumns.includes("action");
  const showClassification = visibleColumns.includes("classification");
  const showSender = visibleColumns.includes("sender");
  const showRoute = visibleColumns.includes("route");
  const showQuantity = visibleColumns.includes("quantity");
  const showWeight = visibleColumns.includes("weight");
  const showPrimaryMetadata =
    showSender || showRoute || showQuantity || showWeight;
  const secondaryMetadata = [
    visibleColumns.includes("complete_time")
      ? formatTransferTime(item.complete_time)
      : "",
    visibleColumns.includes("operator")
      ? `Đóng: ${item.operator || "---"}`
      : "",
    visibleColumns.includes("pack_name")
      ? `Bao: ${item.pack_name || "Mặc định"}`
      : "",
    visibleColumns.includes("status")
      ? item.status || "Đã đóng gói"
      : "",
  ].filter(Boolean);
  const showSecondaryMetadata = secondaryMetadata.length > 0;
  const showMetadata = showPrimaryMetadata || showSecondaryMetadata;
  const showHeader = showToNumber || showClassification || showAction;
  const classification = classifyPackedOrder(item);
  const sender = item.sender || "Chưa rõ điểm gửi";
  const receiver = item.receiver || "Chưa rõ điểm đến";
  const route =
    showSender && showRoute
      ? `${sender} → ${receiver}`
      : showSender
        ? sender
        : receiver;

  if (!showHeader && !showMetadata) return null;

  return (
    <article className="border-b border-base-200 px-3 py-1.5 last:border-b-0">
      {showHeader ? (
        <div className="flex min-w-0 items-center gap-2">
          {showToNumber ? (
            <p className="min-w-0 flex-1 truncate font-mono text-sm font-black text-primary">
              {item.to_number}
            </p>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
          {showClassification ? (
            <ClassificationBadge classification={classification} />
          ) : null}
          {showAction ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                className="btn btn-square btn-sm min-h-11 min-w-11 touch-manipulation rounded-xl btn-outline"
                onClick={onViewTracking}
                aria-label={`Xem tracking của ${item.to_number}`}
                title="Xem tracking"
              >
                <Route className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn btn-square btn-sm min-h-11 min-w-11 touch-manipulation rounded-xl btn-primary"
                onClick={onViewQR}
                aria-label={`Xem QR của ${item.to_number}`}
                title="Xem QR"
              >
                <QrCode className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {showPrimaryMetadata ? (
        <div
          className={`${showHeader ? "mt-1" : ""} flex min-w-0 items-center gap-2 text-xs text-base-content/65`}
        >
          {showSender || showRoute ? (
            <span
              className="min-w-0 flex-1 truncate font-semibold text-base-content/80"
              title={route}
            >
              {route}
            </span>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
          {showQuantity ? <span>{item.quantity} kiện</span> : null}
          {showWeight ? <span>{(item.weight / 1000).toFixed(2)} kg</span> : null}
        </div>
      ) : null}

      {showSecondaryMetadata ? (
        <p
          className={`${showHeader || showPrimaryMetadata ? "mt-0.5" : ""} truncate text-[11px] leading-4 text-base-content/55`}
          title={secondaryMetadata.join(" · ")}
        >
          {secondaryMetadata.join(" · ")}
        </p>
      ) : null}
    </article>
  );
};

export const TOTable = ({
  orders,
  storageKey,
  emptyTitle = "Chưa có dữ liệu",
  emptyDescription = "Vui lòng chọn điều kiện lọc và bấm tìm kiếm.",
}: TOTableProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [selectedTO, setSelectedTO] = useState<TransferOrder | null>(null);
  const [showQR, setShowQR] = useState(false);

  const [trackingTO, setTrackingTO] = useState<TransferOrder | null>(null);
  const [showTracking, setShowTracking] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingData, setTrackingData] =
    useState<TransferOrderTrackingResult | null>(null);
  const [trackingError, setTrackingError] = useState("");
  const trackingRequestId = useRef(0);

  const [visibleColumns, setVisibleColumns] = useState<
    TransferOrderColumnKey[]
  >(() => {
    try {
      return parseTransferOrderColumns(localStorage.getItem(storageKey));
    } catch {
      return parseTransferOrderColumns(null);
    }
  });

  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        serializeTransferOrderColumns(visibleColumns),
      );
    } catch {
      // Column preferences are optional when storage is unavailable.
    }
  }, [visibleColumns, storageKey]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowColumnConfig(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOrders = useMemo(
    () => orders.filter((item) => matchesTransferOrderSearch(item, searchQuery)),
    [orders, searchQuery],
  );

  const packedMetrics = useMemo(
    () => summarizePackedOrders(filteredOrders),
    [filteredOrders],
  );

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);

  const currentOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredOrders, currentPage, itemsPerPage]);

  const toggleColumn = (colKey: TransferOrderColumnKey) => {
    setVisibleColumns((prev) =>
      prev.includes(colKey)
        ? prev.filter((key) => key !== colKey)
        : [...prev, colKey],
    );
  };

  const loadTracking = async (item: TransferOrder) => {
    const requestId = trackingRequestId.current + 1;
    trackingRequestId.current = requestId;
    setTrackingTO(item);
    setShowTracking(true);
    setTrackingLoading(true);
    setTrackingData(null);
    setTrackingError("");

    try {
      const data = await fetchTransferOrderTracking(item.to_number);
      if (trackingRequestId.current !== requestId) return;
      setTrackingData(data);
    } catch (error) {
      if (trackingRequestId.current !== requestId) return;
      setTrackingError(
        error instanceof Error && error.message
          ? error.message
          : "Không thể tải tracking của đơn đại diện.",
      );
    } finally {
      if (trackingRequestId.current === requestId) setTrackingLoading(false);
    }
  };

  const closeTracking = () => {
    trackingRequestId.current += 1;
    setShowTracking(false);
    setTrackingTO(null);
    setTrackingLoading(false);
    setTrackingData(null);
    setTrackingError("");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
        <div className="stat min-w-0 rounded-xl border border-base-200 bg-base-100 p-3 shadow-xs sm:rounded-2xl sm:p-4">
          <div className="stat-title text-xs font-semibold uppercase text-base-content/60">
            Tổng số TO
          </div>
          <div className="stat-value mt-1 text-2xl font-black text-primary md:text-3xl">
            {filteredOrders.length}
          </div>
          <div className="break-safe text-xs leading-relaxed opacity-70">
            {orders.length !== filteredOrders.length
              ? `Lọc từ ${orders.length} TO`
              : "Tổng số Transfer Order"}
          </div>
        </div>

        <div className="stat min-w-0 rounded-xl border border-base-200 bg-base-100 p-3 shadow-xs sm:rounded-2xl sm:p-4">
          <div className="stat-title text-xs font-semibold uppercase text-base-content/60">
            Tổng số kiện
          </div>
          <div className="stat-value mt-1 text-2xl font-black text-secondary md:text-3xl">
            {packedMetrics.totalQuantity}
          </div>
          <div className="break-safe text-xs leading-relaxed opacity-70">
            Tổng sản phẩm/kiện
          </div>
        </div>

        <div className="stat min-w-0 rounded-xl border border-warning/25 bg-warning/5 p-3 shadow-xs sm:rounded-2xl sm:p-4">
          <div className="stat-title text-xs font-semibold uppercase text-base-content/60">
            Số bao DG
          </div>
          <div className="stat-value mt-1 text-2xl font-black text-warning md:text-3xl">
            {packedMetrics.dgBagCount}
          </div>
          <div className="break-safe text-xs leading-relaxed opacity-70">
            Bao chỉ có hàng nguy hiểm
          </div>
        </div>

        <div className="stat min-w-0 rounded-xl border border-error/25 bg-error/5 p-3 shadow-xs sm:rounded-2xl sm:p-4">
          <div className="stat-title text-xs font-semibold uppercase text-base-content/60">
            Số bao GTC
          </div>
          <div className="stat-value mt-1 text-2xl font-black text-error md:text-3xl">
            {packedMetrics.gtcBagCount}
          </div>
          <div className="break-safe text-xs leading-relaxed opacity-70">
            Bao chỉ có hàng giá trị cao
          </div>
        </div>

        <div className="stat col-span-2 min-w-0 rounded-xl border border-secondary/25 bg-secondary/5 p-3 shadow-xs sm:col-span-1 sm:rounded-2xl sm:p-4">
          <div className="stat-title text-xs font-semibold uppercase text-base-content/60">
            Số bao DG & GTC
          </div>
          <div className="stat-value mt-1 text-2xl font-black text-secondary md:text-3xl">
            {packedMetrics.dgAndGtcBagCount}
          </div>
          <div className="break-safe text-xs leading-relaxed opacity-70">
            Bao đồng thời DG và giá trị cao
          </div>
        </div>
      </div>

      <div className="app-surface overflow-hidden">
        <div className="grid gap-2 border-b border-base-200 bg-base-200/30 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3 sm:p-4">
          <div className="relative min-w-0 w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/40" />
            <input
              type="text"
              aria-label="Tìm kiếm Transfer Order"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Tìm mã TO, Sender, người đóng, điểm đến..."
              className="input input-sm input-bordered min-h-11 w-full min-w-0 rounded-xl pl-9 focus:input-primary"
            />
          </div>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:justify-end">
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setShowColumnConfig(!showColumnConfig)}
                className="btn btn-sm min-h-11 w-full min-w-0 touch-manipulation btn-outline gap-2 rounded-xl border-base-300 hover:border-primary sm:w-auto"
                aria-label="Tùy chọn cột hiển thị"
                aria-expanded={showColumnConfig}
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Tùy chọn cột</span>
              </button>

              {showColumnConfig ? (
                <div className="absolute right-0 top-full z-30 mt-2 w-[min(14rem,calc(100vw-2rem))] rounded-2xl border border-base-200 bg-base-100 p-3 shadow-2xl animate-in fade-in zoom-in-95 motion-reduce:animate-none">
                  <div className="mb-2 border-b border-base-200 pb-2 text-xs font-bold uppercase tracking-wider text-base-content/50">
                    Hiển thị cột
                  </div>
                  <div className="flex max-h-60 flex-col gap-1.5 overflow-y-auto">
                    {TABLE_COLUMNS.map((column) => (
                      <label
                        key={column.key}
                        className="flex min-h-11 cursor-pointer touch-manipulation items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-base-200"
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(column.key)}
                          onChange={() => toggleColumn(column.key)}
                          className="checkbox checkbox-xs checkbox-primary rounded"
                        />
                        <span className="text-xs font-medium">{column.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex min-w-0 items-center justify-end gap-2 text-xs">
              <span className="hidden text-base-content/60 sm:inline">Dòng:</span>
              <select
                aria-label="Số dòng hiển thị"
                value={itemsPerPage}
                onChange={(event) => {
                  setItemsPerPage(Number(event.target.value));
                  setCurrentPage(1);
                }}
                className="select select-bordered select-sm min-h-11 w-full min-w-0 rounded-xl sm:w-auto"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>

        {filteredOrders.length > 0 ? (
          <>
            <div className="md:hidden">
              {currentOrders.map((item) => (
                <TransferOrderCompactRow
                  key={item.to_number}
                  item={item}
                  visibleColumns={visibleColumns}
                  onViewTracking={() => void loadTracking(item)}
                  onViewQR={() => {
                    setSelectedTO(item);
                    setShowQR(true);
                  }}
                />
              ))}
            </div>

            <div className="hidden max-w-full overflow-x-auto md:block">
              <table className="table table-sm w-full min-w-[64rem] whitespace-nowrap md:table-md">
                <thead className="border-b border-base-200 bg-base-200/50 font-bold text-base-content">
                  <tr>
                    {TABLE_COLUMNS.map(
                      (column) =>
                        visibleColumns.includes(column.key) && (
                          <th key={column.key} className="py-3 text-xs">
                            {column.label}
                          </th>
                        ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-200">
                  {currentOrders.map((item) => (
                    <tr
                      key={item.to_number}
                      className="transition-colors hover:bg-base-200/40"
                    >
                      {visibleColumns.includes("to_number") && (
                        <td>
                          <span className="font-mono text-sm font-bold text-primary">
                            {item.to_number}
                          </span>
                        </td>
                      )}
                      {visibleColumns.includes("operator") && (
                        <td className="text-sm">{item.operator || "---"}</td>
                      )}
                      {visibleColumns.includes("classification") && (
                        <td>
                          <ClassificationBadge
                            classification={classifyPackedOrder(item)}
                          />
                        </td>
                      )}
                      {visibleColumns.includes("sender") && (
                        <td className="text-sm font-semibold">
                          {item.sender || "---"}
                        </td>
                      )}
                      {visibleColumns.includes("route") && (
                        <td className="text-sm font-semibold">
                          {item.receiver || "---"}
                        </td>
                      )}
                      {visibleColumns.includes("pack_name") && (
                        <td>
                          <span className="badge badge-outline badge-sm font-mono">
                            {item.pack_name || "Mặc định"}
                          </span>
                        </td>
                      )}
                      {visibleColumns.includes("quantity") && (
                        <td className="text-center text-sm font-bold">
                          {item.quantity}
                        </td>
                      )}
                      {visibleColumns.includes("weight") && (
                        <td className="text-right text-sm">
                          {(item.weight / 1000).toFixed(2)} kg
                        </td>
                      )}
                      {visibleColumns.includes("status") && (
                        <td>
                          <span className="badge badge-success badge-sm gap-1 border-0 bg-success/15 font-bold text-success">
                            <span className="h-1.5 w-1.5 rounded-full bg-success" />
                            {item.status || "Đã đóng gói"}
                          </span>
                        </td>
                      )}
                      {visibleColumns.includes("complete_time") && (
                        <td className="text-xs text-base-content/70">
                          {formatTransferTime(item.complete_time)}
                        </td>
                      )}
                      {visibleColumns.includes("action") && (
                        <td>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              className="btn btn-xs btn-outline gap-1.5 rounded-lg"
                              onClick={() => void loadTracking(item)}
                              aria-label={`Xem tracking của ${item.to_number}`}
                            >
                              <Route className="h-3.5 w-3.5" />
                              Tracking
                            </button>
                            <button
                              type="button"
                              className="btn btn-xs btn-primary gap-1.5 rounded-lg"
                              onClick={() => {
                                setSelectedTO(item);
                                setShowQR(true);
                              }}
                            >
                              <QrCode className="h-3.5 w-3.5" />
                              View QR
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center sm:p-12">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-base-200 text-base-content/30">
              <PackageCheck className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold">{emptyTitle}</h3>
            <p className="mt-1 max-w-sm break-safe text-sm text-base-content/60">
              {emptyDescription}
            </p>
          </div>
        )}

        {filteredOrders.length > 0 && (
          <div className="grid gap-3 border-t border-base-200 bg-base-200/20 p-3 text-xs sm:flex sm:items-center sm:justify-between sm:p-4">
            <div className="break-safe leading-relaxed text-base-content/70">
              Hiển thị{" "}
              <span className="font-bold text-base-content">
                {(currentPage - 1) * itemsPerPage + 1}
              </span>{" "}
              -{" "}
              <span className="font-bold text-base-content">
                {Math.min(currentPage * itemsPerPage, filteredOrders.length)}
              </span>{" "}
              trong tổng số{" "}
              <span className="font-bold text-base-content">
                {filteredOrders.length}
              </span>{" "}
              kết quả
            </div>

            <div className="join w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setCurrentPage((previous) => Math.max(previous - 1, 1))}
                disabled={currentPage === 1}
                className="join-item btn btn-xs min-h-11 flex-1 touch-manipulation btn-outline rounded-l-xl sm:flex-none"
              >
                <ArrowLeft className="h-3 w-3" />
                Trước
              </button>
              <span
                aria-current="page"
                className="join-item btn btn-xs min-h-11 flex-1 btn-disabled bg-base-200 px-3 font-bold opacity-100 sm:flex-none"
              >
                Trang {currentPage} / {totalPages || 1}
              </span>
              <button
                type="button"
                onClick={() =>
                  setCurrentPage((previous) => Math.min(previous + 1, totalPages))
                }
                disabled={currentPage === totalPages || totalPages === 0}
                className="join-item btn btn-xs min-h-11 flex-1 touch-manipulation btn-outline rounded-r-xl sm:flex-none"
              >
                Sau
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      <QRCodeModal
        open={showQR}
        value={selectedTO?.to_number ?? ""}
        title={`QR TO: ${selectedTO?.to_number ?? ""}`}
        description={
          selectedTO
            ? `Điểm đến: ${selectedTO.receiver} | Số kiện: ${selectedTO.quantity}`
            : undefined
        }
        onClose={() => {
          setShowQR(false);
          setSelectedTO(null);
        }}
      />

      <TrackingModal
        open={showTracking}
        toNumber={trackingTO?.to_number ?? ""}
        loading={trackingLoading}
        data={trackingData}
        error={trackingError}
        onRetry={() => {
          if (trackingTO) void loadTracking(trackingTO);
        }}
        onClose={closeTracking}
      />
    </div>
  );
};
