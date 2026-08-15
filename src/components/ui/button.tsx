import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentPropsWithoutRef } from "react";

const baseClassName =
  "inline-flex min-h-11 items-center justify-center rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground no-underline shadow-[var(--shadow-subtle)] transition-colors hover:bg-secondary-foreground focus-visible:bg-secondary-foreground disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none";

export function Button({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${baseClassName} ${className}`.trim()} {...props} />
  );
}

export function ButtonLink({
  className = "",
  ...props
}: ComponentPropsWithoutRef<typeof Link>) {
  return <Link className={`${baseClassName} ${className}`.trim()} {...props} />;
}
