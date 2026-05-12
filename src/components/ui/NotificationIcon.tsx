"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Bell, X, Check, Download, CheckCheck, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ReusableModal from "../layout/ReusableModal";
import { now, nowDate } from "@/app/utils/serverTime";

interface Notification {
  notification_id: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  attachment_url?: string;
}

const SAMPLE_NOTIFICATIONS: Notification[] = [
  {
    notification_id: "1",
    title: "Booking Confirmed",
    body: "Your booking #BK-00421 from Makati to BGC has been confirmed and assigned to Driver Reyes.",
    created_at: new Date(now() - 1000 * 60 * 5).toISOString(),
    read_at: null,
  },
  {
    notification_id: "2",
    title: "Driver En Route",
    body: "Driver Santos is 10 minutes away from your pickup point at Ayala Ave, Makati.",
    created_at: new Date(now() - 1000 * 60 * 32).toISOString(),
    read_at: null,
  },
  {
    notification_id: "3",
    title: "Delivery Completed",
    body: "Booking #BK-00410 has been successfully delivered. Please rate your experience.",
    created_at: new Date(now() - 1000 * 60 * 60 * 24).toISOString(),
    read_at: new Date(now() - 1000 * 60 * 60 * 20).toISOString(),
  },
  {
    notification_id: "4",
    title: "Payment Received",
    body: "Payment of ₱1,250.00 for booking #BK-00410 has been successfully processed.",
    created_at: new Date(now() - 1000 * 60 * 60 * 25).toISOString(),
    read_at: new Date(now() - 1000 * 60 * 60 * 22).toISOString(),
  },
];

const isPrescription = (title: string) =>
  title.toLowerCase().includes("prescription");

const timeAgo = (iso: string): string => {
  const diff = now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

interface NotifItemProps {
  n: Notification;
  onToggleRead: (n: Notification) => void;
}

function PdfNotifItem({ n, onToggleRead }: NotifItemProps) {
  const isUnread = !n.read_at;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
    if (!n.attachment_url) { e.preventDefault(); return; }
    if (!n.read_at) onToggleRead(n);
  };

  return (
    <a
      href={n.attachment_url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="block no-underline"
      onClick={handleClick}
    >
      <div className="flex items-center flex-wrap gap-1.5 mb-0.5">
        <span
          className={`font-bold text-sm tracking-wide ${isUnread ? "text-white" : "text-white/50"}`}
          style={{ fontFamily: "'Darker Grotesque', sans-serif" }}
        >
          {n.title}
        </span>
        <span
          className="inline-flex items-center gap-0.5 bg-red-500 text-white text-[9px] tracking-widest px-1.5 py-0.5 rounded"
          style={{ fontFamily: "'Aboreto', sans-serif" }}
        >
          <Download size={8} />
          PDF
        </span>
      </div>
      <p
        className="text-[13px] text-white/40 leading-relaxed m-0 mb-1"
        style={{ fontFamily: "'Darker Grotesque', sans-serif" }}
      >
        {n.body}
      </p>
      <span
        className="text-[10px] tracking-widest text-white/20"
        style={{ fontFamily: "'Aboreto', sans-serif" }}
      >
        {timeAgo(n.created_at)}
      </span>
    </a>
  );
}

function RegularNotifItem({ n }: Pick<NotifItemProps, "n">) {
  const isUnread = !n.read_at;
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span
          className={`font-bold text-sm ${isUnread ? "text-white" : "text-white/50"}`}
          style={{ fontFamily: "'Darker Grotesque', sans-serif" }}
        >
          {n.title}
        </span>
        <ChevronRight size={13} className="text-white/20 shrink-0 ml-1.5" />
      </div>
      <p
        className="text-[13px] text-white/40 leading-relaxed m-0 mb-1"
        style={{ fontFamily: "'Darker Grotesque', sans-serif" }}
      >
        {n.body}
      </p>
      <span
        className="text-[10px] tracking-widest text-white/20"
        style={{ fontFamily: "'Aboreto', sans-serif" }}
      >
        {timeAgo(n.created_at)}
      </span>
    </div>
  );
}

