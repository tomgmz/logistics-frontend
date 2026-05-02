"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, Check, Download, CheckCheck, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
interface Notification {
  notification_id: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  attachment_url?: string;
}

/* ─────────────────────────────────────────────
   Sample data
───────────────────────────────────────────── */
const SAMPLE_NOTIFICATIONS: Notification[] = [
  {
    notification_id: "1",
    title: "Booking Confirmed",
    body: "Your booking #BK-00421 from Makati to BGC has been confirmed and assigned to Driver Reyes.",
    created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    read_at: null,
  },
  {
    notification_id: "2",
    title: "Driver En Route",
    body: "Driver Santos is 10 minutes away from your pickup point at Ayala Ave, Makati.",
    created_at: new Date(Date.now() - 1000 * 60 * 32).toISOString(),
    read_at: null,
  },
  {
    notification_id: "3",
    title: "Prescription Ready",
    body: "Your prescription document for booking #BK-00418 is ready for download.",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    read_at: null,
    attachment_url: "/sample-prescription.pdf",
  },
  {
    notification_id: "4",
    title: "Delivery Completed",
    body: "Booking #BK-00410 has been successfully delivered. Please rate your experience.",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    read_at: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
  },
  {
    notification_id: "5",
    title: "Payment Received",
    body: "Payment of ₱1,250.00 for booking #BK-00410 has been successfully processed.",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString(),
    read_at: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
  },
];

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */
const isPrescription = (title: string) =>
  title.toLowerCase().includes("prescription");

const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

/* ─────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────── */
interface NotifItemProps {
  n: Notification;
  onToggleRead: (n: Notification) => void;
}

function PdfNotifItem({ n, onToggleRead }: NotifItemProps) {
  const isUnread = !n.read_at;
  const linkHref = n.attachment_url || "#";

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
    if (!n.attachment_url) {
      e.preventDefault();
      return;
    }
    if (!n.read_at) onToggleRead(n);
  };

  return (
    <a
      href={linkHref}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: "none", display: "block" }}
      onClick={handleClick}
    >
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 3 }}>
        <span style={{ fontFamily: "'Darker Grotesque'", fontWeight: 700, fontSize: 14, color: isUnread ? "#fff" : "rgba(255,255,255,0.5)" }}>
          {n.title}
        </span>
        <span className="pdf-badge">
          <Download size={8} />
          PDF
        </span>
      </div>
      <p style={{ fontFamily: "'Darker Grotesque'", fontSize: 13, color: "rgba(255,255,255,0.38)", lineHeight: 1.5, margin: "0 0 5px" }}>
        {n.body}
      </p>
      <span className="notif-aboreto" style={{ fontSize: 10, letterSpacing: "0.06em", color: "rgba(255,255,255,0.2)" }}>
        {timeAgo(n.created_at)}
      </span>
    </a>
  );
}

function RegularNotifItem({ n }: Pick<NotifItemProps, "n">) {
  const isUnread = !n.read_at;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontFamily: "'Darker Grotesque'", fontWeight: 700, fontSize: 14, color: isUnread ? "#fff" : "rgba(255,255,255,0.5)" }}>
          {n.title}
        </span>
        <ChevronRight size={13} style={{ color: "rgba(255,255,255,0.18)", flexShrink: 0, marginLeft: 6 }} />
      </div>
      <p style={{ fontFamily: "'Darker Grotesque'", fontSize: 13, color: "rgba(255,255,255,0.38)", lineHeight: 1.5, margin: "0 0 5px" }}>
        {n.body}
      </p>
      <span className="notif-aboreto" style={{ fontSize: 10, letterSpacing: "0.06em", color: "rgba(255,255,255,0.2)" }}>
        {timeAgo(n.created_at)}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Component
