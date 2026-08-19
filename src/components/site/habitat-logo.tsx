import Image from "next/image";

const logoAssets = {
  black: {
    src: "/brand/fayette-county-habitat-logo-horizontal-black.png",
    width: 5487,
    height: 1839,
  },
  white: {
    src: "/brand/fayette-county-habitat-logo-horizontal-white.png",
    width: 11700,
    height: 4500,
  },
} as const;

export type HabitatLogoVariant = keyof typeof logoAssets;

export function HabitatLogo({
  variant = "black",
  className,
  priority = false,
}: {
  variant?: HabitatLogoVariant;
  className?: string;
  priority?: boolean;
}) {
  const asset = logoAssets[variant];
  return (
    <Image
      className={className}
      src={asset.src}
      alt="Fayette County Habitat for Humanity"
      width={asset.width}
      height={asset.height}
      priority={priority}
      data-brand-logo="fayette-county-habitat"
      data-logo-variant={variant}
      data-logo-minimum-h-height="10"
    />
  );
}
