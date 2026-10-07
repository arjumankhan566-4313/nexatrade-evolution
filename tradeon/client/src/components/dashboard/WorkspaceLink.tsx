// @ts-nocheck
/**
 * WorkspaceLink shim (legacy `@/components/dashboard/WorkspaceLink`).
 * Legacy uses `<Link href="/dashboard/kyc">`; react-router needs `to`.
 *
 * The implementation lives here rather than re-exported from `lib/legacyInfra`:
 * a module that mixes components with plain helpers (`api`, `alert`, …) is not a
 * Vite Fast Refresh boundary, so editing it invalidated this module and forced a
 * full reload of every importer instead of a hot update.
 */
import { Link as RouterLink } from 'react-router-dom';

export default function Link({ href, children, className, style, ...rest }) {
  return (
    <RouterLink to={href} className={className} style={style} {...rest}>
      {children}
    </RouterLink>
  );
}
