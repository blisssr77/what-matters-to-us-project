import clsx from "clsx";
import { isValidElement, cloneElement } from "react";
import { useFullscreen } from "./FullscreenProvider";

export default function FullscreenCard({ asChild = false, className = "", children }) {
  const { isFullscreen } = useFullscreen();

  const fullCls =
    "fixed inset-0 z-[100] bg-white " +
    "w-full h-full max-w-none !m-0 !rounded-none !shadow-none " + // ← no 100vw/100vh
    "overflow-y-auto overflow-x-hidden " +
    "p-4 sm:p-6 md:p-8 " +
    "min-w-0"; // ← allow children to shrink

  if (asChild && isValidElement(children)) {
    return cloneElement(children, {
      className: clsx(
        "relative transition-[all] duration-200 min-h-0 min-w-0",
        children.props.className,
        isFullscreen ? fullCls : ""
      ),
    });
  }

  return (
    <div
      className={clsx(
        "relative transition-[all] duration-200 min-h-0 min-w-0",
        className,
        isFullscreen ? fullCls : ""
      )}
    >
      {children}
    </div>
  );
}