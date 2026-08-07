import { useState, useEffect } from "react";
import {
  getGroupSocsBySOC,
  getSoc,
  getSocs,
  getCookies,
} from "../utils/config";
import apiClient from "../utils/apiClient";
import { TOTable, type TransferOrder } from "../components/TOTable";
import { showToast } from "../components/Toast";
import { Search, Globe } from "lucide-react";

export const CheckSotNgoaiTinhPage = () => {
  const [soc, setSoc] = useState("");
  const [socs, setSocs] = useState<string[]>([]);
  const [currentSoc, setCurrentSoc] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<TransferOrder[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocs(getSocs() || []);
    setCurrentSoc(getSoc() || "");
  }, []);

  const checkSotNgoaiTinh = async () => {
    const sender = getSoc();
    const cookies = getCookies();

    if (!soc) {
      showToast("Vui lòng chọn SOC ngoại tỉnh để kiểm tra!", "warning");
      return;
    }

    if (!sender) {
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

      const receivers = getGroupSocsBySOC(soc);

      const responses = await Promise.all(
        receivers.map((receiver) =>
          apiClient.get(
            `/api/in-station/general_to/outbound/search?pageno=1&count=500&receiver=${encodeURIComponent(
              receiver,
            )}&status=2&ctime=${sevenDaysAgo},${now}`,
          ),
        ),
      );

      const rawList: TransferOrder[] = [];
      for (const res of responses) {
        if (res.data?.data?.list) {
          rawList.push(...res.data.data.list);
        }
      }

      // Loại bỏ TO trùng lặp
      const uniqueList = Array.from(
        new Map(rawList.map((item) => [item.to_number, item])).values(),
      ).filter(
        (item: { current_station_name: string }) =>
          item.current_station_name === "Pleiku SOC",
      );
      setOrders(uniqueList);

      if (uniqueList.length === 0) {
        showToast(
          `Không có TO ngoại tỉnh nào bị sót từ ${sender} tới ${soc}`,
          "info",
        );
      } else {
        showToast(
          `Tìm thấy ${uniqueList.length} TO sót tới SOC ${soc}`,
          "success",
        );
      }
    } catch (err) {
      console.error(err);
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
            <span className="p-2 bg-secondary/10 text-secondary rounded-xl">
              <Globe className="w-5 h-5" />
            </span>
            <h1 className="min-w-0 break-words text-xl sm:text-2xl md:text-3xl font-black tracking-tight">
              Kiểm Tra Sót Ngoại Tỉnh
            </h1>
          </div>
          <p className="text-xs md:text-sm text-base-content/60 mt-1">
            Tra cứu danh sách Transfer Order (TO) đã đóng từ{" "}
            {currentSoc || "SOC"} đi các SOC ngoại tỉnh khác
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex w-full flex-col items-stretch gap-2 md:w-auto sm:flex-row sm:items-center">
          <select
            value={soc}
            onChange={(e) => setSoc(e.target.value)}
            className="select select-bordered min-h-11 w-full sm:w-60 focus:select-primary rounded-xl shadow-xs font-semibold"
          >
            <option value="" disabled>
              -- Chọn SOC đích --
            </option>
            {socs.map((s, index) => (
              <option key={index} value={s}>
                {s}
              </option>
            ))}
          </select>

          <button
            onClick={checkSotNgoaiTinh}
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

      {/* Main Table */}
      <TOTable
        orders={orders}
        storageKey="tuy-chon-check-sot-ngoai-tinh"
        emptyTitle="Chưa có dữ liệu sót ngoại tỉnh"
        emptyDescription="Vui lòng chọn SOC ngoại tỉnh và nhấn nút 'Tìm kiếm' để kiểm tra danh sách TO."
      />
    </div>
  );
};
