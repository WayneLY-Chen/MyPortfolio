"use client";
import React, { useState, useEffect, createContext, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";
import { cn } from "../../lib/utils";

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = (toast) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, ...toast }]);
    if (toast.duration !== Infinity) {
      setTimeout(() => {
        removeToast(id);
      }, toast.duration || 4000);
    }
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
};

const Toast = ({ title, description, variant = "default", onClose }) => {
  const variants = {
    default: "bg-[#0e0a06] border-white/10 text-white",
    success: "bg-[#0e0a06] border-[#C8942A]/50 text-white",
    error: "bg-[#0e0a06] border-red-500/50 text-white",
  };

  const icons = {
    default: <Info className="h-5 w-5 text-zinc-400" />,
    success: <CheckCircle className="h-5 w-5 text-[#C8942A]" />,
    error: <AlertCircle className="h-5 w-5 text-red-500" />,
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.95 }}
      className={cn(
        "pointer-events-auto flex w-[350px] items-start gap-4 rounded-xl border p-4 shadow-2xl backdrop-blur-md",
        variants[variant]
      )}
    >
      <div className="shrink-0 pt-0.5">{icons[variant]}</div>
      <div className="flex-1">
        {title && <h5 className="font-bold text-sm mb-1">{title}</h5>}
        {description && <p className="text-zinc-400 text-xs leading-relaxed">{description}</p>}
      </div>
      <button
        onClick={onClose}
        className="shrink-0 rounded-lg p-1 opacity-50 hover:opacity-100 transition-opacity"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
};
