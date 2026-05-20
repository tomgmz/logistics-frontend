"use client";

import { useState, useEffect, memo } from "react";
import { motion, Variants } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { ValueType } from "recharts/types/component/DefaultTooltipContent";
import { ReactNode } from "react";
import {
  Package, Truck, CreditCard, CheckCircle,
  TrendingUp, TrendingDown,
} from "lucide-react";

// ── Theme tokens ─────────────────────────────────────────────────────
const T = {
  bg:      "#0a0a0a",
  surface: "#1b1b1b",
  card:    "#1b1b1b",
  inner:   "#2a2a2a",
  border:  "#2a2a2a",
  border2: "#424242",
  teal:    "#4df9ed",
  tealDim: "rgba(77,249,237,0.08)",
  white:   "#ffffff",
  muted:   "#818181",
  red:     "#ef4444",
  amber:   "#f59e0b",
  green:   "#4df9ed",
  greenAlt:"#84cc16",
  purple:  "#818cf8",
} as const;

// ── Types ────────────────────────────────────────────────────────────
type StatusKey = "In Transit" | "Pending" | "Completed" | "Cancelled";

interface Booking {
  id: string; client: string;
  origin: string; dest: string;
  status: StatusKey; amount: string; time: string;
}

interface CounterProps {
  target: number; prefix?: string; suffix?: string; duration?: number;
}

interface KpiTileProps {
  label: string; value: number;
  prefix?: string; suffix?: string;
  delta: number; icon: ReactNode;
  accent: string; delay: number;
}

// ── Static data (module-level — never recreated) ─────────────────────
const revenueData = [
  { month: "Jan", revenue: 142000, bookings: 312 },
  { month: "Feb", revenue: 168000, bookings: 378 },
  { month: "Mar", revenue: 153000, bookings: 344 },
  { month: "Apr", revenue: 197000, bookings: 421 },
  { month: "May", revenue: 221000, bookings: 489 },
  { month: "Jun", revenue: 209000, bookings: 465 },
  { month: "Jul", revenue: 243000, bookings: 532 },
  { month: "Aug", revenue: 278000, bookings: 601 },
];

const serviceData = [
  { name: "Beverages",     value: 32, color: T.teal    },
  { name: "Personal Care", value: 28, color: T.purple   },
  { name: "Food & Snacks", value: 24, color: T.amber    },
  { name: "Household",     value: 16, color: T.greenAlt },
];

const weeklyData = [
  { day: "Mon", active: 48, completed: 32 },
  { day: "Tue", active: 61, completed: 44 },
  { day: "Wed", active: 55, completed: 38 },
  { day: "Thu", active: 72, completed: 51 },
  { day: "Fri", active: 89, completed: 67 },
  { day: "Sat", active: 43, completed: 29 },
  { day: "Sun", active: 27, completed: 18 },
];

const recentBookings: Booking[] = [
  { id: "BK-20481", client: "Airspeed Corp.",   origin: "Cabuyao, Laguna",  dest: "Quezon City", status: "In Transit", amount: "₱18,400", time: "2m ago"  },
  { id: "BK-20480", client: "STA Warehouses",   origin: "Alabang",          dest: "Makati CBD",  status: "Pending",    amount: "₱9,250",  time: "14m ago" },
  { id: "BK-20479", client: "NovaBev Trading",  origin: "Manila Port Area", dest: "Laguna TEZ",  status: "Completed",  amount: "₱42,100", time: "1h ago"  },
  { id: "BK-20478", client: "FreshMart PH",     origin: "Batangas City",    dest: "Pasig Hub",   status: "Completed",  amount: "₱7,800",  time: "2h ago"  },
  { id: "BK-20477", client: "Monde Nissin PH",  origin: "Marikina City",    dest: "Bulacan",     status: "In Transit", amount: "₱11,650", time: "3h ago"  },
  { id: "BK-20476", client: "Universal Robina", origin: "Pasay",            dest: "Cebu City",   status: "Cancelled",  amount: "₱34,200", time: "5h ago"  },
];

const statusColors: Record<StatusKey, string> = {
  "In Transit": T.teal,
  "Pending":    T.amber,
  "Completed":  T.greenAlt,
  "Cancelled":  T.red,
};

const billingRows = [
  { label: "Total Billed (MTD)",  value: "₱278,400", accent: T.teal,     pct: 82 },
  { label: "Collected",           value: "₱231,200", accent: T.greenAlt, pct: 68 },
  { label: "Outstanding",         value: "₱47,200",  accent: T.amber,    pct: 14 },
  { label: "Overdue (30+ days)",  value: "₱8,100",   accent: T.red,      pct: 3  },
];

