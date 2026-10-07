/**
 * Compatibility shim: the TRADEON v2 client was written against
 * react-router-dom v6. This project uses TanStack Router (fixed platform
 * router), so these wrappers map the react-router-dom API surface the
 * client uses onto TanStack Router. Do NOT install react-router-dom.
 */
import {
  Link as TanLink,
  Navigate as TanNavigate,
  Outlet as TanOutlet,
  useLocation as tanUseLocation,
  useNavigate as tanUseNavigate,
  useParams as tanUseParams,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import { forwardRef, type CSSProperties, type MouseEventHandler, type ReactNode } from 'react';

export const Outlet = TanOutlet;

type ToProps = {
  to: string;
  replace?: boolean;
  state?: unknown;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  title?: string;
  'aria-label'?: string;
  [key: string]: any;
};

export const Link = forwardRef<HTMLAnchorElement, ToProps>(function Link(
  { to, replace, state, children, ...rest },
  ref,
) {
  return (
    <TanLink ref={ref} to={to as never} replace={replace} {...(rest as object)}>
      {children}
    </TanLink>
  );
});

type NavLinkProps = Omit<ToProps, 'className'> & {
  end?: boolean;
  className?: string | ((state: { isActive: boolean }) => string);
};

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink(
  { to, end, className, children, ...rest },
  ref,
) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
  const cls = typeof className === 'function' ? className({ isActive }) : className;
  return (
    <TanLink ref={ref} to={to as never} className={cls} {...(rest as object)}>
      {children}
    </TanLink>
  );
});

export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  return <TanNavigate to={to as never} replace={replace} />;
}

export function useNavigate() {
  const navigate = tanUseNavigate();
  const router = useRouter();
  return (to: string | number, options?: { replace?: boolean; state?: unknown }) => {
    if (typeof to === 'number') {
      router.history.go(to);
      return;
    }
    void navigate({ to: to as never, replace: options?.replace });
  };
}

export function useLocation() {
  return tanUseLocation();
}

export function useParams(): Record<string, string> {
  return tanUseParams({ strict: false }) as Record<string, string>;
}

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams) => void] {
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const navigate = tanUseNavigate();
  const params = new URLSearchParams(searchStr);
  const setParams = (next: URLSearchParams) => {
    void navigate({ to: `.` as never, search: next.toString() as never, replace: true });
  };
  return [params, setParams];
}
