import Image from "next/image"

export function BrandLogo() {
  return (
    <>
      <Image
        src="/brand/keepsimp-logo.svg"
        width={268}
        height={64}
        alt=""
        className="h-7 w-auto dark:hidden"
        unoptimized
      />
      <Image
        src="/brand/keepsimp-logo-dark.svg"
        width={268}
        height={64}
        alt=""
        className="hidden h-7 w-auto dark:block"
        unoptimized
      />
    </>
  )
}
