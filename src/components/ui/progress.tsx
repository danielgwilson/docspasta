"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  indicatorClassName?: string
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, indicatorClassName, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "h-full w-full flex-1 bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300 ease-out",
          indicatorClassName
        )}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </div>
  )
)
Progress.displayName = "Progress"

export { Progress }