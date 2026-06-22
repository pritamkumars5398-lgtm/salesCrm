"use client";
import { useEffect, useState } from "react";
import {
  IconUsers,
  IconCpu,
  IconPhoneCall,
  IconTrendingUp,
  IconTrendingDown,
  IconCoin,
  IconAdjustments,
  IconUserCheck,
  IconRefresh,
  IconSearch,
  IconEdit,
  IconCalculator,
  IconSettings,
} from "@tabler/icons-react";
import { PLANS, type PlanId } from "@/lib/plans";
import { useAppStore } from "@/store/useAppStore";

interface UserAgent {
  id: string;
  name: string;
}

interface UserUsage {
  leadsScraped: number;
  messagesSent: number;
  callsMade: number;
  emailsSent: number;
}

interface PlatformUser {
  id: string;
  name: string;
  email: string;
  agentsCount: number;
  agents: UserAgent[];
  plan: PlanId;
  hasCustomLimits: boolean;
  callsSupport: string;
  usage: UserUsage;
  tokens: number;
  costINR: number;
  revenueINR: number;
  isLive: boolean;
}

interface SuperadminData {
  summary: {
    totalUsers: number;
    totalAgents: number;
    totalLeads: number;
    totalMessages: number;
    totalCalls: number;
    totalEmails: number;
    totalTokens: number;
    totalRevenue: number;
    totalCost: number;
    netProfit: number;
    marginPercent: number;
  };
  users: PlatformUser[];
  weeklyUsageTrend: { day: string; leads: number; messages: number; calls: number; cost: number }[];
  monthlyFinancialTrend: { month: string; revenue: number; cost: number }[];
  planDistribution: { name: string; value: number; color: string }[];
}

