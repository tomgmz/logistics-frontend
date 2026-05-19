"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

export interface ReusableModalProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  disableBackdropClose?: boolean;
}

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.93, y: 16 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 320,
      damping: 28,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 8,
    transition: {
      duration: 0.16,
      ease: "easeIn" as const,
    },
  },
};

const sheetVariants = {
  hidden: { opacity: 0, y: "100%" },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 300,
      damping: 32,
    },
  },
  exit: {
    opacity: 0,
    y: "100%",
    transition: {
      duration: 0.2,
      ease: "easeIn" as const,
    },
  },
};

export default function ReusableModal({
  open,
  title,
  description,
  confirmLabel = "Yes",
  cancelLabel = "No",
  onConfirm,
  onCancel,
  disableBackdropClose = false,
}: ReusableModalProps) {
  useEffect(() => {
    if (!open) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel?.();
    };

    window.addEventListener("keydown", handler);

    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isMobile =
    typeof window !== "undefined" && window.innerWidth < 640;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal-backdrop"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ duration: 0.2 }}
          onClick={disableBackdropClose ? undefined : onCancel}
          aria-modal="true"
          role="dialog"
          aria-labelledby="modal-title"
          aria-describedby={
            description ? "modal-description" : undefined
          }
          className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4"
          style={{
            backgroundColor: "rgba(0,0,0,0.55)",
            backdropFilter: "",
          }}
        >
          <motion.div
            key="modal-card"
            variants={isMobile ? sheetVariants : modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="relative flex flex-col w-full rounded-t-[18px] sm:rounded-[20px] max-w-full sm:max-w-[420px] md:max-w-[480px]"
            style={{ backgroundColor: "#424242" }}
          >
            <div
              className="flex justify-center pt-2.5 pb-1 sm:hidden"
              aria-hidden
            >
              <div className="w-8 h-[3px] rounded-full bg-white/25" />
            </div>

            <div className="px-5 sm:px-7 pt-4 sm:pt-5 pb-3">
              <h2
                id="modal-title"
                className="m-0 text-white break-words"
                style={{
                  fontFamily: "'Alegreya Sans SC', sans-serif",
                  fontWeight: 700,
                  fontSize: "clamp(15px, 3.5vw, 20px)",
                  lineHeight: "1.25",
                  letterSpacing: "0.02em",
                }}
              >
                {title}
              </h2>

              {description && (
                <p
                  id="modal-description"
                  className="mt-2 m-0 text-white/75 break-words"
                  style={{
                    fontFamily: "'Alegreya Sans', sans-serif",
                    fontWeight: 400,
                    fontSize: "clamp(12px, 2.8vw, 15px)",
                    lineHeight: "1.55",
                  }}
                >
                  {description}
                </p>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 px-5 pt-2 pb-7 sm:flex-row sm:justify-end sm:px-7 sm:pb-5 sm:pt-1">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                onClick={onCancel}
                className="flex items-center justify-center rounded-[8px] text-white cursor-pointer select-none w-full h-[44px] sm:w-[88px] sm:h-[40px]"
                style={{
                  border: "1px solid #818181",
                  background: "transparent",
                  fontFamily: "'Alegreya Sans SC', sans-serif",
                  fontWeight: 400,
                  fontSize: "clamp(13px, 2.5vw, 15px)",
                }}
              >
                {cancelLabel}
              </motion.button>

              <motion.button
                whileHover={{
                  scale: 1.03,
                  backgroundColor: "rgba(255,255,255,0.18)",
                }}
                whileTap={{ scale: 0.96 }}
                onClick={onConfirm}
                className="flex items-center justify-center rounded-[8px] text-white cursor-pointer select-none w-full h-[44px] sm:w-[88px] sm:h-[40px]"
                style={{
                  backgroundColor: "rgba(255,255,255,0.10)",
                  border: "none",
                  fontFamily: "'Alegreya Sans SC', sans-serif",
                  fontWeight: 400,
                  fontSize: "clamp(13px, 2.5vw, 15px)",
                }}
              >
                {confirmLabel}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── RemarksModal ──────────────────────────────────────────────────────────────

export interface RemarksModalProps {
  open: boolean;
  title: string;
  description?: string;
  remarksLabel?: string;
  remarksPlaceholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: (remarks: string) => void;
  onCancel?: () => void;
  disableBackdropClose?: boolean;
  busy?: boolean;
}

export function RemarksModal({
  open,
  title,
  description,
  remarksLabel = "Remarks",
  remarksPlaceholder = "Provide a reason…",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  disableBackdropClose = false,
  busy = false,
}: RemarksModalProps) {
  const [remarks, setRemarks] = useState("");

  const handleCancel = () => {
    setRemarks("");
    onCancel?.();
  };

  const handleConfirm = () => {
    const trimmed = remarks.trim();

    if (!trimmed) return;

    onConfirm?.(trimmed);
    setRemarks("");
  };

  useEffect(() => {
    if (!open) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        handleCancel();
      }
    };

    window.addEventListener("keydown", handler);

    return () => window.removeEventListener("keydown", handler);
  }, [open, busy]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isMobile =
    typeof window !== "undefined" && window.innerWidth < 640;

  const trimmed = remarks.trim();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="remarks-backdrop"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ duration: 0.2 }}
          onClick={
            disableBackdropClose || busy
              ? undefined
              : handleCancel
          }
          aria-modal="true"
          role="dialog"
          aria-labelledby="remarks-modal-title"
          className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
        >
          <motion.div
            key="remarks-card"
            variants={isMobile ? sheetVariants : modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="relative flex flex-col w-full rounded-t-[18px] sm:rounded-[20px] max-w-full sm:max-w-[420px] md:max-w-[480px]"
            style={{ backgroundColor: "#424242" }}
          >
            <div
              className="flex justify-center pt-2.5 pb-1 sm:hidden"
              aria-hidden
            >
              <div className="w-8 h-[3px] rounded-full bg-white/25" />
            </div>

            <div className="px-5 sm:px-7 pt-4 sm:pt-5 pb-3 space-y-3">
              <h2
                id="remarks-modal-title"
                className="m-0 text-white break-words"
                style={{
                  fontFamily: "'Alegreya Sans SC', sans-serif",
                  fontWeight: 700,
                  fontSize: "clamp(15px, 3.5vw, 20px)",
                  lineHeight: "1.25",
                  letterSpacing: "0.02em",
                }}
              >
                {title}
              </h2>

              {description && (
                <p
                  className="m-0 text-white/75 break-words"
                  style={{
                    fontFamily: "'Alegreya Sans', sans-serif",
                    fontWeight: 400,
                    fontSize: "clamp(12px, 2.8vw, 15px)",
                    lineHeight: "1.55",
                  }}
                >
                  {description}
                </p>
              )}

              <div className="space-y-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-white/50">
                  {remarksLabel}{" "}
                  <span className="text-red-400">*</span>
                </label>

                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder={remarksPlaceholder}
                  rows={3}
                  disabled={busy}
                  className="w-full rounded-lg border border-white/10 bg-black/30 text-sm text-white/85
                             px-3 py-2 outline-none resize-none placeholder:text-white/30
                             focus:border-red-400/50 disabled:opacity-50 transition-colors"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 px-5 pt-2 pb-7 sm:flex-row sm:justify-end sm:px-7 sm:pb-5 sm:pt-1">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                disabled={busy}
                onClick={handleCancel}
                className="flex items-center justify-center rounded-[8px] text-white cursor-pointer
                           select-none w-full h-[44px] sm:w-[88px] sm:h-[40px] disabled:opacity-40"
                style={{
                  border: "1px solid #818181",
                  background: "transparent",
                  fontFamily: "'Alegreya Sans SC', sans-serif",
                  fontWeight: 400,
                  fontSize: "clamp(13px, 2.5vw, 15px)",
                }}
              >
                {cancelLabel}
              </motion.button>

              <motion.button
                whileHover={
                  !busy && trimmed
                    ? {
                        scale: 1.03,
                        backgroundColor:
                          "rgba(248,113,113,0.25)",
                      }
                    : {}
                }
                whileTap={
                  !busy && trimmed
                    ? { scale: 0.96 }
                    : {}
                }
                disabled={busy || !trimmed}
                onClick={handleConfirm}
                className="flex items-center justify-center rounded-[8px] cursor-pointer
                           select-none w-full h-[44px] sm:w-[88px] sm:h-[40px] disabled:opacity-40
                           disabled:cursor-not-allowed transition-colors"
                style={{
                  backgroundColor: "rgba(248,113,113,0.15)",
                  border:
                    "1px solid rgba(248,113,113,0.35)",
                  fontFamily:
                    "'Alegreya Sans SC', sans-serif",
                  fontWeight: 400,
                  fontSize: "clamp(13px, 2.5vw, 15px)",
                  color: "#fca5a5",
                }}
              >
                {busy ? "Submitting…" : confirmLabel}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}