───────────────────────────────────────────── */
export default function NotificationIcon() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [, setTick] = useState(0);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  // ── Load ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // TODO: replace with your API, e.g.:
      // const res = await fetch("/api/notifications");
      // const data: Notification[] = await res.json();
      // if (!cancelled) setNotifications(data);
      if (!cancelled) setNotifications(SAMPLE_NOTIFICATIONS);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // ── Refresh relative timestamps every minute ─
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Actions ──────────────────────────────────
  const toggleRead = useCallback((n: Notification) => {
    // TODO: PATCH /api/notifications/:id
    const updatedReadAt = n.read_at ? null : new Date().toISOString();
    setNotifications((prev) =>
      prev.map((item) =>
        item.notification_id === n.notification_id
          ? { ...item, read_at: updatedReadAt }
          : item
      )
    );
  }, []);

  const markAllAsRead = useCallback(async () => {
    // TODO: PATCH /api/notifications/mark-all-read
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: now })));
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Aboreto&family=Darker+Grotesque:wght@400;500;600;700&display=swap');

        .notif-panel {
          background: #0d0d0d !important;
          border: 1px solid rgba(255,255,255,0.08) !important;
          border-radius: 16px !important;
          box-shadow: 0 32px 80px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.03) !important;
          font-family: 'Darker Grotesque', sans-serif;
          padding: 0 !important;
          overflow: hidden;
          width: min(420px, 95vw) !important;
        }
        .notif-aboreto { font-family: 'Aboreto', sans-serif; }

        .notif-item {
          border-bottom: 1px solid rgba(255,255,255,0.05);
          padding: 12px 18px;
          transition: background 0.15s;
          cursor: pointer;
        }
        .notif-item:last-child { border-bottom: none; }
        .notif-item:hover { background: rgba(255,255,255,0.04); }
        .notif-item.unread { background: rgba(255,255,255,0.025); }
        .notif-item.unread:hover { background: rgba(255,255,255,0.055); }

        .unread-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--color-cyan, #22d3ee);
          box-shadow: 0 0 7px var(--color-cyan, #22d3ee);
          flex-shrink: 0;
        }
        .toggle-btn {
          width: 28px; height: 28px; border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.03);
          color: rgba(255,255,255,0.4);
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s; cursor: pointer; flex-shrink: 0;
        }
        .toggle-btn:hover { border-color: rgba(255,255,255,0.25); background: rgba(255,255,255,0.08); color: #fff; }
        .toggle-btn.is-read { border-color: rgba(255,255,255,0.05); color: rgba(255,255,255,0.18); }

        .pdf-badge {
          display: inline-flex; align-items: center; gap: 3px;
          font-family: 'Aboreto', sans-serif; font-size: 9px; letter-spacing: 0.1em;
          background: #ef4444; color: white; padding: 2px 7px; border-radius: 4px;
        }
        .mark-btn {
          font-family: 'Aboreto', sans-serif; font-size: 10px; letter-spacing: 0.1em;
          color: rgba(255,255,255,0.38); background: none;
          border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;
          padding: 4px 10px; cursor: pointer; transition: all 0.15s;
          display: flex; align-items: center; gap: 5px;
        }
        .mark-btn:hover { color: #fff; border-color: rgba(255,255,255,0.22); background: rgba(255,255,255,0.05); }

        .close-btn {
          background: none; border: none; cursor: pointer;
          color: rgba(255,255,255,0.28); display: flex; padding: 2px;
          transition: color 0.15s;
        }
        .close-btn:hover { color: rgba(255,255,255,0.7); }

        .notif-empty {
          font-family: 'Aboreto', sans-serif; font-size: 11px;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: rgba(255,255,255,0.18); text-align: center; padding: 36px 0;
        }
        .notif-scroll { max-height: 68vh; overflow-y: auto; padding: 4px 0 8px; }
        .notif-scroll::-webkit-scrollbar { width: 3px; }
        .notif-scroll::-webkit-scrollbar-track { background: transparent; }
        .notif-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }

        .confirm-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.72); backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center; z-index: 10000;
        }
        .confirm-box {
          background: #111; border: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px; padding: 32px; width: 360px;
          box-shadow: 0 40px 100px rgba(0,0,0,0.9);
        }
        .confirm-title {
          font-family: 'Aboreto', sans-serif; font-size: 15px;
          letter-spacing: 0.12em; text-transform: uppercase; color: #fff; margin-bottom: 10px;
        }
        .confirm-body {
          font-family: 'Darker Grotesque', sans-serif; font-size: 14px;
          color: rgba(255,255,255,0.42); margin-bottom: 28px; line-height: 1.6;
        }
        .confirm-row { display: flex; gap: 10px; justify-content: flex-end; }
        .btn-cancel {
          font-family: 'Aboreto', sans-serif; font-size: 11px; letter-spacing: 0.1em;
          text-transform: uppercase; padding: 10px 20px; border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.1); background: transparent;
          color: rgba(255,255,255,0.42); cursor: pointer; transition: all 0.15s;
        }
        .btn-cancel:hover { border-color: rgba(255,255,255,0.25); color: #fff; background: rgba(255,255,255,0.05); }
        .btn-confirm {
          font-family: 'Aboreto', sans-serif; font-size: 11px; letter-spacing: 0.1em;
          text-transform: uppercase; padding: 10px 20px; border-radius: 10px;
          border: none; background: #fff; color: #0a0a0a; cursor: pointer; transition: all 0.15s;
        }
        .btn-confirm:hover { background: rgba(255,255,255,0.85); }
      `}</style>

      {/* ── Popover ── */}
      <Popover open={open} onOpenChange={setOpen}>

        {/* Trigger */}
        <PopoverTrigger asChild>
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            aria-label="Notifications"
            className="relative w-9 h-9 lg:w-10 lg:h-10 rounded-full glass flex items-center justify-center hover:border-[var(--color-cyan)]/30 transition-colors"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-cyan)]" />
            )}
          </motion.button>
        </PopoverTrigger>

        {/* Panel */}
        <PopoverContent
          className="notif-panel"
          side="bottom"
          align="end"
          sideOffset={10}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div style={{ padding: "16px 18px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                className="notif-aboreto"
                style={{ fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", color: "#fff" }}
              >
                Notifications
              </span>
              {unreadCount > 0 && (
                <span style={{
                  fontFamily: "'Darker Grotesque', sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  background: "var(--color-cyan, #22d3ee)",
                  color: "#0a0a0a",
                  borderRadius: 20,
                  padding: "1px 7px",
                  lineHeight: 1.6,
                }}>
                  {unreadCount}
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {unreadCount > 0 && (
                <button
                  className="mark-btn"
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    setOpenConfirm(true);
                  }}
                >
                  <CheckCheck size={12} />
                  Mark all read
                </button>
              )}
              <button className="close-btn" onClick={() => setOpen(false)}>
                <X size={15} />
              </button>
            </div>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

          {/* List */}
          <div className="notif-scroll">
            {notifications.length === 0 ? (
              <div className="notif-empty">No notifications yet</div>
            ) : (
              notifications.map((n) => {
                const isUnread = !n.read_at;
                const isPdf = isPrescription(n.title);

                return (
                  <div key={n.notification_id} className={`notif-item ${isUnread ? "unread" : ""}`}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>

                      {/* Unread dot */}
                      <div style={{ paddingTop: 6 }}>
                        {isUnread
                          ? <div className="unread-dot" />
                          : <div style={{ width: 6, height: 6 }} />
                        }
                      </div>

                      {/* Body */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isPdf
                          ? <PdfNotifItem n={n} onToggleRead={toggleRead} />
                          : <RegularNotifItem n={n} />
                        }
                      </div>

                      {/* Toggle read button */}
                      <button
                        className={`toggle-btn ${!isUnread ? "is-read" : ""}`}
                        title={isUnread ? "Mark as read" : "Mark as unread"}
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          toggleRead(n);
                        }}
                      >
                        {isUnread ? <X size={12} /> : <Check size={12} />}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
          <div style={{ padding: "10px 18px", display: "flex", justifyContent: "flex-end" }}>
            <button className="mark-btn" onClick={refresh}>
              Refresh
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {/* ── Mark All Confirm Modal ── */}
      <AnimatePresence>
        {openConfirm && (
          <motion.div
            className="confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpenConfirm(false)}
          >
            <motion.div
              className="confirm-box"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
            >
              <div className="confirm-title">Mark all as read?</div>
              <div className="confirm-body">
                This will mark all {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""} as read.
                You can still unmark them individually afterwards.
              </div>
              <div className="confirm-row">
                <button className="btn-cancel" onClick={() => setOpenConfirm(false)}>
                  Cancel
                </button>
                <button
                  className="btn-confirm"
                  onClick={async () => {
                    await markAllAsRead();
                    setOpenConfirm(false);
                  }}
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}