export default function Superadmin() {
  const { showToast } = useAppStore();
  const [data, setData] = useState<SuperadminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState(false);

  // Cost Analyzer States
  const [calcLeads, setCalcLeads] = useState(500);
  const [calcWA, setCalcWA] = useState(1000);
  const [calcSMS, setCalcSMS] = useState(250);
  const [calcCalls, setCalcCalls] = useState(100);
  const [calcEmails, setCalcEmails] = useState(2000);
  const [calcMargin, setCalcMargin] = useState(50); // percentage markup

  // Plan editing states
  const [editingUser, setEditingUser] = useState<PlatformUser | null>(null);
  const [editAgentId, setEditAgentId] = useState("");
  const [editPlanId, setEditPlanId] = useState<PlanId>("free");
  const [editOverride, setEditOverride] = useState(false);
  const [editLimitLeads, setEditLimitLeads] = useState(25);
  const [editLimitWA, setEditLimitWA] = useState(50);
  const [editLimitCalls, setEditLimitCalls] = useState(5);
  const [editLimitEmails, setEditLimitEmails] = useState(100);

  function fetchData() {
    setLoading(true);
    fetch("/api/superadmin")
      .then((r) => r.json())
      .then((res) => {
        if (res.error) {
          showToast(res.error, "error");
        } else {
          setData(res);
        }
      })
      .catch(() => showToast("Could not retrieve superadmin data", "error"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchData();
  }, []);

  // Cost Analyzer Math
  const costLeads = calcLeads * 0.8;
  const costWA = calcWA * 0.65;
  const costSMS = calcSMS * 1.2;
  const costCalls = calcCalls * 12.0;
  const costEmails = calcEmails * 0.08;
  const totalCOGS = costLeads + costWA + costSMS + costCalls + costEmails;
  const recommendedRetail = totalCOGS * (1 + calcMargin / 100);
  const customerProfit = recommendedRetail - totalCOGS;

  const filteredUsers = data?.users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  ) || [];

  function handleStartEdit(user: PlatformUser) {
    setEditingUser(user);
    setEditPlanId(user.plan);
    setEditOverride(user.hasCustomLimits);
    if (user.agents.length > 0) {
      setEditAgentId(user.agents[0].id);
      // Fetch dynamic settings to fill details if needed or use defaults
      const planLimits = PLANS[user.plan]?.limits || { leadsPerMonth: 25, messagesPerMonth: 50, callsPerMonth: 5, emailsPerMonth: 100 };
      setEditLimitLeads(planLimits.leadsPerMonth);
      setEditLimitWA(planLimits.messagesPerMonth);
      setEditLimitCalls(planLimits.callsPerMonth);
      setEditLimitEmails(planLimits.emailsPerMonth);
    } else {
      setEditAgentId("");
    }
  }

  async function handleSavePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!editAgentId || updating) return;
    setUpdating(true);

    const customLimitsObj = editOverride
      ? {
          leadsPerMonth: Number(editLimitLeads),
          messagesPerMonth: Number(editLimitWA),
          callsPerMonth: Number(editLimitCalls),
          emailsPerMonth: Number(editLimitEmails),
          agents: PLANS[editPlanId]?.limits.agents ?? 1,
        }
      : null;

    try {
      const res = await fetch("/api/superadmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: editAgentId,
          planId: editPlanId,
          customLimits: customLimitsObj,
        }),
      });

      if (res.ok) {
        showToast("Billing configuration updated!", "success");
        setEditingUser(null);
        fetchData();
      } else {
        const err = await res.json();
        showToast(err.error || "Update failed", "error");
      }
    } catch {
      showToast("Network error updating plan", "error");
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, color: "var(--color-text3)", fontSize: 13, fontFamily: "var(--font-sans)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 16, height: 16, border: "2px solid #6366f1", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <span>Syncing platform analytics...</span>
        </div>
        <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { to { transform: rotate(360deg); } }` }} />
      </div>
    );
  }

  if (!data) {
    return <div style={{ padding: 40, color: "red", fontSize: 13 }}>Failed to load superadmin dashboard details.</div>;
  }

  const { summary, weeklyUsageTrend, monthlyFinancialTrend, planDistribution } = data;

  return (
    <div style={{ padding: "28px 28px 60px", fontFamily: "var(--font-sans)", color: "var(--color-text)", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--color-text)", margin: "0 0 4px 0" }}>Platform Superadmin</h2>
          <p style={{ fontSize: 13, color: "var(--color-text3)", margin: 0 }}>Review platform activity, control customer limits, and compute SaaS pricing margins.</p>
        </div>
        <button
          onClick={fetchData}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 10,
            background: "var(--color-bg3)",
            border: "1px solid var(--color-bg4)",
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--color-text2)",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          <IconRefresh size={14} />
          Refresh Stats
        </button>
      </div>

      {/* Overview Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
        {[
          { label: "Active Customers", val: summary.totalUsers.toLocaleString(), sub: `${summary.totalAgents} Agents active`, Icon: IconUsers, color: "#4f46e5" },
          { label: "AI Outreach Calls", val: summary.totalCalls.toLocaleString(), sub: "Through Twilio/Vapi", Icon: IconPhoneCall, color: "#10b981" },
          { label: "Total LLM Tokens", val: summary.totalTokens.toLocaleString(), sub: `From ${summary.totalMessages} interactions`, Icon: IconCpu, color: "#8b5cf6" },
          {
            label: "Monthly Margin",
            val: `₹${summary.netProfit.toLocaleString()}`,
            sub: `${summary.marginPercent}% Net Profit Margin`,
            Icon: summary.netProfit >= 0 ? IconTrendingUp : IconTrendingDown,
            color: summary.netProfit >= 0 ? "#f59e0b" : "#ef4444",
            rev: `Rev: ₹${summary.totalRevenue.toLocaleString()} | Cost: ₹${summary.totalCost.toLocaleString()}`
          },
        ].map((c, i) => (
          <div
            key={i}
            style={{
              background: "var(--color-bg2)",
              border: "1px solid var(--color-bg4)",
              borderRadius: 16,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-text3)" }}>{c.label}</span>
              <span style={{ width: 32, height: 32, borderRadius: 8, background: `${c.color}10`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <c.Icon size={16} style={{ color: c.color }} />
              </span>
            </div>
            <h3 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 4px 0", color: "var(--color-text)" }}>{c.val}</h3>
            <p style={{ fontSize: 11, color: "var(--color-text3)", margin: 0, fontWeight: 500 }}>{c.sub}</p>
            {c.rev && <p style={{ fontSize: 10, color: "var(--color-text2)", margin: "4px 0 0 0", borderTop: "1px dashed var(--color-bg4)", paddingTop: 4 }}>{c.rev}</p>}
          </div>
        ))}
      </div>

      {/* Analytics Charts & Plan Distribution */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 28 }}>
        {/* Weekly Trend (SVG chart) */}
        <div style={{ background: "var(--color-bg2)", border: "1px solid var(--color-bg4)", borderRadius: 16, padding: 20 }}>
          <h4 style={{ fontSize: 14, fontWeight: 800, margin: "0 0 16px 0", color: "var(--color-text)" }}>7-Day Infrastructure Usage & Cost Trend</h4>
          <div style={{ width: "100%", height: 180 }}>
            <svg viewBox="0 0 500 180" style={{ width: "100%", height: "100%" }}>
              <defs>
                <linearGradient id="gradient-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Grid Lines */}
              <line x1="30" y1="20" x2="480" y2="20" stroke="var(--color-bg4)" strokeDasharray="3,3" />
              <line x1="30" y1="70" x2="480" y2="70" stroke="var(--color-bg4)" strokeDasharray="3,3" />
              <line x1="30" y1="120" x2="480" y2="120" stroke="var(--color-bg4)" strokeDasharray="3,3" />
              <line x1="30" y1="150" x2="480" y2="150" stroke="var(--color-bg4)" />

              {/* Area path & line path */}
              {(() => {
                const maxVal = Math.max(...weeklyUsageTrend.map((t) => t.cost)) || 1;
                const points = weeklyUsageTrend.map((t, idx) => {
                  const x = 30 + idx * 72;
                  const y = 150 - (t.cost / maxVal) * 120;
                  return { x, y };
                });
                const dLine = `M ${points.map((p) => `${p.x} ${p.y}`).join(" L ")}`;
                const dArea = `${dLine} L ${points[points.length - 1].x} 150 L ${points[0].x} 150 Z`;

                return (
                  <>
                    <path d={dArea} fill="url(#gradient-area)" />
                    <path d={dLine} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />
                    {points.map((p, idx) => (
                      <g key={idx}>
                        <circle cx={p.x} cy={p.y} r="4" fill="#fff" stroke="#6366f1" strokeWidth="2" />
                        <text x={p.x} y="166" fontSize="9" textAnchor="middle" fill="var(--color-text3)" fontWeight="bold">
                          {weeklyUsageTrend[idx].day}
                        </text>
                        <text x={p.x} y={p.y - 8} fontSize="8.5" textAnchor="middle" fill="var(--color-text)" fontWeight="bold">
                          ₹{weeklyUsageTrend[idx].cost}
                        </text>
                      </g>
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>
        </div>

        {/* Subscription Plan Distribution */}
        <div style={{ background: "var(--color-bg2)", border: "1px solid var(--color-bg4)", borderRadius: 16, padding: 20 }}>
          <h4 style={{ fontSize: 14, fontWeight: 800, margin: "0 0 16px 0", color: "var(--color-text)" }}>Plan Distribution</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {planDistribution.map((plan) => {
              const total = planDistribution.reduce((sum, p) => sum + p.value, 0) || 1;
              const percent = Math.round((plan.value / total) * 100);
              return (
                <div key={plan.name} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-text2)" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: plan.color }} />
                      {plan.name}
                    </span>
                    <span style={{ color: "var(--color-text)" }}>
                      {plan.value} {plan.value === 1 ? "user" : "users"} ({percent}%)
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: "var(--color-bg3)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${percent}%`, background: plan.color, borderRadius: 99 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Interactive Cost Analyzer & Customer Pricing Calculator */}
      <div style={{ background: "rgba(99, 102, 241, 0.04)", border: "1px solid rgba(99, 102, 241, 0.15)", borderRadius: 20, padding: 24, marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
          <IconCalculator size={20} style={{ color: "#6366f1" }} />
          <h4 style={{ fontSize: 16, fontWeight: 800, color: "var(--color-text)", margin: 0 }}>Customer Pricing & Cost Analyzer</h4>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(99, 102, 241, 0.1)", color: "#6366f1", marginLeft: "auto" }}>
            Margins Calculator
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
          {/* Sliders Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
                <span style={{ color: "var(--color-text2)" }}>Leads Scraped</span>
                <span style={{ color: "#6366f1" }}>{calcLeads.toLocaleString()} leads</span>
              </div>
              <input type="range" min="0" max="5000" step="50" value={calcLeads} onChange={(e) => setCalcLeads(Number(e.target.value))} style={{ width: "100%", accentColor: "#6366f1" }} />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
                <span style={{ color: "var(--color-text2)" }}>WhatsApp Messages</span>
                <span style={{ color: "#6366f1" }}>{calcWA.toLocaleString()} msgs</span>
              </div>
              <input type="range" min="0" max="10000" step="100" value={calcWA} onChange={(e) => setCalcWA(Number(e.target.value))} style={{ width: "100%", accentColor: "#6366f1" }} />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
                <span style={{ color: "var(--color-text2)" }}>SMS Messages</span>
                <span style={{ color: "#6366f1" }}>{calcSMS.toLocaleString()} SMS</span>
              </div>
              <input type="range" min="0" max="5000" step="50" value={calcSMS} onChange={(e) => setCalcSMS(Number(e.target.value))} style={{ width: "100%", accentColor: "#6366f1" }} />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
                <span style={{ color: "var(--color-text2)" }}>AI Call Duration</span>
                <span style={{ color: "#6366f1" }}>{calcCalls.toLocaleString()} minutes</span>
              </div>
              <input type="range" min="0" max="1000" step="10" value={calcCalls} onChange={(e) => setCalcCalls(Number(e.target.value))} style={{ width: "100%", accentColor: "#6366f1" }} />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
                <span style={{ color: "var(--color-text2)" }}>Emails Sent</span>
                <span style={{ color: "#6366f1" }}>{calcEmails.toLocaleString()} emails</span>
              </div>
              <input type="range" min="0" max="25000" step="500" value={calcEmails} onChange={(e) => setCalcEmails(Number(e.target.value))} style={{ width: "100%", accentColor: "#6366f1" }} />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
                <span style={{ color: "var(--color-text2)" }}>Target Profit Markup</span>
                <span style={{ color: "#10b981" }}>{calcMargin}% Markup</span>
              </div>
              <input type="range" min="10" max="300" step="10" value={calcMargin} onChange={(e) => setCalcMargin(Number(e.target.value))} style={{ width: "100%", accentColor: "#10b981" }} />
            </div>
          </div>

          {/* Pricing Analysis Results */}
          <div style={{ background: "var(--color-bg2)", borderRadius: 16, border: "1px solid var(--color-bg4)", padding: 20, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text3)", margin: "0 0 12px 0" }}>
                Infrastructure / Cost of Goods Sold (COGS)
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5, borderBottom: "1px solid var(--color-bg4)", paddingBottom: 14, marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--color-text3)" }}>Apify Lead Scraping (₹0.80 / lead)</span>
                  <span style={{ fontWeight: 600 }}>₹{costLeads.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--color-text3)" }}>Twilio WhatsApp Message (₹0.65 / msg)</span>
                  <span style={{ fontWeight: 600 }}>₹{costWA.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--color-text3)" }}>Twilio SMS Message (₹1.20 / SMS)</span>
                  <span style={{ fontWeight: 600 }}>₹{costSMS.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--color-text3)" }}>Vapi Voice AI (₹12.00 / call minute)</span>
                  <span style={{ fontWeight: 600 }}>₹{costCalls.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--color-text3)" }}>Resend / SMTP Email (₹0.08 / email)</span>
                  <span style={{ fontWeight: 600 }}>₹{costEmails.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "var(--color-text)", fontSize: 13, paddingTop: 6 }}>
                  <span>Total Tools Infrastructure Cost</span>
                  <span>₹{totalCOGS.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text3)", margin: 0 }}>SUGGESTED CLIENT SUBSCRIPTION RETAIL</p>
                  <p style={{ fontSize: 24, fontWeight: 800, color: "#6366f1", margin: 0 }}>₹{Math.round(recommendedRetail).toLocaleString()}/mo</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#10b981", margin: 0 }}>NET MARGIN (₹)</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: "#10b981", margin: 0 }}>+₹{Math.round(customerProfit).toLocaleString()}</p>
                </div>
              </div>

              <div style={{ padding: 12, borderRadius: 10, background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.15)", fontSize: 12, color: "var(--color-text2)", lineHeight: 1.5 }}>
                ✨ <strong>Pricing Strategy Guide:</strong> Charging customers <strong>₹{Math.round(recommendedRetail).toLocaleString()}</strong> yields a <strong>{calcMargin}%</strong> profit markup. This covers the infra cost of <strong>₹{Math.round(totalCOGS).toLocaleString()}</strong> and returns <strong>₹{Math.round(customerProfit).toLocaleString()}</strong> cash flow per subscription month.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Users List & Plan Management */}
      <div style={{ background: "var(--color-bg2)", border: "1px solid var(--color-bg4)", borderRadius: 16, overflow: "hidden" }}>
        {/* Table Controls */}
        <div style={{ padding: 20, borderBottom: "1px solid var(--color-bg4)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4 style={{ fontSize: 15, fontWeight: 800, color: "var(--color-text)", margin: 0 }}>Registered Platform Accounts ({filteredUsers.length})</h4>
          <div style={{ position: "relative", width: 260 }}>
            <input
              type="text"
              placeholder="Search user or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 34px",
                borderRadius: 10,
                border: "1px solid var(--color-bg4)",
                fontSize: 12.5,
                background: "var(--color-bg3)",
                color: "var(--color-text)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <IconSearch size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-text3)" }} />
          </div>
        </div>

        {/* Users Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
            <thead>
              <tr style={{ background: "var(--color-bg3)", borderBottom: "1px solid var(--color-bg4)", color: "var(--color-text3)", fontWeight: 700 }}>
                <th style={{ padding: "12px 20px" }}>Customer Account</th>
                <th style={{ padding: "12px 20px" }}>Active Agents</th>
                <th style={{ padding: "12px 20px" }}>Subscription Plan</th>
                <th style={{ padding: "12px 20px" }}>Leads Scraped</th>
                <th style={{ padding: "12px 20px" }}>WhatsApp / SMS</th>
                <th style={{ padding: "12px 20px" }}>AI Calls / Email</th>
                <th style={{ padding: "12px 20px" }}>Simulated Cost</th>
                <th style={{ padding: "12px 20px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} style={{ borderBottom: "1px solid var(--color-bg4)", transition: "background 0.15s" }}>
                  <td style={{ padding: "14px 20px" }}>
                    <p style={{ fontWeight: 700, color: "var(--color-text)", margin: 0 }}>{user.name}</p>
                    <p style={{ fontSize: 11, color: "var(--color-text3)", margin: 0 }}>{user.email}</p>
                  </td>
                  <td style={{ padding: "14px 20px" }}>
                    <span style={{ fontWeight: 600 }}>{user.agentsCount}</span>
                    {user.agents.length > 0 && (
                      <span style={{ fontSize: 10.5, color: "var(--color-text3)", display: "block" }}>
                        ({user.agents.map((a) => a.name).join(", ")})
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "14px 20px" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 99,
                        fontSize: 10.5,
                        fontWeight: 700,
                        background: `${PLANS[user.plan]?.color}18` || "var(--color-bg4)",
                        color: PLANS[user.plan]?.color || "var(--color-text3)",
                        textTransform: "uppercase",
                      }}
                    >
                      {PLANS[user.plan]?.name ?? user.plan}
                    </span>
                    {user.hasCustomLimits && (
                      <span style={{ display: "block", fontSize: 9.5, fontWeight: 700, color: "#10b981", marginTop: 4 }}>
                        CUSTOM LIMITS
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "14px 20px", fontWeight: 600 }}>{user.usage.leadsScraped.toLocaleString()} leads</td>
                  <td style={{ padding: "14px 20px" }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{user.usage.messagesSent.toLocaleString()} WA</p>
                    <p style={{ margin: 0, fontSize: 11, color: "var(--color-text3)" }}>{user.usage.emailsSent.toLocaleString()} emails</p>
                  </td>
                  <td style={{ padding: "14px 20px" }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{user.usage.callsMade.toLocaleString()} calls</p>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: user.callsSupport === "Supported" ? "#10b981" : "var(--color-text3)",
                      }}
                    >
                      Voice: {user.callsSupport}
                    </span>
                  </td>
                  <td style={{ padding: "14px 20px" }}>
                    <p style={{ fontWeight: 700, color: "var(--color-text)", margin: 0 }}>₹{user.costINR.toLocaleString()}</p>
                    <p style={{ fontSize: 10, color: "var(--color-text3)", margin: 0 }}>Rev: ₹{user.revenueINR.toLocaleString()}</p>
                  </td>
                  <td style={{ padding: "14px 20px" }}>
                    <button
                      onClick={() => handleStartEdit(user)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        background: "var(--color-bg3)",
                        border: "1px solid var(--color-bg4)",
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: "var(--color-text2)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <IconEdit size={12} />
                      Set Plan
                    </button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 40, textAlign: "center", color: "var(--color-text3)" }}>
                    No registered user accounts found matching that query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Plan / Limit Overrides Edit Dialog */}
      {editingUser && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
        >
          <div
            style={{
              background: "var(--color-bg2)",
              border: "1px solid var(--color-bg4)",
              borderRadius: 20,
              width: "100%",
              maxWidth: 460,
              padding: 24,
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <h4 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Assign Plan / Customize Limits</h4>
                <p style={{ fontSize: 11.5, color: "var(--color-text3)", margin: "2px 0 0 0" }}>
                  Adjust limits for <strong>{editingUser.name}</strong>
                </p>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--color-text3)", padding: 4 }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSavePlan} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {editingUser.agents.length > 0 ? (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: "var(--color-text2)" }}>Select Agent to Configure</label>
                    <select
                      value={editAgentId}
                      onChange={(e) => setEditAgentId(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid var(--color-bg4)",
                        background: "var(--color-bg3)",
                        color: "var(--color-text)",
                        fontSize: 12.5,
                      }}
                    >
                      {editingUser.agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: "var(--color-text2)" }}>Billing Plan</label>
                    <select
                      value={editPlanId}
                      onChange={(e) => {
                        const newPlan = e.target.value as PlanId;
                        setEditPlanId(newPlan);
                        // If override is off, update display limits matching plans
                        if (!editOverride) {
                          const lms = PLANS[newPlan].limits;
                          setEditLimitLeads(lms.leadsPerMonth);
                          setEditLimitWA(lms.messagesPerMonth);
                          setEditLimitCalls(lms.callsPerMonth);
                          setEditLimitEmails(lms.emailsPerMonth);
                        }
                      }}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid var(--color-bg4)",
                        background: "var(--color-bg3)",
                        color: "var(--color-text)",
                        fontSize: 12.5,
                      }}
                    >
                      {(Object.keys(PLANS) as PlanId[]).map((pid) => (
                        <option key={pid} value={pid}>
                          {PLANS[pid].name} Plan (₹{PLANS[pid].priceINR.toLocaleString()}/mo)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Limits override checkbox */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
                    <input
                      type="checkbox"
                      id="override-chbox"
                      checked={editOverride}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setEditOverride(checked);
                        if (!checked) {
                          const lms = PLANS[editPlanId].limits;
                          setEditLimitLeads(lms.leadsPerMonth);
                          setEditLimitWA(lms.messagesPerMonth);
                          setEditLimitCalls(lms.callsPerMonth);
                          setEditLimitEmails(lms.emailsPerMonth);
                        }
                      }}
                    />
                    <label htmlFor="override-chbox" style={{ fontSize: 12, fontWeight: 700, color: "#10b981", cursor: "pointer" }}>
                      Override plan limits (Custom Limits)
                    </label>
                  </div>

                  {/* Limit fields */}
                  {editOverride && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px", padding: 12, borderRadius: 10, background: "var(--color-bg3)", border: "1px solid var(--color-bg4)" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text3)" }}>Leads limit (-1 = ∞)</label>
                        <input
                          type="number"
                          value={editLimitLeads}
                          onChange={(e) => setEditLimitLeads(Number(e.target.value))}
                          style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-bg4)", fontSize: 12, color: "var(--color-text)" }}
                        />
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text3)" }}>WhatsApp limit</label>
                        <input
                          type="number"
                          value={editLimitWA}
                          onChange={(e) => setEditLimitWA(Number(e.target.value))}
                          style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-bg4)", fontSize: 12, color: "var(--color-text)" }}
                        />
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text3)" }}>Calls limit</label>
                        <input
                          type="number"
                          value={editLimitCalls}
                          onChange={(e) => setEditLimitCalls(Number(e.target.value))}
                          style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-bg4)", fontSize: 12, color: "var(--color-text)" }}
                        />
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text3)" }}>Emails limit</label>
                        <input
                          type="number"
                          value={editLimitEmails}
                          onChange={(e) => setEditLimitEmails(Number(e.target.value))}
                          style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-bg4)", fontSize: 12, color: "var(--color-text)" }}
                        />
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={() => setEditingUser(null)}
                      style={{
                        flex: 1,
                        padding: "10px 0",
                        borderRadius: 10,
                        background: "var(--color-bg3)",
                        color: "var(--color-text2)",
                        fontSize: 12.5,
                        fontWeight: 700,
                        border: "1px solid var(--color-bg4)",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updating}
                      style={{
                        flex: 1,
                        padding: "10px 0",
                        borderRadius: 10,
                        background: "linear-gradient(135deg, #4f46e5, #6366f1)",
                        color: "#fff",
                        fontSize: 12.5,
                        fontWeight: 700,
                        border: "none",
                        cursor: "pointer",
                        opacity: updating ? 0.6 : 1,
                      }}
                    >
                      {updating ? "Saving..." : "Save Configuration"}
                    </button>
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 12.5, color: "var(--color-text3)", textAlign: "center", padding: "10px 0" }}>
                  This customer has not created any agents yet. Setting custom billing limits is disabled.
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
