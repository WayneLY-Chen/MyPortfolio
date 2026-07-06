"use client";
import React, { useEffect, useState } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { cn } from "../../lib/utils";

export const AnimatedNumber = ({ value, className, precision = 0 }) => {
  const spring = useSpring(value, {
    mass: 1,
    stiffness: 100,
    damping: 15,
  });
  const display = useTransform(spring, (current) => 
    current.toFixed(precision).toLocaleString()
  );

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return (
    <motion.span className={cn("tabular-nums", className)}>
      {display}
    </motion.span>
  );
};
