// @ts-nocheck
/** next/navigation shim — react-router equivalents for usePathname / useRouter. */
import { useLocation, useNavigate } from "@/tradeon-client/compat/react-router-dom";

export function usePathname() {
  return useLocation().pathname;
}

export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (path) => navigate(path),
    replace: (path) => navigate(path, { replace: true }),
    back: () => navigate(-1),
    forward: () => navigate(1),
    refresh: () => window.location.reload(),
  };
}
