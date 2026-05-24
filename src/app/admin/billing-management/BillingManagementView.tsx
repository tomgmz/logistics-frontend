"use client";

import { useState, useMemo } from "react";
import {
  CheckCircle, Clock, AlertTriangle, Wallet,
  FileText, ArrowDownToLine, RefreshCw, Plus, Search,
  Download, FileDown, Receipt, CreditCard,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type InvoiceStatus = "Paid" | "Pending" | "Overdue" | "Under Review";
type ExpenseStatus = "Paid" | "Pending" | "Review";
type Tab = "billing" | "expenses";

interface Invoice {
  id: string;
  bookingRef: string;
  client: string;
  totalAmount: number;
  trips: number;
  costPerTrip: number;
  issueDate: string;
  dueDate: string;
  paidDate: string | null;
  status: InvoiceStatus;
  fileName: string;
}

interface Expense {
  id: string;
  category: string;
  date: string;
  payee: string;
  amount: number;
  paymentMethod: string;
  status: ExpenseStatus;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const invoices: Invoice[] = [
  { id: "RB-10081", bookingRef: "BK-20481", client: "Airspeed Corp.",     totalAmount: 18400, trips: 2, costPerTrip: 9200,  issueDate: "Aug 04, 2026", dueDate: "Aug 18, 2026", paidDate: "Aug 08, 2026", status: "Paid",         fileName: "reverse-billing-rb-10081.pdf" },
  { id: "RB-10082", bookingRef: "BK-20482", client: "Universal Robina",   totalAmount: 34200, trips: 4, costPerTrip: 8550,  issueDate: "Aug 05, 2026", dueDate: "Aug 19, 2026", paidDate: null,           status: "Pending",      fileName: "reverse-billing-rb-10082.pdf" },
  { id: "RB-10083", bookingRef: "BK-20483", client: "FreshMart PH",       totalAmount: 12600, trips: 3, costPerTrip: 4200,  issueDate: "Aug 06, 2026", dueDate: "Aug 10, 2026", paidDate: null,           status: "Overdue",      fileName: "reverse-billing-rb-10083.pdf" },
  { id: "RB-10084", bookingRef: "BK-20484", client: "NovaBev Trading",    totalAmount: 27000, trips: 3, costPerTrip: 9000,  issueDate: "Aug 07, 2026", dueDate: "Aug 21, 2026", paidDate: null,           status: "Under Review", fileName: "reverse-billing-rb-10084.pdf" },
  { id: "RB-10085", bookingRef: "BK-20485", client: "Monde Nissin PH",    totalAmount: 9800,  trips: 2, costPerTrip: 4900,  issueDate: "Aug 08, 2026", dueDate: "Aug 22, 2026", paidDate: "Aug 12, 2026", status: "Paid",         fileName: "reverse-billing-rb-10085.pdf" },
  { id: "RB-10086", bookingRef: "BK-20486", client: "STA Warehouses",     totalAmount: 15500, trips: 5, costPerTrip: 3100,  issueDate: "Aug 09, 2026", dueDate: "Aug 23, 2026", paidDate: null,           status: "Pending",      fileName: "reverse-billing-rb-10086.pdf" },
  { id: "RB-10087", bookingRef: "BK-20487", client: "Airspeed Corp.",     totalAmount: 8200,  trips: 1, costPerTrip: 8200,  issueDate: "Aug 10, 2026", dueDate: "Aug 14, 2026", paidDate: null,           status: "Overdue",      fileName: "reverse-billing-rb-10087.pdf" },
  { id: "RB-10088", bookingRef: "BK-20488", client: "FreshMart PH",       totalAmount: 22100, trips: 3, costPerTrip: 7367,  issueDate: "Aug 11, 2026", dueDate: "Aug 25, 2026", paidDate: null,           status: "Under Review", fileName: "reverse-billing-rb-10088.pdf" },
];

const expenses: Expense[] = [
  { id: "EX-3401", category: "Fuel",            date: "Aug 03, 2026", payee: "Caltex Fleet Services", amount: 24300, paymentMethod: "Corporate Card", status: "Paid"    },
  { id: "EX-3402", category: "Vehicle Repair",  date: "Aug 05, 2026", payee: "Makati AutoCare",       amount: 18700, paymentMethod: "Bank Transfer",  status: "Pending" },
  { id: "EX-3403", category: "Toll & Parking",  date: "Aug 06, 2026", payee: "Expressway Pass",       amount: 8950,  paymentMethod: "Cash Advance",   status: "Paid"    },
  { id: "EX-3404", category: "Office Supplies", date: "Aug 07, 2026", payee: "Central Depot",         amount: 4150,  paymentMethod: "Corporate Card", status: "Review"  },
  { id: "EX-3405", category: "Fuel",            date: "Aug 08, 2026", payee: "Shell Cabuyao",         amount: 19600, paymentMethod: "Corporate Card", status: "Paid"    },
  { id: "EX-3406", category: "Maintenance",     date: "Aug 09, 2026", payee: "Fleet Workshop PH",     amount: 31200, paymentMethod: "Bank Transfer",  status: "Pending" },
  { id: "EX-3407", category: "Insurance",       date: "Aug 10, 2026", payee: "Pioneer Insurance",     amount: 18000, paymentMethod: "Bank Transfer",  status: "Paid"    },
  { id: "EX-3408", category: "Driver Allowance",date: "Aug 11, 2026", payee: "Payroll Office",        amount: 12400, paymentMethod: "Cash Advance",   status: "Review"  },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const fmt = (n: number) => `₱${n.toLocaleString()}`;

const INVOICE_FILTER_TABS = ["Paid Invoices", "Pending Payments", "Overdue Invoices", "Under Review"] as const;
type InvoiceFilterTab = typeof INVOICE_FILTER_TABS[number];

const FILTER_TO_STATUS: Record<InvoiceFilterTab, InvoiceStatus> = {
  "Paid Invoices":      "Paid",
  "Pending Payments":   "Pending",
  "Overdue Invoices":   "Overdue",
  "Under Review":       "Under Review",
};

const EXPENSE_FILTERS = ["All Expenses", "Paid", "Pending", "Review"] as const;
type ExpenseFilter = typeof EXPENSE_FILTERS[number];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, accent,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div style={{
      background: "#1c1c1c",
      border: "1px solid #2a2a2a",
      borderRadius: 12,
      padding: "20px 22px",
      display: "flex",
      flexDirection: "column",
      gap: 12,
      flex: 1,
      minWidth: 0,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: 11, color: "#666", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 500 }}>
          {label}
        </span>
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: `${accent}18`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: accent, flexShrink: 0,
        }}>
          {icon}
        </div>
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: "#fff", letterSpacing: -1 }}>{value}</div>
      <div style={{ height: 3, background: "#2a2a2a", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: "65%", background: accent, borderRadius: 99 }} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: InvoiceStatus | ExpenseStatus }) {
  const map: Record<string, { bg: string; color: string }> = {
    Paid:           { bg: "rgba(74,222,128,0.12)", color: "#4ade80" },
    Pending:        { bg: "rgba(251,191,36,0.12)",  color: "#fbbf24" },
    Overdue:        { bg: "rgba(239,68,68,0.12)",   color: "#ef4444" },
    "Under Review": { bg: "rgba(139,92,246,0.12)",  color: "#a78bfa" },
    Review:         { bg: "rgba(139,92,246,0.12)",  color: "#a78bfa" },
  };
  const s = map[status] ?? map.Pending;
  return (
    <span style={{
      background: s.bg, color: s.color,
      border: `1px solid ${s.color}30`,
      fontSize: 11, fontWeight: 600,
      padding: "3px 10px", borderRadius: 99,
      whiteSpace: "nowrap",
    }}>
      {status}
    </span>
  );
}

