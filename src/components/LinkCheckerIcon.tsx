import type {ComponentPropsWithRef, JSX} from 'react'

/**
 * Plain inline SVG, not sourced from @sanity/icons - that package had a breaking rewrite at
 * v5 (named icon exports removed in favor of a symbol-map API), so pinning any version of it
 * risks a hard collision with whatever version the host Studio itself depends on. This has
 * zero dependency surface and works regardless of the consumer's own icon setup.
 */
export function LinkCheckerIcon(props: ComponentPropsWithRef<'svg'>): JSX.Element {
  return (
    <svg
      viewBox="0 0 25 25"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      {...props}
    >
      <path
        d="M9 15.5a3 3 0 0 1 0-4.24l2-2a3 3 0 0 1 4.24 0"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 9.5a3 3 0 0 1 0 4.24l-2 2a3 3 0 0 1-4.24 0"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
