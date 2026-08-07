import { useState, useEffect } from "react";
import { getHubs, getSoc, getCookies } from "../utils/config";
import apiClient from "../utils/apiClient";
import { TOTable, type TransferOrder } from "../components/TOTable";
import { showToast } from "../components/Toast";
import { Search, MapPin } from "lucide-react";

export const CheckSotNoiTinhPage = () => {
  const [hubs, setHubs] = useState<string[]>([]);
  const [soc, setSoc] = useState<string>("");
  const [hub, setHub] = useState("");
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<TransferOrder[]>([]);

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
        showToast(`Tìm thấy ${list.length} TO sót tới Hub ${hub}`, "success");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-3 md:p-6 font-sans text-base-content space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-base-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-primary/10 text-primary rounded-xl">
              <MapPin className="w-5 h-5" />
            </span>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              Kiểm Tra Sót Nội Tỉnh
            </h1>
          </div>
          <p className="text-xs md:text-sm text-base-content/60 mt-1">
            Tra cứu danh sách Transfer Order (TO) xuất kho từ {soc || "SOC"} đi
            các Hub nội tỉnh
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <select
            value={hub}
            onChange={(e) => setHub(e.target.value)}
            className="select select-bordered w-full sm:w-60 focus:select-primary rounded-xl shadow-xs font-semibold"
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
            className="btn btn-primary gap-2 rounded-xl shadow-xs"
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

      {/* Main Table */}
      <TOTable
        orders={orders}
        storageKey="tuy-chon-check-sot-noi-tinh"
        emptyTitle="Chưa có dữ liệu sót nội tỉnh"
        emptyDescription="Vui lòng chọn Hub nội tỉnh và nhấn nút 'Tìm kiếm' để kiểm tra danh sách TO."
      />
    </div>
  );
};
