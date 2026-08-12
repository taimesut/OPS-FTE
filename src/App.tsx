import { HashRouter, Route, Routes } from "react-router-dom";
import { SettingsPage } from "./pages/SettingsPage";
import { CheckSotNgoaiTinhPage } from "./pages/CheckSotNgoaiTinhPage";
import { CheckSotNoiTinhPage } from "./pages/CheckSotNoiTinhPage";
import { InternalHubOverviewPage } from "./pages/InternalHubOverviewPage";
import { MobileLayout } from "./layouts/MobileLayout";
import { HomePage } from "./pages/HomePage";
import { LayMaTOPage } from "./pages/LayMaTOPage";
import { TaoBienBanSuVuPage } from "./pages/TaoBienBanSuVuPage";
import { ToastContainer } from "./components/Toast";
import { BanGiaoPdaPage } from "./pages/BanGiaoPdaPage";

export const App = () => {
  return (
    <HashRouter>
      <ToastContainer />
      <MobileLayout>
        {/* Cấu hình các Routes */}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/check-sot/ngoai-tinh"
            element={<CheckSotNgoaiTinhPage />}
          />
          <Route
            path="/check-sot/noi-tinh/overview"
            element={<InternalHubOverviewPage />}
          />
          <Route path="/check-sot/noi-tinh" element={<CheckSotNoiTinhPage />} />
          <Route path="/cai-dat" element={<SettingsPage />} />
          <Route path="/tao-bien-ban-su-vu" element={<TaoBienBanSuVuPage />} />
          <Route path="/lay-ma-to" element={<LayMaTOPage />} />
          <Route path="/ban-giao-pda" element={<BanGiaoPdaPage />} />
          {/* Route bắt lỗi 404 */}
          <Route path="*" element={<HomePage />} />
        </Routes>
      </MobileLayout>
    </HashRouter>
  );
};
