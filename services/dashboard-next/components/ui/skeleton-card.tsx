"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SkeletonCardProps {
  className?: string;
  rows?: number;
}

export function SkeletonCard({ className, rows = 3 }: SkeletonCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        "rounded-xl border bg-card p-6 space-y-4",
        className
      )}
    >
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-lg bg-muted animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-2/3 rounded bg-muted animate-pulse" />
          <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded bg-muted animate-pulse"
            style={{ width: `${80 - i * 15}%` }}
          />
        ))}
      </div>
      <div className="flex gap-2 pt-2">
        <div className="h-8 w-20 rounded-md bg-muted animate-pulse" />
        <div className="h-8 w-16 rounded-md bg-muted animate-pulse" />
      </div>
    </motion.div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 p-4", className)}>
      <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
      </div>
      <div className="h-8 w-24 rounded-md bg-muted animate-pulse" />
    </div>
  );
}

export function SkeletonStats() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className="rounded-xl border bg-card p-4"
        >
          <div className="flex justify-between items-center">
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
            <div className="h-6 w-12 rounded-full bg-muted animate-pulse" />
          </div>
          <div className="h-8 w-24 rounded bg-muted animate-pulse mt-2" />
        </motion.div>
      ))}
    </div>
  );
}
