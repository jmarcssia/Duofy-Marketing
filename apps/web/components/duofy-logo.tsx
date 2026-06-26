import Image from "next/image"

export function DuofyLogo({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <Image
        src="/brand/LOGO-SITE-2.svg"
        alt="Duofy"
        width={44}
        height={44}
        className="h-10 w-10 object-left object-cover"
        priority
      />
    )
  }

  return (
    <Image
      src="/brand/LOGO-SITE-2.svg"
      alt="Duofy"
      width={172}
      height={60}
      className="h-auto w-[154px]"
      priority
    />
  )
}
