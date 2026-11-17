import Image from "next/image";
import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * The official Sports Sphere roundel (public/brand/sports-sphere-logo.png, the client's file).
 * Served as the original PNG (`unoptimized`): it is detailed artwork, and re-compression blurs the
 * small text. One file, cached once, for every size.
 */
export function LogoMark({ size = 64, className, priority, alt = "" }: { size?: number; className?: string; priority?: boolean; alt?: string }) {
  return (
    <Image
      src="/brand/sports-sphere-logo.png"
      alt={alt}
      width={size}
      height={size}
      priority={priority}
      unoptimized
      className={cn("shrink-0 rounded-full bg-white", className)}
    />
  );
}

/**
 * Roundel + "SPORTS SPHERE" wordmark in the logo's navy / orange, heavy italic like the logo.
 * The roundel is 64px: MIT-WPU Brand Book 2026 p.6 sets 60px as the minimum digital logo size.
 * `stacked`: always two lines (narrow sidebars); "mobile" (default): two lines below 640px.
 */
export function Logo({ className, href = "/", stacked = "mobile" }: { className?: string; href?: string; stacked?: boolean | "mobile" }) {
  return (
    <Link href={href} className={cn("flex min-h-11 items-center gap-3", className)} aria-label={`${APP_NAME} home`}>
      <LogoMark size={64} priority />
      <span
        className={cn(
          "flex font-heading leading-none font-black tracking-tight whitespace-nowrap uppercase italic",
          stacked === true ? "flex-col text-lg" : "flex-col text-lg sm:flex-row sm:gap-[0.3em] sm:text-2xl",
        )}
      >
        <span className="text-wordmark-1">Sports</span>
        <span className="text-wordmark-2">Sphere</span>
      </span>
    </Link>
  );
}
