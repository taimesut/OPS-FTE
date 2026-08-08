import { useState, useEffect } from "react";
import { getHubs, getSoc, getCookies } from "../utils/config";
import apiClient from "../utils/apiClient";
import { TOTable, type TransferOrder } from "../components/TOTable";
import { LooseOrderSummary } from "../components/LooseOrderSummary";
import { showToast } from "../components/Toast";
import { useLooseOrderCheck } from "../hooks/useLooseOrderCheck";
import { Search, MapPin, PackageCheck } from "lucide-react";

export const CheckSotNoiTinhPage = () => {
  const [hubs, setHubs] = useState<string[]>([]);
  const [soc, setSoc] = useState<string>("");
  const [hub, setHub] = useState("");
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<TransferOrder[]>([]);
  const looseOrders = useLooseOrderCheck();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHubs(getHubs());
    setSoc(getSoc());
  }, []);

  const checkSotNoiTinh = async () => {
    const currentSoc = getSoc();
    const cookies = getCookies();

    if (!hub) {
      showToast("Vui lòng chọn Hub nội tỉnh để kiểm tra!", "warning");
      return;
    }

    if (!currentSoc) {
      showToast(
        "Chưa cài đặt Mã SOC của bạn! Vui lòng vào trang Cài Đặt để nhập Mã SOC.",
        "error",
      );
      return;
    }

    if (!cookies) {
      showToast(
        "Chưa có Cookie SPX! Vui lòng vào trang Cài Đặt để dán Cookie.",
        "error",
      );
      return;
    }

    setLoading(true);

    try {
      const checkPackedOrders = async () => {
        const now = Math.floor(Date.now() / 1000);
        const sevenDaysAgo = now - 7 * 24 * 60 * 60;
        const url = `/api/in-station/general_to/outbound/search?pageno=1&count=500&receiver=${encodeURIComponent(
          hub,
        )}&status=2&ctime=${sevenDaysAgo},${now}`;

        const response = await apiClient.get(url);
        const list = (response.data?.data?.list || []).filter(
          (item: { current_station_name: string }) =>
            item.current_station_name === "Pleiku SOC",
        );
        setOrders(list);
        if (list.length === 0) {
          showToast(
            `Không có TO nào bị sót từ ${currentSoc} tới Hub ${hub}`,
            "info",
          );
        } else {
          showToast(
            `Tìm thấy ${list.length} TO sót tới Hub ${hub}`,
            "success",
          );
        }
      };

      const results = await Promise.allSettled([
        checkPackedOrders(),
        looseOrders.run(),
      ]);

      for (const result of results) {
        if (result.status === "rejected") {
          console.error("[Check sót nội tỉnh]", result.reason);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto min-w-0 max-w-7xl p-3 pb-6 sm:p-4 md:p-6 font-sans text-base-content space-y-5 md:space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 border-b border-base-200 pb-4 md:pb-5">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-2">
            <span className="p-2 bg-primary/10 text-primary rounded-xl">
              <MapPin className="w-5 h-5" />
            </span>
            <h1 className="min-w-0 break-words text-xl sm:text-2xl md:text-3xl font-black tracking-tight">
              Kiểm Tra Sót Nội Tỉnh
            </h1>
          </div>
          <p className="text-xs md:text-sm text-base-content/60 mt-1">
            Tra cứu danh sách Transfer Order (TO) xuất kho từ {soc || "SOC"} đi
            các Hub nội tỉnh
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex w-full flex-col items-stretch gap-2 md:w-auto sm:flex-row sm:items-center">
          <select
            value={hub}
            onChange={(e) => setHub(e.target.value)}
            className="select select-bordered min-h-11 w-full sm:w-60 focus:select-primary rounded-xl shadow-xs font-semibold"
          >
            <option value="" disabled>
              -- Chọn Hub nội tỉnh --
            </option>
            {hubs.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <button
            onClick={checkSotNoiTinh}
            disabled={loading}
            className="btn btn-primary min-h-11 w-full gap-2 rounded-xl shadow-xs sm:w-auto"
          >
            {loading ? (
              <span className="loading loading-spinner loading-sm"></span>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Tìm kiếm
              </>
            )}
          </button>
        </div>
      </div>

      <LooseOrderSummary state={looseOrders.state} />

      <section aria-labelledby="packed-orders-heading" className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success/10 text-success">
            <PackageCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="packed-orders-heading" className="font-black tracking-tight">
              Hàng đã đóng bao
            </h2>
            <p className="text-xs text-base-content/60">
              Transfer Order (TO) đang còn tại Pleiku SOC
            </p>
          </div>
        </div>

        <TOTable
          orders={orders}
          storageKey="tuy-chon-check-sot-noi-tinh"
          emptyTitle="Chưa có dữ liệu sót nội tỉnh"
          emptyDescription="Vui lòng chọn Hub nội tỉnh và nhấn nút 'Tìm kiếm' để kiểm tra danh sách TO."
        />
      </section>
    </div>
  );
};
