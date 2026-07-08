"use client";

import React from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { FiPieChart, FiBarChart2 } from "react-icons/fi";

const SEVERITY_COLORS = {
  Critical: "#EF4444",
  High: "#F97316",
  Medium: "#EAB308",
  Low: "#22C55E",
};

const STATUS_COLORS = {
  Open: "#3B82F6",
  Acknowledged: "#8B5CF6",
  Closed: "#64748B",
};

export default function DashboardCharts({ stats }: { stats: any }) {
  const severityData = [
    { name: "Critical", value: stats.critical_severity || 0 },
    { name: "High", value: stats.high_severity || 0 },
    { name: "Medium", value: stats.medium_severity || 0 },
    { name: "Low", value: stats.low_severity || 0 },
  ].filter(d => d.value > 0);

  const statusData = [
    { name: "Open", value: stats.open_cases || 0, fill: STATUS_COLORS.Open },
    { name: "Acknowledged", value: stats.acknowledged_cases || 0, fill: STATUS_COLORS.Acknowledged },
    { name: "Closed", value: stats.closed_cases || 0, fill: STATUS_COLORS.Closed },
  ];

  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>
      <div className="glass-panel" style={{ padding: "16px", minHeight: "300px", display: "flex", flexDirection: "column" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", fontSize: "1rem" }}>
          <FiPieChart /> Severity Distribution
        </h3>
        <div style={{ flex: 1, position: "relative" }}>
          {severityData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={severityData}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {severityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={SEVERITY_COLORS[entry.name as keyof typeof SEVERITY_COLORS]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ background: "var(--bg-main)", border: "var(--glass-border)", borderRadius: "8px", color: "var(--text-main)" }} 
                  itemStyle={{ color: "var(--text-main)" }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)" }}>
              No severity data
            </div>
          )}
        </div>
      </div>

      <div className="glass-panel" style={{ padding: "16px", minHeight: "300px", display: "flex", flexDirection: "column" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", fontSize: "1rem" }}>
          <FiBarChart2 /> Case Status Overview
        </h3>
        <div style={{ flex: 1 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip 
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                contentStyle={{ background: "var(--bg-main)", border: "var(--glass-border)", borderRadius: "8px" }} 
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
