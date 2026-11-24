/* Icons copied from the design HTML files; colors come from currentColor or CSS. */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
})

export function BackIcon({ size = 24, ...rest }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2} {...rest}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

export function SendIcon({ size = 22, ...rest }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2.2} {...rest}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  )
}

export function AssistantTabIcon({ size = 24, ...rest }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2} {...rest}>
      <path d="M12 2.5c-2.8 0-5 2.1-5 4.8 0 1.5.6 2.5 1.1 3.4.4.7.4 1.4 0 2.1-.6 1-1.6 2.2-1.6 4.2 0 3 2.5 5 5.5 5s5.5-2 5.5-5c0-2-1-3.2-1.6-4.2-.4-.7-.4-1.4 0-2.1.5-.9 1.1-1.9 1.1-3.4 0-2.7-2.2-4.8-5-4.8z" />
      <path d="M10.2 8h.01M13.8 8h.01" />
    </svg>
  )
}

export function RoutesTabIcon({ size = 24, ...rest }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2} {...rest}>
      <path d="M9 4L3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4zM9 4v13M15 6.5v13" />
    </svg>
  )
}

export function ProfileTabIcon({ size = 24, ...rest }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2} {...rest}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-4 4.5-5.5 8-5.5s6.5 1.5 8 5.5" />
    </svg>
  )
}

export function CheckIcon({ size = 22, ...rest }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2.5} {...rest}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

export function SpinnerIcon({ size = 22, ...rest }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2.5} {...rest}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  )
}

export function PendingIcon({ size = 22, ...rest }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2.5} {...rest}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  )
}
