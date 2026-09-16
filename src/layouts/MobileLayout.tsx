import { useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Earth,
  House,
  MapPinCheckInside,
  NotebookPen,
  Settings,
  X,
  Package,
  Menu,
  QrCode,
  LayoutDashboard,
  ChartNoAxesColumnIncreasing,
} from "lucide-react";
import ToggleTheme from "../components/ToggleTheme";
import { getSoc } from "../utils/config";

interface MobileLayoutProps {
  children: React.ReactNode;
  onRequestClose?: () => void;
}

export const MobileLayout = ({
  children,
  onRequestClose,
}: MobileLayoutProps) => {
  const location = useLocation();
  const drawerRef = useRef<HTMLInputElement>(null);
  const currentSoc = getSoc() || "SOC";

  const closeDrawer = () => {
    if (drawerRef.current) drawerRef.current.checked = false;
  };

  const toggleDrawer = () => {
    if (drawerRef.current) drawerRef.current.checked = !drawerRef.current.checked;
  };

  const handleRequestClose = () => {
    closeDrawer();
    onRequestClose?.();
  };

  const navItems = [
    { path: "/", label: "Trang Chủ", icon: House },
    { path: "/check-sot/noi-tinh/overview", label: "Overview nội tỉnh", icon: LayoutDashboard },
    { path: "/check-sot/noi-tinh/volume", label: "Volume nội tỉnh", icon: ChartNoAxesColumnIncreasing },
    { path: "/check-sot/noi-tinh", label: "Check sót nội tỉnh", icon: MapPinCheckInside },
    { path: "/check-sot/ngoai-tinh", label: "Check sót ngoại tỉnh", icon: Earth },
    { path: "/tao-bien-ban-su-vu", label: "Tạo biên bản sự vụ", icon: NotebookPen },
    { path: "/lay-ma-to", label: "Lấy mã TO", icon: QrCode },
    { path: "/tao-ma-qr", label: "Tạo mã QR", icon: QrCode },
  ];

  return (
    <div className="drawer app-shell relative min-h-screen overflow-x-clip bg-base-100 font-sans">
      <input
        ref={drawerRef}
        id="mobile-sidebar-drawer"
        type="checkbox"
        className="drawer-toggle"
      />

      <div className="drawer-content relative z-10 flex min-h-screen min-w-0 flex-col">
        <header className="navbar sticky top-0 z-40 h-14 min-h-14 w-full border-b border-base-200 bg-base-100/95 px-2 backdrop-blur-md sm:px-3 md:px-6">
          <div className="flex-none">
            <button
              type="button"
              onClick={toggleDrawer}
              aria-label="Mở menu"
              className="btn btn-square btn-ghost drawer-button relative z-50 min-h-11 min-w-11 touch-manipulation rounded-xl p-2"
            >
              <Menu className="pointer-events-none h-6 w-6" />
            </button>
          </div>

          <div className="mx-1 flex min-w-0 flex-1 items-center gap-2 px-1 text-base font-black tracking-tight sm:mx-2 sm:px-2 sm:text-lg md:text-xl">
            <span className="rounded-xl bg-primary/10 p-1.5 text-primary">
              <Package className="h-5 w-5" />
            </span>
            <span className="truncate" title={currentSoc}>
              <span className="font-black text-primary">SPX</span>{" "}
              <span className="align-middle">{currentSoc}</span>
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <ToggleTheme />
            {onRequestClose ? (
              <button
                type="button"
                onClick={handleRequestClose}
                aria-label="Đóng OPS FTE"
                className="btn btn-square btn-ghost relative z-50 min-h-11 min-w-11 touch-manipulation rounded-xl p-2"
              >
                <X className="pointer-events-none h-5 w-5" />
              </button>
            ) : null}
          </div>
        </header>

        <main className="app-main min-w-0 flex-1 bg-base-200/40 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-12">
          {children}
        </main>
      </div>

      <div className="drawer-side z-50">
        <label
          htmlFor="mobile-sidebar-drawer"
          aria-label="Đóng menu"
          className="drawer-overlay"
        ></label>

        <div className="menu flex min-h-full w-[min(86vw,20rem)] flex-col justify-between bg-base-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-base-content shadow-2xl sm:p-5">
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-base-200 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-secondary font-bold text-primary-content shadow-md">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <span className="block text-base font-extrabold leading-tight">Ops FTE</span>
                  <span className="text-xs font-medium text-base-content/60">{currentSoc}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Đóng menu"
                className="btn btn-circle btn-ghost btn-sm min-h-11 min-w-11"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ul className="space-y-1.5 text-sm font-semibold">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;

                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      onClick={closeDrawer}
                      className={`flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 transition-all ${
                        isActive
                          ? "bg-primary font-bold text-primary-content shadow-xs"
                          : "text-base-content/80 hover:bg-base-200"
                      }`}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="border-t border-base-200 pt-4">
            <Link
              to="/cai-dat"
              onClick={closeDrawer}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 transition-all ${
                location.pathname === "/cai-dat"
                  ? "bg-primary font-bold text-primary-content"
                  : "font-medium text-base-content/80 hover:bg-base-200"
              }`}
            >
              <Settings className="h-5 w-5 flex-shrink-0" />
              Cài đặt cấu hình hệ thống
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