// ── Motion variants ──────────────────────────────────────────────────
const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 20 },
  visible: (i: number = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.06, duration: 0.45, ease: "easeOut" as const },
  }),
};

const fadeIn: Variants = {
  hidden:  { opacity: 0 },
  visible: (i: number = 0) => ({
    opacity: 1,
    transition: { delay: i * 0.06, duration: 0.4 },
  }),
};

const scaleIn: Variants = {
  hidden:  { scale: 0.94, opacity: 0 },
  visible: (i: number = 0) => ({
    scale: 1, opacity: 1,
    transition: { delay: i * 0.07, duration: 0.45, ease: "backOut" as const },
  }),
};

// ── Chart isolation wrapper — prevents Recharts ResizeObserver thrash ─
// contain:strict boxes the subtree so reflows don't escape upward
const chartShell: React.CSSProperties = {
  willChange: "transform",
  contain: "layout style",
  transform: "translateZ(0)",
};

// ── Animated counter ─────────────────────────────────────────────────
const Counter = memo(function Counter({ target, prefix = "", suffix = "", duration = 1600 }: CounterProps) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setVal(Math.floor(ease * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    const id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [target, duration]);
  return <>{prefix}{val.toLocaleString()}{suffix}</>;
});

// ── KPI Tile ─────────────────────────────────────────────────────────
const KpiTile = memo(function KpiTile({ label, value, prefix = "", suffix = "", delta, icon, accent, delay }: KpiTileProps) {
  const isPos = delta >= 0;
  return (
    <motion.div
      variants={scaleIn} custom={delay}
      initial="hidden" animate="visible"
      whileHover={{
        borderColor: accent,
        boxShadow: `0 0 24px ${accent}1a`,
        transition: { duration: 0.2 },
      }}
      style={{
        background: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: 16,
        padding: "20px 20px",
        position: "relative",
        overflow: "hidden",
        cursor: "default",
      }}
    >
      <div style={{
        position: "absolute", top: -36, right: -36,
        width: 100, height: 100, borderRadius: "50%",
        background: `radial-gradient(circle, ${accent}18 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 10, color: T.muted, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>
          {label}
        </span>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: `${accent}15`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: accent, flexShrink: 0,
        }}>
          {icon}
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: T.white, letterSpacing: -0.5, lineHeight: 1 }}>
        <Counter target={value} prefix={prefix} suffix={suffix} />
      </div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: isPos ? T.greenAlt : T.red,
          background: isPos ? `${T.greenAlt}15` : `${T.red}15`,
          padding: "2px 7px", borderRadius: 20,
          display: "flex", alignItems: "center", gap: 3,
        }}>
          {isPos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {Math.abs(delta)}%
        </span>
        <span style={{ fontSize: 11, color: T.muted }}>vs last month</span>
      </div>
    </motion.div>
  );
});

// ── Tooltip ──────────────────────────────────────────────────────────
const CustomTooltip = memo(function CustomTooltip({ active, payload, label }: {
  active?: boolean; label?: string;
  payload?: Array<{ name?: string; value?: ValueType; color?: string }>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: T.inner, border: `1px solid ${T.border}`,
      borderRadius: 10, padding: "9px 13px", fontSize: 12,
    }}>
      <p style={{ color: T.muted, fontSize: 11, marginBottom: 4 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color as string, margin: "2px 0" }}>
          {p.name}: <strong>
            {typeof p.value === "number" && p.value > 1000
              ? `₱${p.value.toLocaleString()}` : p.value}
          </strong>
        </p>
      ))}
    </div>
  );
});

// ── Card wrapper ─────────────────────────────────────────────────────
const Card = memo(function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, ...style }}>
      {children}
    </div>
  );
});

// ── Isolated chart sections (memoised so sidebar toggle can't re-render them) ─

const RevenueChart = memo(function RevenueChart() {
  return (
    <motion.div variants={fadeUp} custom={4} initial="hidden" animate="visible" style={{ height: "100%" }}>
      <Card style={{ padding: "20px 18px", height: "100%", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.white }}>Revenue Overview</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Monthly performance trend</div>
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 11, color: T.muted }}>
            {[{ label: "Revenue", color: T.teal }, { label: "Bookings", color: T.purple }].map(l => (
              <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: l.color, display: "inline-block" }} />
                {l.label}
              </span>
            ))}
          </div>
        </div>
        {/* chartShell isolates the ResizeObserver subtree */}
        <div style={chartShell}>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={T.teal}   stopOpacity={0.25} />
                  <stop offset="95%" stopColor={T.teal}   stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradBook" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={T.purple} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={T.purple} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
              <XAxis dataKey="month" tick={{ fill: T.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: T.muted, fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `₱${v / 1000}k` : String(v)} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue"  stroke={T.teal}   strokeWidth={2} fill="url(#gradRev)"  name="Revenue"  dot={false} />
              <Area type="monotone" dataKey="bookings" stroke={T.purple} strokeWidth={2} fill="url(#gradBook)" name="Bookings" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </motion.div>
  );
});

const DonutChart = memo(function DonutChart() {
  return (
    <motion.div variants={fadeUp} custom={5} initial="hidden" animate="visible" style={{ height: "100%" }}>
      <Card style={{ padding: "20px 18px", height: "100%", boxSizing: "border-box" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.white, marginBottom: 2 }}>FMCG Mix</div>
        <div style={{ fontSize: 11, color: T.muted, marginBottom: 12 }}>By sub-category</div>
        <div style={chartShell}>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={serviceData} cx="50%" cy="50%" innerRadius={42} outerRadius={68}
                paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                {serviceData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip
                formatter={(val: ValueType | undefined) => val != null ? `${val}%` : ""}
                contentStyle={{ background: T.inner, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 8 }}>
          {serviceData.map(s => (
            <div key={s.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 7, height: 7, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: T.muted }}>{s.name}</span>
              </div>
              <span style={{ fontSize: 12, color: T.white, fontWeight: 600 }}>{s.value}%</span>
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
});

const WeeklyChart = memo(function WeeklyChart() {
  return (
    <motion.div variants={fadeUp} custom={6} initial="hidden" animate="visible" style={{ height: "100%" }}>
      <Card style={{ padding: "20px 18px", height: "100%", boxSizing: "border-box" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.white, marginBottom: 2 }}>Weekly Bookings</div>
        <div style={{ fontSize: 11, color: T.muted, marginBottom: 16 }}>Active vs completed</div>
        <div style={chartShell}>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={weeklyData} barSize={9} barGap={3}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="day" tick={{ fill: T.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: T.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="active"    fill={T.teal}   radius={[4,4,0,0]} name="Active"    />
              <Bar dataKey="completed" fill={T.purple} radius={[4,4,0,0]} name="Completed" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </motion.div>
  );
});

const BillingCard = memo(function BillingCard() {
  return (
    <motion.div variants={fadeUp} custom={7} initial="hidden" animate="visible" style={{ height: "100%" }}>
      <Card style={{ padding: "20px 18px", height: "100%", boxSizing: "border-box" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.white, marginBottom: 2 }}>Billing Summary</div>
        <div style={{ fontSize: 11, color: T.muted, marginBottom: 16 }}>Financial snapshot</div>
        {billingRows.map((row, i) => (
          <motion.div key={row.label} variants={fadeIn} custom={i} initial="hidden" animate="visible" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: T.muted }}>{row.label}</span>
              <span style={{ fontSize: 12, color: T.white, fontWeight: 600 }}>{row.value}</span>
            </div>
            <div style={{ height: 4, background: T.inner, borderRadius: 10, overflow: "hidden" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${row.pct}%` }}
                transition={{ delay: 0.5 + i * 0.1, duration: 0.7, ease: "easeOut" }}
                style={{ height: "100%", background: row.accent, borderRadius: 10 }}
              />
            </div>
          </motion.div>
        ))}
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[{ label: "Avg. Invoice", value: "₱5,860" }, { label: "Paid on Time", value: "91%" }].map(s => (
            <div key={s.label} style={{
              background: T.inner, borderRadius: 10, padding: "10px 12px",
              border: `1px solid ${T.border}`,
            }}>
              <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.teal, marginTop: 3 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
});

