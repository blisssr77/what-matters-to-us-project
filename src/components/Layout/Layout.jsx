import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import clsx from "clsx";

const Layout = ({
  children,
  noGutters = false,          // 🔹 set true to remove the inner padding
  contentClassName = "",      // 🔹 optional extra classes for <main>
  contentBg = "bg-gray-100",  // 🔹 override page background if needed
}) => {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topbar />
        <main
          className={clsx(
            "flex-1 overflow-y-auto",
            noGutters ? "p-0" : "p-4",
            contentBg,
            contentClassName
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
