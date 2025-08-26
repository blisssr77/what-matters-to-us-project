import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import clsx from "clsx";
import { useEnsureAuthScopedStores } from "@/hooks/useEnsureAuthScopedStores";
import { FullscreenProvider } from "./FullscreenProvider";

const Layout = ({
  children,
  noGutters = false,          // set true to remove the inner padding
  contentClassName = "",      // optional extra classes for <main>
  contentBg = "bg-gray-100",  // override page background if needed
}) => {
  // Ensure auth-scoped stores are initialized
  useEnsureAuthScopedStores();

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topbar />
        <main
          className={clsx(
            "flex-1 overflow-y-auto overflow-x-hidden",
            noGutters ? "p-0" : "p-4",
            contentBg,
            contentClassName
          )}
        >
          <FullscreenProvider>
            {children}   {/* fullscreen context available to any page */}
          </FullscreenProvider>
        </main>
      </div>
    </div>
  );
};

export default Layout;