const BookingsTable = memo(function BookingsTable() {
  return (
    <motion.div variants={fadeUp} custom={8} initial="hidden" animate="visible">
      <Card style={{ overflow: "hidden" }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 20px", borderBottom: `1px solid ${T.border}`,
          flexWrap: "wrap", gap: 8,
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.white }}>Recent Bookings</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Latest FMCG transit activity</div>
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            style={{
              background: T.tealDim, border: `1px solid ${T.teal}40`,
              borderRadius: 8, padding: "6px 14px", color: T.teal,
              fontSize: 11, cursor: "pointer", fontWeight: 600, letterSpacing: 0.3,
            }}
          >View All</motion.button>
        </div>
        <div className="dash-table-wrap">
          <div className="dash-table-grid" style={{
            padding: "9px 20px", fontSize: 10, color: T.muted,
            letterSpacing: 1.5, fontWeight: 600,
            textTransform: "uppercase", borderBottom: `1px solid ${T.border}`,
            background: T.inner,
          }}>
            {["Booking ID", "Client", "Origin", "Destination", "Amount", "Status"].map(h => (
              <span key={h}>{h}</span>
            ))}
          </div>
          {recentBookings.map((b, i) => (
            <motion.div
              key={b.id}
              variants={fadeIn} custom={i} initial="hidden" animate="visible"
              whileHover={{ background: T.inner }}
              className="dash-table-grid"
              style={{
                padding: "12px 20px",
                borderBottom: i < recentBookings.length - 1 ? `1px solid ${T.border}50` : "none",
                alignItems: "center", cursor: "pointer", transition: "background 0.12s",
              }}
            >
              <span style={{ fontSize: 12, color: T.teal, fontWeight: 600 }}>{b.id}</span>
              <div>
                <div style={{ fontSize: 12, color: T.white, fontWeight: 500 }}>{b.client}</div>
                <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>{b.time}</div>
              </div>
              <span style={{ fontSize: 11, color: T.muted }}>{b.origin}</span>
              <span style={{ fontSize: 11, color: T.muted }}>{b.dest}</span>
              <span style={{ fontSize: 12, color: T.white, fontWeight: 600 }}>{b.amount}</span>
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: statusColors[b.status],
                background: `${statusColors[b.status]}15`,
                border: `1px solid ${statusColors[b.status]}30`,
                padding: "3px 9px", borderRadius: 20, width: "fit-content",
                letterSpacing: 0.3, whiteSpace: "nowrap",
              }}>
                {b.status}
              </span>
            </motion.div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
});

// ── Main — memoised so parent re-renders (sidebar state) don't propagate ──
const AdminDashboard = memo(function AdminDashboard() {
  return (
    <div style={{
      background: T.bg,
      minHeight: "100%",
      padding: "20px 16px",
      overflowY: "auto",
      scrollbarWidth: "none",
      boxSizing: "border-box",
    }}>
      <style>{`
        .dash-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        .dash-row1 {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 12px;
          align-items: stretch;
        }
        .dash-row1 > * { height: 100%; }
        .dash-row2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          align-items: stretch;
        }
        .dash-row2 > * { height: 100%; }
        .dash-table-grid {
          display: grid;
          grid-template-columns: 110px 1fr 1fr 1fr 90px 100px;
        }
        @media (max-width: 1024px) {
          .dash-kpi-grid { grid-template-columns: repeat(2, 1fr); }
          .dash-row1 { grid-template-columns: 1fr; }
          .dash-row2 { grid-template-columns: 1fr; }
        }
        @media (max-width: 640px) {
          .dash-kpi-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .dash-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .dash-table-grid {
            grid-template-columns: 90px 130px 110px 110px 80px 90px;
            min-width: 620px;
          }
        }
      `}</style>

      {/* KPI tiles */}
      <div className="dash-kpi-grid" style={{ marginBottom: 16 }}>
        <KpiTile label="New Bookings Today"  value={47}     icon={<Package size={15} />}      accent={T.teal}     delta={12.4} delay={0} />
        <KpiTile label="Active Bookings"     value={134}    icon={<Truck size={15} />}         accent={T.purple}   delta={8.1}  delay={1} />
        <KpiTile label="Monthly Revenue"     value={278000} prefix="₱" icon={<CreditCard size={15} />} accent={T.amber} delta={15.7} delay={2} />
        <KpiTile label="On-Time Delivery"    value={94}     suffix="%" icon={<CheckCircle size={15} />} accent={T.greenAlt} delta={2.3} delay={3} />
      </div>

      {/* Row 1 */}
      <div className="dash-row1" style={{ marginBottom: 16 }}>
        <RevenueChart />
        <DonutChart />
      </div>

      {/* Row 2 */}
      <div className="dash-row2" style={{ marginBottom: 16 }}>
        <WeeklyChart />
        <BillingCard />
      </div>

      {/* Table */}
      <BookingsTable />

      <div style={{ height: 24 }} />
    </div>
  );
});

export default AdminDashboard;