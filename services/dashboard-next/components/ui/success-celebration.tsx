"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, PartyPopper, Sparkles } from "lucide-react";

interface SuccessCelebrationProps {
  show: boolean;
  title?: string;
  message?: string;
  onComplete?: () => void;
}

export function SuccessCelebration({
  show,
  title = "Success!",
  message = "Operation completed successfully",
  onComplete,
}: SuccessCelebrationProps) {
  const [confetti, setConfetti] = useState<{ x: number; y: number; rotation: number; scale: number }[]>([]);

  useEffect(() => {
    if (show) {
      const particles = Array.from({ length: 50 }).map(() => ({
        x: Math.random() * 100 - 50,
        y: Math.random() * -100 - 50,
        rotation: Math.random() * 360,
        scale: Math.random() * 0.5 + 0.5,
      }));
      setConfetti(particles);

      const timer = setTimeout(() => {
        onComplete?.();
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={onComplete}
        >
          <div className="relative">
            {confetti.map((particle, i) => (
              <motion.div
                key={i}
                initial={{ 
                  x: 0, 
                  y: 0, 
                  scale: 0, 
                  rotate: 0,
                  opacity: 1 
                }}
                animate={{ 
                  x: particle.x * 6, 
                  y: particle.y * 3, 
                  scale: particle.scale,
                  rotate: particle.rotation,
                  opacity: 0
                }}
                transition={{ 
                  duration: 1.5, 
                  ease: "easeOut",
                  delay: Math.random() * 0.2
                }}
                className="absolute left-1/2 top-1/2 pointer-events-none"
              >
                <Sparkles 
                  className="h-4 w-4" 
                  style={{ 
                    color: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'][i % 6] 
                  }} 
                />
              </motion.div>
            ))}

            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              transition={{ 
                type: "spring", 
                stiffness: 200, 
                damping: 15 
              }}
              className="relative z-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-8 text-center shadow-2xl"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="mb-4"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/20">
                  <CheckCircle2 className="h-10 w-10 text-white" />
                </div>
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-2xl font-bold text-white mb-2"
              >
                {title}
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-white/80"
              >
                {message}
              </motion.p>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-4 flex items-center justify-center gap-2 text-white/60 text-sm"
              >
                <PartyPopper className="h-4 w-4" />
                Click anywhere to continue
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SuccessToast({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex items-center gap-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg"
    >
      <motion.div
        animate={{ rotate: [0, 10, -10, 0] }}
        transition={{ repeat: 2, duration: 0.3 }}
      >
        <CheckCircle2 className="h-5 w-5" />
      </motion.div>
      <span className="font-medium">{message}</span>
    </motion.div>
  );
}
