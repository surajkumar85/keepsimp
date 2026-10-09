import Image from "next/image"

type EditorialImageProps = {
  src: string
  alt: string
  width: number
  height: number
  sizes: string
  className?: string
  eager?: boolean
}

/** Static responsive sources keep image delivery small without a server optimizer. */
export function EditorialImage({
  src,
  alt,
  width,
  height,
  sizes,
  className,
  eager = false,
}: EditorialImageProps) {
  const responsive =
    src === "/images/coastline-display.webp" ||
    src === "/images/private-workspace.webp"
  const base = src.replace(/\.webp$/, "")
  const largestWidth = src === "/images/coastline-display.webp" ? 960 : 1400
  return (
    <picture className="block">
      {responsive && (
        <source
          type="image/avif"
          srcSet={`${base}-640.avif 640w, ${base}.avif ${largestWidth}w`}
          sizes={sizes}
        />
      )}
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        className={className}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        unoptimized
      />
    </picture>
  )
}
