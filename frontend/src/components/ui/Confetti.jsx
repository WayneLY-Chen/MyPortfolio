"use client";
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const Confetti = ({ active, duration = 3000, color = "#C8942A" }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (active) {
      setIsVisible(true);
      const timer = setTimeout(() => setIsVisible(false), duration);
      return () => clearTimeout(timer);
    }
  }, [active, duration]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {Array.from({ length: 50 }).map((_, i) => (
        <ConfettiPiece key={i} color={color} />
      ))}
    </div>
  );
};

const ConfettiPiece = ({ color }) => {
  const x = Math.random() * 100;
  const initialY = -20;
  const duration = 2 + Math.random() * 3;
  const delay = Math.random() * 2;
  const size = 5 + Math.random() * 10;
  const rotation = Math.random() * 360;

  return (
    <motion.div
      initial={{ top: `${initialY}%`, left: `${x}%`, rotate: 0, opacity: 1 }}
      animate={{
        top: "120%",
        rotate: rotation + 720,
        opacity: [1, 1, 0],
      }}
      transition={{
        duration: duration,
        delay: delay,
        ease: "linear",
      }}
      style={{
        position: "absolute",
        width: size,
        height: size,
        background: color,
        borderRadius: Math.random() > 0.5 ? "0%" : "50%",
      }}
    />
  );
};
