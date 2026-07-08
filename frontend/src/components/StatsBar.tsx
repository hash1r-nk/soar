"use client";

import React from "react";
import styles from "./StatsBar.module.css";
import { FiShield, FiAlertTriangle, FiActivity, FiZap, FiLink } from "react-icons/fi";

export default function StatsBar({ stats }: { stats: any }) {
  return (
    <section className={styles.statsBar}>
      <div className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "1px" }}>
          <FiAlertTriangle color="var(--accent-red)" /> Total Alerts
        </div>
        <div style={{ fontSize: "2rem", fontWeight: "bold" }}>{stats.total_alerts || 0}</div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{stats.total_alerts ? `${stats.total_alerts} received` : "No alerts received"}</div>
      </div>

      <div className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "1px" }}>
          <FiShield color="var(--accent-blue)" /> Open Cases
        </div>
        <div style={{ fontSize: "2rem", fontWeight: "bold" }}>{stats.open_cases || 0}</div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{stats.open_cases ? `${stats.acknowledged_cases || 0} acknowledged` : "All clear"}</div>
      </div>

      <div className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "1px" }}>
          <FiActivity color="var(--accent-orange)" /> High / Critical
        </div>
        <div style={{ fontSize: "2rem", fontWeight: "bold" }}>{(stats.high_severity || 0) + (stats.critical_severity || 0)}</div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{`${stats.critical_severity || 0} critical, ${stats.high_severity || 0} high`}</div>
      </div>

      <div className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "1px" }}>
          <FiZap color="var(--accent-yellow)" /> Actions Taken
        </div>
        <div style={{ fontSize: "2rem", fontWeight: "bold" }}>{stats.total_actions || 0}</div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{stats.total_actions ? `${stats.total_actions} executed` : "No actions yet"}</div>
      </div>

      <div className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "1px" }}>
          <FiLink color="var(--accent-purple)" /> Correlated Groups
        </div>
        <div style={{ fontSize: "2rem", fontWeight: "bold" }}>{stats.correlation_groups || 0}</div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{stats.patterns_detected || stats.duplicates_blocked ? `${stats.patterns_detected || 0} patterns, ${stats.duplicates_blocked || 0} dupes blocked` : "No correlations"}</div>
      </div>
    </section>
  );
}
