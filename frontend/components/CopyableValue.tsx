"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

/** Mono value with a copy affordance that appears on hover. */
export default function CopyableValue({
  value,
  display,
  className = "",
  truncate = false,
}: {
  value: string;
  display?: string;
  className?: string;
  truncate?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <span
      className={`group/cv inline-flex max-w-full items-center gap-1 ${className}`}
    >
      <span
        className={`mono text-[12px] text-text ${truncate ? "truncate" : ""}`}
      >
        {display ?? value}
      </span>
      <button
        onClick={copy}
        title={`Copy ${value}`}
        aria-label={`Copy ${display ?? value}`}
        className={`shrink-0 rounded p-0.5 text-faint transition-opacity hover:text-text ${
          copied ? "opacity-100" : "opacity-0 group-hover/cv:opacity-100"
        } focus-visible:opacity-100`}
      >
        {copied ? (
          <Check size={12} className="text-healthy" />
        ) : (
          <Copy size={12} />
        )}
      </button>
    </span>
  );
}
