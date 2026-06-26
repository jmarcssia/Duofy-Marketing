import type { SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement>

export function Icon({ children, className = "h-5 w-5", ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export function GridIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="6" height="6" rx="1.2" />
      <rect x="14" y="4" width="6" height="6" rx="1.2" />
      <rect x="4" y="14" width="6" height="6" rx="1.2" />
      <rect x="14" y="14" width="6" height="6" rx="1.2" />
    </Icon>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  )
}

export function FileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </Icon>
  )
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.2 2.2 4.8-5.2" />
    </Icon>
  )
}

export function MegaphoneIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4 13 3 1 10 5V5L7 10H4z" />
      <path d="M7 14v4a2 2 0 0 0 2 2h1" />
    </Icon>
  )
}

export function BotIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="8" width="14" height="10" rx="3" />
      <path d="M12 4v4" />
      <path d="M9 13h.01M15 13h.01" />
      <path d="M8 18v2M16 18v2" />
    </Icon>
  )
}

export function ChartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 20V10" />
      <path d="M12 20V4" />
      <path d="M19 20v-7" />
    </Icon>
  )
}

export function DollarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M15 9.5c-.7-1-4-1.4-4 1 0 2.7 5 1.2 5 4 0 2.3-3.6 2.2-5 1" />
    </Icon>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19 13.5v-3l-2-.4a7 7 0 0 0-.8-1.8l1.1-1.7-2.1-2.1-1.7 1a7 7 0 0 0-2-.7L11.2 3H8.8l-.4 2a7 7 0 0 0-2 .8l-1.6-1-2.1 2.1 1 1.7a7 7 0 0 0-.8 1.9L1 11v3l2 .4c.2.7.5 1.3.8 1.9l-1.1 1.6L4.8 20l1.7-1a7 7 0 0 0 1.9.8l.4 2h2.4l.4-2c.7-.2 1.4-.4 2-.8l1.6 1 2.1-2.1-1.1-1.6c.4-.6.7-1.2.8-1.9z" />
    </Icon>
  )
}

export function DatabaseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v10c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
      <path d="M5 10c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </Icon>
  )
}

export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </Icon>
  )
}

export function BuildingIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16" />
      <path d="M9 21v-5h3v5M8 7h1M12 7h1M8 11h1M12 11h1M17 9h3v12" />
    </Icon>
  )
}