// ─── Billing Module ───────────────────────────────────────────────────────────

function BillingModule() {
  const [activeFilter, setActiveFilter] = useState<InvoiceFilterTab>("Paid Invoices");

  const filtered = useMemo(
    () => invoices.filter(inv => inv.status === FILTER_TO_STATUS[activeFilter]),
    [activeFilter],
  );

  const displayed = filtered[0] ?? null;

  const paidCount      = invoices.filter(i => i.status === "Paid").length;
  const pendingCount   = invoices.filter(i => i.status === "Pending").length;
  const overdueCount   = invoices.filter(i => i.status === "Overdue").length;
  const expensesMTD    = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <StatCard label="Paid Invoices"       value={paidCount}    icon={<CheckCircle size={17} />}    accent="#4ade80" />
        <StatCard label="Pending Review"      value={pendingCount} icon={<Clock size={17} />}          accent="#fbbf24" />
        <StatCard label="Overdue Items"       value={overdueCount} icon={<AlertTriangle size={17} />}  accent="#ef4444" />
        <StatCard label="Expenses This Month" value={fmt(expensesMTD)} icon={<Wallet size={17} />}    accent="#22d3ee" />
      </div>

      {/* Main content */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16 }}>
        {/* Left: Invoice card + filter tabs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {/* Section header */}
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#fff" }}>Reverse Billing Module</h2>
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
            {INVOICE_FILTER_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                style={{
                  background: activeFilter === tab ? "#22d3ee" : "#1c1c1c",
                  border: `1px solid ${activeFilter === tab ? "#22d3ee" : "#2a2a2a"}`,
                  color: activeFilter === tab ? "#000" : "#888",
                  borderRadius: 99, padding: "7px 16px",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {tab}
              </button>
            ))}
            <button style={{
              marginLeft: "auto", display: "flex", alignItems: "center", gap: 6,
              background: "transparent", border: "1px solid #2a2a2a", borderRadius: 8,
              color: "#888", padding: "7px 14px", fontSize: 12, cursor: "pointer",
            }}>
              <Search size={13} /> Search
            </button>
            <button style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "#22d3ee18", border: "1px solid #22d3ee40", borderRadius: 8,
              color: "#22d3ee", padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              <ArrowDownToLine size={13} /> Export Invoices
            </button>
          </div>

          {/* Invoice card */}
          {displayed ? (
            <div style={{
              background: "#1c1c1c", border: "1px solid #2a2a2a",
              borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 16,
            }}>
              {/* Card header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <FileText size={15} color="#22d3ee" />
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                      {displayed.id} · {displayed.bookingRef}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: "#666" }}>{displayed.client}</span>
                </div>
                <StatusBadge status={displayed.status} />
              </div>

              {/* Detail grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {[
                  { label: "Total Amount",  value: fmt(displayed.totalAmount) },
                  { label: "Trips",         value: String(displayed.trips) },
                  { label: "Cost / Trip",   value: fmt(displayed.costPerTrip) },
                  { label: "Issue Date",    value: displayed.issueDate },
                  { label: "Due Date",      value: displayed.dueDate },
                  { label: "Paid Date",     value: displayed.paidDate ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label} style={{
                    background: "#232323", border: "1px solid #2e2e2e",
                    borderRadius: 10, padding: "12px 14px",
                  }}>
                    <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                paddingTop: 14, borderTop: "1px solid #2a2a2a",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <FileText size={13} color="#555" />
                  <span style={{ fontSize: 12, color: "#555" }}>Submitted File: </span>
                  <span style={{ fontSize: 12, color: "#ccc", fontWeight: 500 }}>{displayed.fileName}</span>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "transparent", border: "none", color: "#888",
                    fontSize: 12, cursor: "pointer",
                  }}>
                    <Download size={13} /> Download File
                  </button>
                  <button style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "transparent", border: "none", color: "#888",
                    fontSize: 12, cursor: "pointer",
                  }}>
                    <FileDown size={13} /> Export Invoice
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              background: "#1c1c1c", border: "1px solid #2a2a2a", borderRadius: 14,
              padding: 40, textAlign: "center", color: "#555", fontSize: 13,
            }}>
              No invoices in this category.
            </div>
          )}

          {/* More invoices in category */}
          {filtered.length > 1 && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.slice(1).map(inv => (
                <div key={inv.id} style={{
                  background: "#1a1a1a", border: "1px solid #252525", borderRadius: 10,
                  padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
                  cursor: "pointer",
                }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#22d3ee" }}>{inv.id}</span>
                    <span style={{ fontSize: 12, color: "#555", marginLeft: 8 }}>{inv.bookingRef} · {inv.client}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{fmt(inv.totalAmount)}</span>
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Workflow Summary + Billing Notes */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Workflow Summary */}
          <div style={{
            background: "#1c1c1c", border: "1px solid #2a2a2a",
            borderRadius: 14, padding: 20,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#fff" }}>Workflow Summary</h3>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "#555" }}>Billing operations at a glance</p>
              </div>
              <CheckCircle size={16} color="#22d3ee" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Reviewed this week", value: "18 invoices" },
                { label: "OR generated",        value: "34 receipts" },
                { label: "Exports completed",   value: "96 files" },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  background: "#232323", border: "1px solid #2e2e2e",
                  borderRadius: 8, padding: "11px 14px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span style={{ fontSize: 13, color: "#777" }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Billing Notes */}
          <div style={{
            background: "#1c1c1c", border: "1px solid #2a2a2a",
            borderRadius: 14, padding: 20, flex: 1,
          }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "#fff" }}>Billing Notes</h3>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                "Paid invoices can be downloaded or exported instantly.",
                "Pending invoices allow official receipt generation before closing the transaction.",
                "Overdue invoices stay exportable for collection follow-up.",
                "Under review invoices support approval or rejection with remarks.",
              ].map((note, i) => (
                <li key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#666", lineHeight: 1.5 }}>
                  <span style={{ color: "#333", flexShrink: 0 }}>•</span>
                  {note}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Expenses Module ──────────────────────────────────────────────────────────

function ExpensesModule() {
  const [activeFilter, setActiveFilter] = useState<ExpenseFilter>("All Expenses");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");

  const paidCount   = invoices.filter(i => i.status === "Paid").length;
  const pendingCount = invoices.filter(i => i.status === "Pending").length;
  const overdueCount = invoices.filter(i => i.status === "Overdue").length;
  const expensesMTD = expenses.reduce((s, e) => s + e.amount, 0);

  const searchLower = search.toLowerCase();
  const filtered = useMemo(() => expenses.filter(e => {
    const matchFilter =
      activeFilter === "All Expenses" ||
      (activeFilter === "Paid" && e.status === "Paid") ||
      (activeFilter === "Pending" && e.status === "Pending") ||
      (activeFilter === "Review" && e.status === "Review");
    if (!matchFilter) return false;
    if (!searchLower) return true;
    return (
      e.id.toLowerCase().includes(searchLower) ||
      e.category.toLowerCase().includes(searchLower) ||
      e.payee.toLowerCase().includes(searchLower)
    );
  }), [activeFilter, searchLower]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#fff" }}>Expenses Module</h2>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {EXPENSE_FILTERS.map(f => (
            <button key={f} onClick={() => setActiveFilter(f)} style={{
              background: activeFilter === f ? "#22d3ee" : "#1c1c1c",
              border: `1px solid ${activeFilter === f ? "#22d3ee" : "#2a2a2a"}`,
              color: activeFilter === f ? "#000" : "#888",
              borderRadius: 99, padding: "7px 16px",
              fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
            }}>{f}</button>
          ))}
          <button style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#1c1c1c", border: "1px solid #2a2a2a", borderRadius: 8,
            color: "#888", padding: "7px 14px", fontSize: 12, cursor: "pointer",
          }}>
            <RefreshCw size={13} /> Sync
          </button>
          <button style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#22d3ee", border: "none", borderRadius: 8,
            color: "#000", padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
            <Plus size={13} /> New Expense
          </button>
          <button style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#1c1c1c", border: "1px solid #2a2a2a", borderRadius: 8,
            color: "#888", padding: "7px 14px", fontSize: 12, cursor: "pointer",
          }}>
            <ArrowDownToLine size={13} /> Export Records
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <StatCard label="Paid Invoices"       value={paidCount}    icon={<CheckCircle size={17} />}    accent="#4ade80" />
        <StatCard label="Pending Review"      value={pendingCount} icon={<Clock size={17} />}          accent="#fbbf24" />
        <StatCard label="Overdue Items"       value={overdueCount} icon={<AlertTriangle size={17} />}  accent="#ef4444" />
        <StatCard label="Expenses This Month" value={fmt(expensesMTD)} icon={<Wallet size={17} />}    accent="#22d3ee" />
      </div>

      {/* Main content */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>
        {/* Expense Records table */}
        <div style={{
          background: "#1c1c1c", border: "1px solid #2a2a2a",
          borderRadius: 14, overflow: "hidden",
        }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #2a2a2a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#fff" }}>Expense Records</h3>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "#555" }}>View and manage company expense transactions</p>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "#232323", border: "1px solid #2e2e2e",
              borderRadius: 8, padding: "8px 12px",
            }}>
              <Search size={13} color="#555" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by category, payee, or reference"
                style={{
                  background: "transparent", border: "none", outline: "none",
                  color: "#fff", fontSize: 12, width: 220,
                }}
              />
            </div>
          </div>

          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "100px 1fr 1fr 100px 120px 90px",
            padding: "10px 20px",
            borderBottom: "1px solid #252525",
            background: "#1a1a1a",
          }}>
            {["Expense ID", "Category", "Payee", "Amount", "Payment Method", "Status"].map(h => (
              <span key={h} style={{ fontSize: 10, color: "#444", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>{h}</span>
            ))}
          </div>

          {/* Rows */}
          {filtered.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#555", fontSize: 13 }}>
              No expenses match your filters.
            </div>
          ) : (
            filtered.map((e, i) => (
              <div key={e.id} style={{
                display: "grid",
                gridTemplateColumns: "100px 1fr 1fr 100px 120px 90px",
                padding: "14px 20px",
                borderBottom: i < filtered.length - 1 ? "1px solid #222" : "none",
                alignItems: "center",
                cursor: "pointer",
                transition: "background 0.12s",
              }}
                onMouseEnter={el => (el.currentTarget.style.background = "#232323")}
                onMouseLeave={el => (el.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: "#22d3ee" }}>{e.id}</span>
                <div>
                  <div style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>{e.category}</div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{e.date}</div>
                </div>
                <span style={{ fontSize: 13, color: "#ccc" }}>{e.payee}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{fmt(e.amount)}</span>
                <span style={{ fontSize: 12, color: "#777" }}>{e.paymentMethod}</span>
                <StatusBadge status={e.status} />
              </div>
            ))
          )}
        </div>

        {/* Right: New Expense Entry + Expense Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* New Expense Entry form */}
          <div style={{
            background: "#1c1c1c", border: "1px solid #2a2a2a",
            borderRadius: 14, padding: 20,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#fff" }}>New Expense Entry</h3>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "#555" }}>Quick create form</p>
              </div>
              <Receipt size={16} color="#fbbf24" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "Expense Category",  value: category,       setter: setCategory,       placeholder: "Fuel / Repair / Office" },
                { label: "Payee / Vendor",    value: payee,          setter: setPayee,          placeholder: "Enter company name" },
                { label: "Amount",            value: amount,         setter: setAmount,         placeholder: "₱0.00" },
                { label: "Payment Status",    value: paymentStatus,  setter: setPaymentStatus,  placeholder: "Paid / Pending / Review" },
              ].map(({ label, value, setter, placeholder }) => (
                <div key={label}>
                  <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>
                    {label}
                  </div>
                  <input
                    value={value}
                    onChange={e => setter(e.target.value)}
                    placeholder={placeholder}
                    style={{
                      width: "100%", boxSizing: "border-box",
                      background: "#242424", border: "1px solid #303030",
                      borderRadius: 8, padding: "9px 12px",
                      color: "#fff", fontSize: 13, outline: "none",
                    }}
                  />
                </div>
              ))}

              {/* Upload area */}
              <div style={{
                background: "#242424", border: "1px dashed #333",
                borderRadius: 8, padding: "14px 12px", textAlign: "center",
                cursor: "pointer", marginTop: 2,
              }}>
                <span style={{ fontSize: 12, color: "#555" }}>Attach receipt or proof of payment here</span>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: "#22d3ee", border: "none", borderRadius: 8,
                  color: "#000", padding: "9px 0", fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>
                  <Plus size={14} /> Create Expense
                </button>
                <button style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: "#232323", border: "1px solid #2e2e2e", borderRadius: 8,
                  color: "#888", padding: "9px 0", fontSize: 12, cursor: "pointer",
                }}>
                  <CreditCard size={14} /> Upload File
                </button>
              </div>
            </div>
          </div>

          {/* Expense Controls */}
          <div style={{
            background: "#1c1c1c", border: "1px solid #2a2a2a",
            borderRadius: 14, padding: 20,
          }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "#fff" }}>Expense Controls</h3>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                "Update payment status as records are settled.",
                "Export filtered expense records for accounting review.",
                "Keep supporting files attached for easy auditing.",
                "Create new expense entries without leaving the module.",
              ].map((note, i) => (
                <li key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#666", lineHeight: 1.5 }}>
                  <span style={{ color: "#333", flexShrink: 0 }}>•</span>
                  {note}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function BillingManagementView() {
  const [activeTab, setActiveTab] = useState<Tab>("billing");

  return (
    <div style={{
      background: "#141414",
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Inter', system-ui, sans-serif",
      color: "#fff",
      overflow: "hidden",
    }}>
      {/* Header — fixed height, never scrolls */}
      <div style={{
        flexShrink: 0,
        background: "#181818",
        borderBottom: "1px solid #222",
        padding: "20px 28px 18px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>
              Billing Management Module
            </h1>
          </div>

          {/* Tab switcher */}
          <div style={{ display: "flex", gap: 6, background: "#1c1c1c", border: "1px solid #2a2a2a", borderRadius: 10, padding: 4, flexShrink: 0 }}>
            <button
              onClick={() => setActiveTab("billing")}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                background: activeTab === "billing" ? "#22d3ee18" : "transparent",
                border: activeTab === "billing" ? "1px solid #22d3ee40" : "1px solid transparent",
                borderRadius: 8, padding: "8px 16px",
                color: activeTab === "billing" ? "#22d3ee" : "#666",
                fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
              }}
            >
              <Receipt size={14} /> Billing Management
            </button>
            <button
              onClick={() => setActiveTab("expenses")}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                background: activeTab === "expenses" ? "#22d3ee18" : "transparent",
                border: activeTab === "expenses" ? "1px solid #22d3ee40" : "1px solid transparent",
                borderRadius: 8, padding: "8px 16px",
                color: activeTab === "expenses" ? "#22d3ee" : "#666",
                fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
              }}
            >
              <Wallet size={14} /> Expenses Module
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable content area — fills remaining height */}
      <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px 32px" }}>
        {activeTab === "billing"   && <BillingModule />}
        {activeTab === "expenses"  && <ExpensesModule />}
      </div>
    </div>
  );
}