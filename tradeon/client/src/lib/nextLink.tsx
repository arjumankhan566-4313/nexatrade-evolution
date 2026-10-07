// @ts-nocheck
/** next/link shim — react-router Link that accepts the legacy `href` prop. */
import { Link as RRLLink } from 'react-router-dom';
export default function Link({ href, children, ...rest }) {
  return <RRLLink to={href} {...rest}>{children}</RRLLink>;
}