export default function NotificationIcon() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [, setTick] = useState(0);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!cancelled) setNotifications(SAMPLE_NOTIFICATIONS);
    };
    load();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const toggleRead = useCallback((n: Notification) => {
    const updatedReadAt = n.read_at ? null : nowDate().toISOString();
    setNotifications((prev) =>
      prev.map((item) =>
        item.notification_id === n.notification_id
          ? { ...item, read_at: updatedReadAt }
          : item
      )
    );
  }, []);

  const markAllAsRead = useCallback(async () => {
    const nowIso = nowDate().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: nowIso })));
  }, []);

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Aboreto&family=Darker+Grotesque:wght@400;500;600;700&display=swap');`}</style>

      <Popover open={open} onOpenChange={setOpen}>
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

        <PopoverContent
          side="bottom"
          align="end"
          sideOffset={10}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="p-0 overflow-hidden w-[min(420px,95vw)] rounded-2xl border border-white/[0.08] bg-[#0d0d0d] shadow-[0_32px_80px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.03)]"
        >
          <div className="flex items-center justify-between px-[18px] pt-4 pb-3.5">
            <div className="flex items-center gap-2.5">
              <span
                className="text-[13px] tracking-[0.12em] uppercase text-white"
                style={{ fontFamily: "'Aboreto', sans-serif" }}
              >
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  className="text-[11px] font-bold bg-[var(--color-cyan,#22d3ee)] text-[#0a0a0a] rounded-full px-1.5 leading-relaxed"
                  style={{ fontFamily: "'Darker Grotesque', sans-serif" }}
                >
                  {unreadCount}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  className="flex items-center gap-1 text-[10px] tracking-widest text-white/40 bg-transparent border border-white/[0.08] rounded-lg px-2.5 py-1 cursor-pointer transition-all hover:text-white hover:border-white/20 hover:bg-white/5"
                  style={{ fontFamily: "'Aboreto', sans-serif" }}
                  onClick={(e) => { e.stopPropagation(); setOpenConfirm(true); }}
                >
                  <CheckCheck size={12} />
                  Mark all read
                </button>
              )}
              <button
                className="flex p-0.5 bg-transparent border-none cursor-pointer text-white/30 transition-colors hover:text-white/70"
                onClick={() => setOpen(false)}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="h-px bg-white/[0.06]" />

          <div className="max-h-[68vh] overflow-y-auto py-1 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/[0.08] [&::-webkit-scrollbar-thumb]:rounded-sm">
            {notifications.length === 0 ? (
              <div
                className="text-[11px] tracking-[0.08em] uppercase text-white/20 text-center py-9"
                style={{ fontFamily: "'Aboreto', sans-serif" }}
              >
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => {
                const isUnread = !n.read_at;
                const isPdf = isPrescription(n.title);

                return (
                  <div
                    key={n.notification_id}
                    className={`border-b border-white/[0.05] last:border-b-0 px-[18px] py-3 cursor-pointer transition-colors
                      ${isUnread
                        ? "bg-white/[0.025] hover:bg-white/[0.055]"
                        : "hover:bg-white/[0.04]"
                      }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="pt-1.5">
                        {isUnread
                          ? <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-cyan,#22d3ee)] shadow-[0_0_7px_var(--color-cyan,#22d3ee)] shrink-0" />
                          : <div className="w-1.5 h-1.5" />
                        }
                      </div>

                      <div className="flex-1 min-w-0">
                        {isPdf
                          ? <PdfNotifItem n={n} onToggleRead={toggleRead} />
                          : <RegularNotifItem n={n} />
                        }
                      </div>

                      <button
                        title={isUnread ? "Mark as read" : "Mark as unread"}
                        onClick={(e) => { e.stopPropagation(); toggleRead(n); }}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-all border bg-white/[0.03]
                          ${isUnread
                            ? "border-white/10 text-white/40 hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
                            : "border-white/[0.05] text-white/20"
                          }`}
                      >
                        {isUnread ? <X size={12} /> : <Check size={12} />}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="h-px bg-white/[0.06]" />
          <div className="flex justify-end px-[18px] py-2.5">
            <button
              className="flex items-center gap-1 text-[10px] tracking-widest text-white/40 bg-transparent border border-white/[0.08] rounded-lg px-2.5 py-1 cursor-pointer transition-all hover:text-white hover:border-white/20 hover:bg-white/5"
              style={{ fontFamily: "'Aboreto', sans-serif" }}
              onClick={refresh}
            >
              Refresh
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <ReusableModal
        open={openConfirm}
        title="Mark all as read?"
        description={`This will mark all ${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""} as read. You can still unmark them individually afterwards.`}
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        onConfirm={async () => {
          await markAllAsRead();
          setOpenConfirm(false);
        }}
        onCancel={() => setOpenConfirm(false)}
      />
    </>
  );
}