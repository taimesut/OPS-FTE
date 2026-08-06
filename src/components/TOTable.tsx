/* eslint-disable react-refresh/only-export-components */
import { useState, useMemo, useEffect, useRef } from "react";
import QRCodeModal from "./QRCodeModal";
import { SlidersHorizontal, Search, QrCode, ArrowLeft, ArrowRight, PackageCheck } from "lucide-react";

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
  high_value: number; // 1 là Y, 2 là N
  dg_type: number[]; // 1 NON DG - 2 DG Type A - 3 DG Type B - 4 DG Type C - 5 DG Type D
}

export const TABLE_COLUMNS = [
  { key: "to_number", label: "Mã TO" },
  { key: "operator", label: "Người đóng" },
  { key: "high_value", label: "GTC" },
  { key: "dg_type", label: "DG" },
  { key: "route", label: "Điểm đến (Des)" },
  { key: "pack_name", label: "Tên bao" },
  { key: "quantity", label: "Số kiện" },
  { key: "weight", label: "Khối lượng" },
  { key: "status", label: "Trạng thái" },
  { key: "complete_time", label: "Thời gian HT" },
  { key: "action", label: "Thao tác" },
];

interface TOTableProps {
  orders: TransferOrder[];
  storageKey: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

export const TOTable = ({
  orders,
  storageKey,
  emptyTitle = "Chưa có dữ liệu",
  emptyDescription = "Vui lòng chọn điều kiện lọc và bấm tìm kiếm.",
}: TOTableProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // View QR TO Modal State
  const [selectedTO, setSelectedTO] = useState<TransferOrder | null>(null);
  const [showQR, setShowQR] = useState(false);

  // Cấu hình cột hiển thị
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : TABLE_COLUMNS.map((col) => col.key);
    } catch {
      return TABLE_COLUMNS.map((col) => col.key);
    }
  });

  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(visibleColumns));
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

  // Lọc theo từ khóa tìm kiếm nhanh
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const query = searchQuery.toLowerCase().trim();
    return orders.filter(
      (item) =>
        item.to_number.toLowerCase().includes(query) ||
        (item.operator && item.operator.toLowerCase().includes(query)) ||
        (item.receiver && item.receiver.toLowerCase().includes(query)) ||
        (item.pack_name && item.pack_name.toLowerCase().includes(query))
    );
  }, [orders, searchQuery]);

  const totalQuantity = useMemo(
    () => filteredOrders.reduce((sum, item) => sum + (item.quantity || 0), 0),
    [filteredOrders]
  );

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);

  const currentOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredOrders, currentPage, itemsPerPage]);

  const toggleColumn = (colKey: string) => {
    setVisibleColumns((prev) =>
      prev.includes(colKey)
        ? prev.filter((k) => k !== colKey)
        : [...prev, colKey]
    );
  };

  const formatTime = (time: number) => {
    if (!time) return "---";
    return new Date(time * 1000).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    });
  };

  return (
    <div className="space-y-4">
      {/* Dynamic Stats Banner - 2 Columns */}
      <div className="grid grid-cols-2 gap-3">
        <div className="stat bg-base-100 border border-base-200 rounded-2xl shadow-xs p-4">
          <div className="stat-title text-xs font-semibold uppercase text-base-content/60">
            Tổng số TO
          </div>
          <div className="stat-value text-2xl md:text-3xl text-primary font-black mt-1">
            {filteredOrders.length}
          </div>
          <div className="stat-desc text-xs opacity-70">
            {orders.length !== filteredOrders.length
              ? `Lọc từ ${orders.length} TO`
              : "Tổng số Transfer Order"}
          </div>
        </div>

        <div className="stat bg-base-100 border border-base-200 rounded-2xl shadow-xs p-4">
          <div className="stat-title text-xs font-semibold uppercase text-base-content/60">
            Tổng số kiện
          </div>
          <div className="stat-value text-2xl md:text-3xl text-secondary font-black mt-1">
            {totalQuantity}
          </div>
          <div className="stat-desc text-xs opacity-70">Tổng sản phẩm/kiện</div>
        </div>
      </div>

      {/* Main Card Container */}
      <div className="rounded-2xl border border-base-200 bg-base-100 shadow-xs overflow-hidden">
        {/* Toolbar Controls */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-4 bg-base-200/30 border-b border-base-200">
          {/* Tìm kiếm nhanh */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Tìm kiếm mã TO, người đóng, điểm đến..."
              className="input input-sm input-bordered w-full pl-9 focus:input-primary rounded-xl"
            />
          </div>

          <div className="flex items-center justify-between md:justify-end gap-2">
            {/* Button Tùy chọn cột */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowColumnConfig(!showColumnConfig)}
                className="btn btn-sm btn-outline gap-2 rounded-xl border-base-300 hover:border-primary"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline">Tùy chọn cột</span>
              </button>

              {showColumnConfig && (
                <div className="absolute right-0 top-full mt-2 w-56 z-30 rounded-2xl border border-base-200 bg-base-100 p-3 shadow-2xl animate-in fade-in zoom-in-95">
                  <div className="mb-2 border-b border-base-200 pb-2 text-xs font-bold text-base-content/50 uppercase tracking-wider">
                    Hiển thị cột
                  </div>
                  <div className="flex max-h-60 flex-col gap-1.5 overflow-y-auto">
                    {TABLE_COLUMNS.map((col) => (
                      <label
                        key={col.key}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg p-1.5 hover:bg-base-200 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(col.key)}
                          onChange={() => toggleColumn(col.key)}
                          className="checkbox checkbox-xs checkbox-primary rounded"
                        />
                        <span className="text-xs font-medium">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Selector Số lượng dòng hiển thị */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-base-content/60 hidden sm:inline">Dòng:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="select select-bordered select-sm rounded-xl"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>

        {/* Data Table */}
        {filteredOrders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table table-sm md:table-md w-full whitespace-nowrap">
              <thead className="bg-base-200/50 text-base-content font-bold border-b border-base-200">
                <tr>
                  {TABLE_COLUMNS.map(
                    (col) =>
                      visibleColumns.includes(col.key) && (
                        <th key={col.key} className="text-xs py-3">
                          {col.label}
                        </th>
                      )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-base-200">
                {currentOrders.map((item) => (
                  <tr key={item.to_number} className="hover:bg-base-200/40 transition-colors">
                    {visibleColumns.includes("to_number") && (
                      <td>
                        <span className="font-bold text-primary font-mono text-sm">
                          {item.to_number}
                        </span>
                      </td>
                    )}
                    {visibleColumns.includes("operator") && (
                      <td className="text-sm">{item.operator || "---"}</td>
                    )}
                    {visibleColumns.includes("high_value") && (
                      <td>
                        <span
                          className={`badge badge-sm font-semibold ${
                            item.high_value === 1
                              ? "badge-error text-error-content"
                              : "badge-ghost opacity-70"
                          }`}
                        >
                          {item.high_value === 1 ? "GTC (Y)" : "N"}
                        </span>
                      </td>
                    )}
                    {visibleColumns.includes("dg_type") && (
                      <td>
                        <span
                          className={`badge badge-sm font-semibold ${
                            item.dg_type && item.dg_type[0] !== 1
                              ? "badge-warning"
                              : "badge-ghost opacity-70"
                          }`}
                        >
                          {item.dg_type && item.dg_type[0] === 1 ? "NON DG" : "DG"}
                        </span>
                      </td>
                    )}
                    {visibleColumns.includes("route") && (
                      <td className="font-semibold text-sm">
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
                      <td className="font-bold text-center text-sm">
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
                        <span className="badge badge-success badge-sm gap-1 bg-success/15 border-0 text-success font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                          {item.status || "Đã đóng gói"}
                        </span>
                      </td>
                    )}
                    {visibleColumns.includes("complete_time") && (
                      <td className="text-xs text-base-content/70">
                        {formatTime(item.complete_time)}
                      </td>
                    )}
                    {visibleColumns.includes("action") && (
                      <td>
                        <button
                          className="btn btn-xs btn-primary gap-1.5 rounded-lg"
                          onClick={() => {
                            setSelectedTO(item);
                            setShowQR(true);
                          }}
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          View QR
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Empty State */
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-base-200 flex items-center justify-center mb-4 text-base-content/30">
              <PackageCheck className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold">{emptyTitle}</h3>
            <p className="text-sm text-base-content/60 max-w-sm mt-1">
              {emptyDescription}
            </p>
          </div>
        )}

        {/* Pagination Footer */}
        {filteredOrders.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-base-200 bg-base-200/20 text-xs">
            <div className="text-base-content/70">
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

            <div className="join">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="join-item btn btn-xs btn-outline rounded-l-xl"
              >
                <ArrowLeft className="w-3 h-3" />
                Trước
              </button>
              <button className="join-item btn btn-xs btn-disabled opacity-100 bg-base-200 font-bold px-3">
                Trang {currentPage} / {totalPages || 1}
              </button>
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages || totalPages === 0}
                className="join-item btn btn-xs btn-outline rounded-r-xl"
              >
                Sau
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* QRCode View Modal */}
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
    </div>
  );
};
