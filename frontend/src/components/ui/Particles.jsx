"use client";
import React, { useEffect, useRef } from "react";
import { cn } from "../../lib/utils";

export const Particles = ({ className, quantity = 30, staticity = 50, ease = 50, color = "#C8942A" }) => {
  const canvasRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const particles = useRef([]);
  const mouse = useRef({ x: 0, y: 0 });
  const canvasSize = useRef({ w: 0, h: 0 });
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;

  useEffect(() => {
    if (canvasRef.current) {
      initCanvas();
    }
    const loop = () => {
      animate();
      rafId = requestAnimationFrame(loop);
    };
    let rafId = requestAnimationFrame(loop);
    window.addEventListener("resize", initCanvas, { passive: true });

    return () => {
      window.removeEventListener("resize", initCanvas);
      cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    onMouseMove();
  }, [mouse.current.x, mouse.current.y]);

  const initCanvas = () => {
    resizeCanvas();
    drawParticles();
  };

  const onMouseMove = () => {
    if (canvasContainerRef.current) {
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const { w, h } = canvasSize.current;
      const x = mouse.current.x - rect.left - w / 2;
      const y = mouse.current.y - rect.top - h / 2;
      const unitX = x / (w / 2);
      const unitY = y / (h / 2);
      mouse.current.x = x;
      mouse.current.y = y;
    }
  };

  const resizeCanvas = () => {
    if (canvasContainerRef.current && canvasRef.current) {
      particles.current = [];
      canvasSize.current.w = canvasContainerRef.current.offsetWidth;
      canvasSize.current.h = canvasContainerRef.current.offsetHeight;
      canvasRef.current.width = canvasSize.current.w * dpr;
      canvasRef.current.height = canvasSize.current.h * dpr;
      canvasRef.current.style.width = `${canvasSize.current.w}px`;
      canvasRef.current.style.height = `${canvasSize.current.h}px`;
      const context = canvasRef.current.getContext("2d");
      context.scale(dpr, dpr);
    }
  };

  const particleParams = () => {
    const x = Math.floor(Math.random() * canvasSize.current.w);
    const y = Math.floor(Math.random() * canvasSize.current.h);
    const translateX = 0;
    const translateY = 0;
    const pX = x;
    const pY = y;
    const size = Math.floor(Math.random() * 2) + 0.1;
    const alpha = 0;
    const targetAlpha = parseFloat((Math.random() * 0.6 + 0.1).toFixed(1));
    const dx = (Math.random() - 0.5) * 0.1;
    const dy = (Math.random() - 0.5) * 0.1;
    const magnetism = 0.1 + Math.random() * 4;
    return {
      x,
      y,
      translateX,
      translateY,
      size,
      alpha,
      targetAlpha,
      dx,
      dy,
      magnetism,
    };
  };

  const drawParticles = () => {
    for (let i = 0; i < quantity; i++) {
      const particle = particleParams();
      particles.current.push(particle);
    }
  };

  const remapValue = (value, start1, end1, start2, end2) => {
    const remapped =
      ((value - start1) * (end2 - start2)) / (end1 - start1) + start2;
    return remapped > 0 ? remapped : 0;
  };

  const drawCircle = (circle, update = false) => {
    const context = canvasRef.current.getContext("2d");
    const { x, y, translateX, translateY, size, alpha } = circle;
    context.translate(translateX, translateY);
    context.beginPath();
    context.arc(x, y, size, 0, 2 * Math.PI);
    context.fillStyle = `rgba(${hexToRgb(color)}, ${alpha})`;
    context.fill();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!update) {
      circle.alpha += 0.01;
      if (circle.alpha > circle.targetAlpha) {
        circle.alpha = circle.targetAlpha;
      }
    }
  };

  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return "200, 148, 42";
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
  };

  const animate = () => {
    const context = canvasRef.current.getContext("2d");
    context.clearRect(0, 0, canvasSize.current.w, canvasSize.current.h);
    particles.current.forEach((particle, i) => {
      // Handle the alpha
      const edge = [
        particle.x + particle.translateX - particle.size, // left
        canvasSize.current.w - particle.x - particle.translateX - particle.size, // right
        particle.y + particle.translateY - particle.size, // top
        canvasSize.current.h - particle.y - particle.translateY - particle.size, // bottom
      ];
      const closestEdge = Math.min(...edge);
      const remapClosestEdge = parseFloat(
        remapValue(closestEdge, 0, 20, 0, 1).toFixed(2)
      );
      if (remapClosestEdge > 1) {
        particle.alpha += 0.02;
        if (particle.alpha > particle.targetAlpha) {
          particle.alpha = particle.targetAlpha;
        }
      } else {
        particle.alpha = particle.targetAlpha * remapClosestEdge;
      }
      particle.x += particle.dx;
      particle.y += particle.dy;
      particle.translateX +=
        (mouse.current.x / (staticity / particle.magnetism) -
          particle.translateX) /
        ease;
      particle.translateY +=
        (mouse.current.y / (staticity / particle.magnetism) -
          particle.translateY) /
        ease;
      // circle 
      if (
        particle.x < -particle.size ||
        particle.x > canvasSize.current.w + particle.size ||
        particle.y < -particle.size ||
        particle.y > canvasSize.current.h + particle.size
      ) {
        // remove circle from array
        particles.current.splice(i, 1);
        // add new circle
        const newParticle = particleParams();
        drawCircle(newParticle);
        particles.current.push(newParticle);
      } else {
        drawCircle(
          {
            ...particle,
            x: particle.x,
            y: particle.y,
            translateX: particle.translateX,
            translateY: particle.translateY,
            alpha: particle.alpha,
          },
          true
        );
      }
    });
  };

  return (
    <div
      className={cn("absolute inset-0 pointer-events-none", className)}
      ref={canvasContainerRef}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
    </div>
  );
};
