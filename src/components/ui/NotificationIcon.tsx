"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, X, Check, CheckCheck, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ReusableModal from "../layout/ReusableModal";
import { now } from "@/app/utils/serverTime";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { expandCode, roleLabel } from "@/lib/roles";
import { useNotificationStore } from "@/lib/store/notification.store";
import { useNotificationsRealtime } from "@/hooks/useNotificationsRealtime";
import type { AppNotification } from "@/lib/services/notification.service";

const timeAgo = (iso: string): string => {
  const diff = now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// Notifications that ask the recipient to do something. Everything else
// (rejections, "vehicle assigned", reset completed, legacy accounting/fleet
// types) is informational and gets no action button.
const ACTIONABLE_TYPES = new Set([
  "booking.gm_pending",
  "booking.ops_pending",
  "booking.assigned",
  "booking.fleet_recheck",
  "driver.emergency",
  "driver.report",
  "auth.password_reset_requested",
]);

const actionUrlOf = (n: AppNotification): string | null =>
  ACTIONABLE_TYPES.has(n.type) && typeof n.data?.action_url === "string"
    ? n.data.action_url
    : null;

const humanize = (s: string): string =>
  s.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// Labels for the payload keys the backend sends; anything else scalar is shown
// with a humanized key. Routing/ids are left out — the Open button covers them.
const FIELD_LABELS: Record<string, string> = {
  reference_number:  "Reference",
  stage:             "Stage",
  incident_type:     "Incident",
  source:            "Source",
  trip_can_continue: "Trip can continue",
  requested_role:    "Requested role",
  window:            "Window",
};
// Readable values for coded payload fields, so nothing shows abbreviated
// (e.g. "ops_pending"). Unknown codes fall back to expandCode() + humanize.
const VALUE_LABELS: Record<string, Record<string, string>> = {
  stage: {
    gm_pending:       "Awaiting General Manager approval",
    rejected_gm:      "Rejected by the General Manager",
    rejected_admin:   "Rejected by the Company Administrator",
    ops_pending:      "Awaiting vehicle and driver assignment",
    assigned:         "Assigned to driver",
    vehicle_assigned: "Vehicle assigned",
    fleet_recheck:    "Vehicle re-check due",
  },
  window: {
    day_before: "Day before dispatch",
    day_of:     "Day of dispatch",
  },
};
const HIDDEN_FIELDS = new Set(["action_url", "type", "handler_group", "latitude", "longitude"]);

function detailFields(n: AppNotification): { label: string; value: string }[] {
  const data = n.data ?? {};
  const fields: { label: string; value: string }[] = [];

  for (const [key, raw] of Object.entries(data)) {
    if (HIDDEN_FIELDS.has(key) || key.endsWith("_id")) continue;
    if (raw === null || raw === undefined || raw === "" || typeof raw === "object") continue;
    const value =
      typeof raw === "boolean" ? (raw ? "Yes" : "No")
      : key === "reference_number" ? String(raw)
      : key === "requested_role" ? roleLabel(String(raw))
      : VALUE_LABELS[key]?.[String(raw)] ?? humanize(expandCode(String(raw)));
    fields.push({ label: FIELD_LABELS[key] ?? humanize(key), value });
  }

  if (typeof data.latitude === "number" && typeof data.longitude === "number") {
    fields.push({ label: "Location", value: `${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}` });
  }
  return fields;
}

function NotifBody({ n }: { n: AppNotification }) {
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
        className="text-[13px] text-white/40 leading-relaxed m-0 mb-1 line-clamp-2"
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

// Full details of one notification in its own pop-up over the page (a bottom
// sheet on mobile). The bell panel stays open underneath, so closing this goes
// back to the list.
function NotifDetailModal({
  n,
  isMobile,
  onClose,
  onTakeAction,
}: {
  n: AppNotification | null;
  isMobile: boolean;
  onClose: () => void;
  onTakeAction: (url: string) => void;
}) {
  useEffect(() => {
    if (!n) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, onClose]);

  if (typeof document === "undefined") return null;

  const url = n ? actionUrlOf(n) : null;
  const fields = n ? detailFields(n) : [];

  return createPortal(
    <AnimatePresence>
      {n && (
        <motion.div
          key="notif-detail-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="notif-detail-title"
          className="fixed inset-0 z-[65] flex items-end justify-center sm:items-start sm:px-4 sm:pt-16 sm:pb-4 bg-black/60"
        >
          <motion.div
            initial={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.97, y: -12 }}
            animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.97, y: -8 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="flex flex-col w-full sm:max-w-[640px] max-h-[90vh] sm:max-h-[calc(100vh-5rem)] rounded-t-[18px] sm:rounded-2xl border border-white/[0.08] bg-[#0d0d0d] shadow-[0_32px_80px_rgba(0,0,0,0.9)] pb-[env(safe-area-inset-bottom)]"
          >
            <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-4 pb-3 shrink-0">
              <h2
                id="notif-detail-title"
                className="m-0 text-base font-bold text-white truncate"
                style={{ fontFamily: "'Darker Grotesque', sans-serif" }}
              >
                Notification
              </h2>
              <button
                aria-label="Close"
                onClick={onClose}
                className="flex p-0.5 bg-transparent border-none cursor-pointer text-white/40 transition-colors hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto px-5 sm:px-6 pb-6 flex flex-col gap-5">
              <div
                className="rounded-xl bg-white/[0.04] px-4 py-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm"
                style={{ fontFamily: "'Darker Grotesque', sans-serif" }}
              >
                <span className="font-bold text-white/60">Received:</span>
                <span className="text-white/85">
                  {new Date(n.created_at).toLocaleString()} ({timeAgo(n.created_at)})
                </span>
                <span className="font-bold text-white/60">Subject:</span>
                <span className="text-white/85 break-words">{n.title}</span>
              </div>

              <div className="h-px bg-white/[0.06]" />

              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center bg-[var(--color-cyan,#22d3ee)]/10 text-[var(--color-cyan,#22d3ee)]">
                  <Bell size={24} />
                </div>
                <p
                  className="m-0 text-[17px] font-semibold text-white leading-relaxed whitespace-pre-line break-words"
                  style={{ fontFamily: "'Darker Grotesque', sans-serif" }}
                >
                  {n.body}
                </p>
              </div>

              {fields.length > 0 && (
                <dl className="m-0 rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.05]">
                  {fields.map((f) => (
                    <div key={f.label} className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                      <dt
                        className="text-[10px] tracking-widest uppercase text-white/30 shrink-0"
                        style={{ fontFamily: "'Aboreto', sans-serif" }}
                      >
                        {f.label}
                      </dt>
                      <dd
                        className="m-0 text-sm text-white/80 text-right break-words min-w-0"
                        style={{ fontFamily: "'Darker Grotesque', sans-serif" }}
                      >
                        {f.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {url && (
                <button
                  onClick={() => onTakeAction(url)}
                  className="self-center flex items-center justify-center gap-2 w-full sm:w-auto sm:px-8 rounded-xl py-2.5 text-[11px] tracking-widest uppercase font-bold cursor-pointer transition-opacity hover:opacity-85 bg-[var(--color-cyan,#22d3ee)] text-[#0a0a0a] border-none"
                  style={{ fontFamily: "'Aboreto', sans-serif" }}
                >
                  Take action
                  <ChevronRight size={14} />
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default function NotificationIcon() {
  const router = useRouter();
  const isMobile = useIsMobile();
  useNotificationsRealtime();

  const notifications = useNotificationStore((s) => s.items);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const hydrate = useNotificationStore((s) => s.hydrate);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);

  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [, setTick] = useState(0);

  // Look the selection up in the store so realtime updates (read state) show.
  const selected = selectedId
    ? notifications.find((n) => n.notification_id === selectedId) ?? null
    : null;

  // Re-render every minute so relative timestamps stay fresh.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Always reopen on the list, not on the last notification viewed.
  const changeOpen = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setSelectedId(null);
  }, []);

  // Full-screen sheet on mobile: lock page scroll and close on Escape (unless
  // the details pop-up is up, which Escape closes first).
  useEffect(() => {
    if (!isMobile || !open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !selectedId) changeOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [isMobile, open, selectedId, changeOpen]);

  const onItemClick = useCallback(
    (n: AppNotification) => {
      if (!n.read_at) markRead(n.notification_id);
      setSelectedId(n.notification_id);
    },
    [markRead],
  );

  const closeDetail = useCallback(() => setSelectedId(null), []);

  const takeAction = useCallback(
    (url: string) => {
      changeOpen(false);
      router.push(url);
    },
    [changeOpen, router],
  );

  const bellButton = (
    <motion.button
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.94 }}
      aria-label="Notifications"
      onClick={isMobile ? () => changeOpen(!open) : undefined}
      className="relative w-9 h-9 lg:w-10 lg:h-10 rounded-full glass flex items-center justify-center hover:border-[var(--color-cyan)]/30 transition-colors"
    >
      <Bell size={16} />
      {unreadCount > 0 && (
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-cyan)]" />
      )}
    </motion.button>
  );

  const header = (
    <div className="flex items-center justify-between px-[18px] pt-4 pb-3.5 shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
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
          aria-label="Close notifications"
          className="flex p-0.5 bg-transparent border-none cursor-pointer text-white/30 transition-colors hover:text-white/70"
          onClick={() => changeOpen(false)}
        >
          <X size={isMobile ? 20 : 15} />
        </button>
      </div>
    </div>
  );

  const list =
    notifications.length === 0 ? (
      <div
        className="text-[11px] tracking-[0.08em] uppercase text-white/20 text-center py-9"
        style={{ fontFamily: "'Aboreto', sans-serif" }}
      >
        No notifications yet
      </div>
    ) : (
      notifications.map((n) => {
        const isUnread = !n.read_at;

        return (
          <div
            key={n.notification_id}
            onClick={() => onItemClick(n)}
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
                <NotifBody n={n} />
              </div>

              {isUnread && (
                <button
                  title="Mark as read"
                  onClick={(e) => { e.stopPropagation(); markRead(n.notification_id); }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-all border bg-white/[0.03] border-white/10 text-white/40 hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
                >
                  <Check size={12} />
                </button>
              )}
            </div>
          </div>
        );
      })
    );

  const scrollClass =
    "overflow-y-auto py-1 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/[0.08] [&::-webkit-scrollbar-thumb]:rounded-sm";

  const panelBody = (
    <>
      {header}
      <div className="h-px bg-white/[0.06] shrink-0" />

      <div className={`${scrollClass} ${isMobile ? "flex-1 min-h-0" : "max-h-[68vh]"}`}>
        {list}
      </div>

      <div className="h-px bg-white/[0.06] shrink-0" />
      <div className="flex justify-end px-[18px] py-2.5 shrink-0">
        <button
          className="flex items-center gap-1 text-[10px] tracking-widest text-white/40 bg-transparent border border-white/[0.08] rounded-lg px-2.5 py-1 cursor-pointer transition-all hover:text-white hover:border-white/20 hover:bg-white/5"
          style={{ fontFamily: "'Aboreto', sans-serif" }}
          onClick={() => hydrate()}
        >
          Refresh
        </button>
      </div>
    </>
  );

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Aboreto&family=Darker+Grotesque:wght@400;500;600;700&display=swap');`}</style>

      {isMobile ? (
        <>
          {bellButton}
          {typeof document !== "undefined" &&
            createPortal(
              <AnimatePresence>
                {open && (
                  <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Notifications"
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 24 }}
                    transition={{ duration: 0.18 }}
                    className="fixed inset-0 z-[60] flex flex-col bg-[#0d0d0d] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
                  >
                    {panelBody}
                  </motion.div>
                )}
              </AnimatePresence>,
              document.body,
            )}
        </>
      ) : (
        <Popover open={open} onOpenChange={changeOpen}>
          <PopoverTrigger asChild>{bellButton}</PopoverTrigger>

          <PopoverContent
            side="bottom"
            align="end"
            sideOffset={10}
            onOpenAutoFocus={(e) => e.preventDefault()}
            // Clicks and Escape in the details pop-up must not close the list.
            onInteractOutside={(e) => { if (selectedId) e.preventDefault(); }}
            onEscapeKeyDown={(e) => { if (selectedId) e.preventDefault(); }}
            className="p-0 overflow-hidden w-[min(420px,95vw)] rounded-2xl border border-white/[0.08] bg-[#0d0d0d] shadow-[0_32px_80px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.03)]"
          >
            {panelBody}
          </PopoverContent>
        </Popover>
      )}

      <NotifDetailModal
        n={selected}
        isMobile={isMobile}
        onClose={closeDetail}
        onTakeAction={takeAction}
      />

      <ReusableModal
        open={openConfirm}
        title="Mark all as read?"
        description={`This will mark all ${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""} as read.`}
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        onConfirm={async () => {
          await markAllRead();
          setOpenConfirm(false);
        }}
        onCancel={() => setOpenConfirm(false)}
      />
    </>
  );
}
