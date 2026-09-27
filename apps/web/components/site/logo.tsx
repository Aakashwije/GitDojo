import { cn } from "@gitdojo/ui";
import Image from "next/image";
import mark from "@/public/brand/gitdojo-mark.png";

/** The GitDojo icon: a hexagonal "G" with a commit graph and a terminal prompt. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src={mark}
      alt=""
      aria-hidden="true"
      priority
      sizes="32px"
      className={cn("size-7 shrink-0", className)}
    />
  );
}

/**
 * Icon plus wordmark. The name is live text rather than part of the image so it stays crisp and
 * legible at navbar sizes; colors follow the logo artwork ("Git" light, "Dojo" blue).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[18px] font-bold tracking-tight text-fg">
        Git<span className="text-accent">Dojo</span>
      </span>
    </span>
  );
}
