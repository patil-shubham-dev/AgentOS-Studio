import { useState, useCallback } from "react"
import { Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface CopyButtonProps {
  text: string
  className?: string
  label?: string
}

export function CopyButton({ text, className, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "flex items-center gap-1 text-[9px] transition-all",
        copied
          ? "text-emerald-400/60"
          : "text-white/20 hover:text-white/50",
        className,
      )}
      title="Copy"
    >
      {copied ? (
        <Check className="h-2.5 w-2.5" />
      ) : (
        <Copy className="h-2.5 w-2.5" />
      )}
      {label && <span>{copied ? "Copied" : label}</span>}
    </button>
  )
}
