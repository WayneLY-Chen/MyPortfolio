"use client";
import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";

export const BackgroundBeams = ({ className }) => {
  return (
    <div
      className={cn(
        "absolute inset-0 z-0 h-full w-full pointer-events-none overflow-hidden",
        className
      )}
    >
      <div className="absolute inset-0 bg-[#0e0a06]" />
      <svg
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="15" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <Beams />
      </svg>
    </div>
  );
};

const Beams = () => {
  const beams = [
    { x: "10%", y: "20%", rotate: 45, duration: 15 },
    { x: "80%", y: "10%", rotate: -30, duration: 25 },
    { x: "30%", y: "70%", rotate: 15, duration: 20 },
    { x: "70%", y: "80%", rotate: -15, duration: 18 },
    { x: "50%", y: "50%", rotate: 90, duration: 30 },
  ];

  return (
    <>
      {beams.map((beam, i) => (
        <motion.rect
          key={i}
          x={beam.x}
          y={beam.y}
          width="1px"
          height="600px"
          fill="url(#beam-gradient)"
          initial={{ opacity: 0, rotate: beam.rotate }}
          animate={{
            opacity: [0, 0.4, 0],
            y: ["-20%", "120%"],
          }}
          transition={{
            duration: beam.duration,
            repeat: Infinity,
            ease: "linear",
            delay: i * 2,
          }}
          style={{ filter: "url(#glow)" }}
        />
      ))}
      <defs>
        <linearGradient id="beam-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="50%" stopColor="#C8942A" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
    </>
  );
};
