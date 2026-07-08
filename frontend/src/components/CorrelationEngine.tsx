"use client";

import React, { useState } from "react";
import { FiLink, FiCpu, FiClock } from "react-icons/fi";
import { formatTime } from "../lib/utils";

export default function CorrelationEngine({ groups, patterns, stats }: any) {
  const [activeTab, setActiveTab] = useState<"groups" | "patterns" | "timeline">("groups");

  return (
    <div className="glass-panel" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: "400px" }}>
      <div style={{ padding: "16px", borderBottom: "var(--glass-border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "1.1rem" }}>
            <FiLink color="var(--accent-purple)" /> Correlation Engine
          </h3>
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="btn" style={{ background: activeTab === "groups" ? "var(--accent-purple)" : "rgba(255,255,255,0.05)" }} onClick={() => setActiveTab("groups")}>IP Groups</button>
            <button className="btn" style={{ background: activeTab === "patterns" ? "var(--accent-purple)" : "rgba(255,255,255,0.05)" }} onClick={() => setActiveTab("patterns")}>Patterns</button>
            <button className="btn" style={{ background: activeTab === "timeline" ? "var(--accent-purple)" : "rgba(255,255,255,0.05)" }} onClick={() => setActiveTab("timeline")}>Timeline</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: "16px", fontSize: "0.85rem", color: "var(--text-muted)", background: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "8px" }}>
          <span><strong style={{ color: "var(--text-main)" }}>{stats.correlation_groups || 0}</strong> IP Groups</span>
          <span><strong style={{ color: "var(--text-main)" }}>{stats.patterns_detected || 0}</strong> Patterns</span>
          <span><strong style={{ color: "var(--text-main)" }}>{stats.duplicates_blocked || 0}</strong> Dupes Blocked</span>
          <span><strong style={{ color: "var(--text-main)" }}>{stats.correlated_cases || 0}</strong> Corr. Cases</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {activeTab === "groups" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {groups.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>No correlation groups yet.</div>
            ) : (
              groups.map((g: any, i: number) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "8px", border: "var(--glass-border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ fontWeight: 600 }} className="mono">{g.source_ip}</div>
                    <span style={{ fontSize: "0.8rem", background: "var(--accent-blue)", padding: "2px 8px", borderRadius: "12px" }}>{g.alert_count} Alerts</span>
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    <div>First seen: {formatTime(g.first_seen)}</div>
                    <div>Rules: {g.rules?.join(", ") || "None"}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "patterns" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {patterns.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>No patterns detected.</div>
            ) : (
              patterns.map((p: any, i: number) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "8px", border: "var(--glass-border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ fontWeight: 600 }}>{p.patterns.join(", ").replace(/_/g, " ")}</div>
                    <span className="mono" style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{p.source_ip}</span>
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Detected {formatTime(p.detected_at)} • Case #{p.case_id}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "timeline" && (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
            Timeline view requires more data.
          </div>
        )}
      </div>
    </div>
  );
}
