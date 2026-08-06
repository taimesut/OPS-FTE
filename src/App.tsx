import { HashRouter, Route, Routes } from "react-router-dom";
import { SettingsPage } from "./pages/SettingsPage";
import { CheckSotNgoaiTinhPage } from "./pages/CheckSotNgoaiTinhPage";
import { CheckSotNoiTinhPage } from "./pages/CheckSotNoiTinhPage";
import { MobileLayout } from "./layouts/MobileLayout";
import { HomePage } from "./pages/HomePage";
import { TaoBienBanSuVuPage } from "./pages/TaoBienBanSuVuPage";
import { ToastContainer } from "./components/Toast";

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
          <Route path="/check-sot/noi-tinh" element={<CheckSotNoiTinhPage />} />
          <Route path="/cai-dat" element={<SettingsPage />} />
          <Route path="/tao-bien-ban-su-vu" element={<TaoBienBanSuVuPage />} />
          {/* Route bắt lỗi 404 */}
          <Route path="*" element={<HomePage />} />
        </Routes>
      </MobileLayout>
    </HashRouter>
  );
};
