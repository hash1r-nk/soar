"use client";

import React, { useState } from "react";
import { FiRadio, FiChevronDown, FiChevronUp } from "react-icons/fi";
import { formatTime } from "../lib/utils";

export default function AlertsPanel({ alerts, total, state, setState, loadAlerts }: any) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (searchTimeout) clearTimeout(searchTimeout);
    const val = e.target.value;
    setSearchTimeout(setTimeout(() => {
      setState({ ...state, query: val, page: 0 });
    }, 300));
  };

  const totalPages = Math.ceil(total / state.limit) || 1;

  return (
    <div className="glass-panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "16px", borderBottom: "var(--glass-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "1.1rem" }}>
          <FiRadio color="var(--accent-red)" /> Alerts Feed
        </h3>
        <span style={{ background: "rgba(255,255,255,0.1)", padding: "2px 8px", borderRadius: "12px", fontSize: "0.8rem" }}>{total}</span>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", gap: "12px", borderBottom: "var(--glass-border)" }}>
        <input 
          type="text" 
          placeholder="Search alerts..." 
          className="input-base" 
          style={{ flex: 1 }} 
          onChange={handleSearch}
        />
        <select 
          className="input-base" 
          value={state.severity} 
          onChange={(e) => setState({ ...state, severity: e.target.value, page: 0 })}
        >
          <option value="">All Severities</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {alerts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
            No alerts found.
          </div>
        ) : (
          alerts.map((a: any) => {
            const isExpanded = expandedId === a.id;
            return (
              <div 
                key={a.id} 
                style={{ 
                  background: "rgba(255,255,255,0.02)", 
                  border: "var(--glass-border)", 
                  borderRadius: "8px", 
                  padding: "12px", 
                  cursor: "pointer",
                  transition: "background 0.2s"
                }}
                onClick={() => setExpandedId(isExpanded ? null : a.id)}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                  <div style={{ fontWeight: 500 }}>{a.rule_name}</div>
                  <span className={`badge badge-${a.severity.toLowerCase()}`}>{a.severity}</span>
                </div>
                
                <div style={{ display: "flex", gap: "12px", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "8px" }}>
                  <span className="mono">ID: {a.id}</span>
                  {a.source_ip && <span>📤 <span className="mono">{a.source_ip}</span></span>}
                  <span>🕐 {formatTime(a.received_at)}</span>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "var(--glass-border)", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div><strong style={{ color: "var(--text-muted)" }}>Description:</strong> {a.description || "N/A"}</div>
                    {a.event_id && <div><strong style={{ color: "var(--text-muted)" }}>Event ID:</strong> <span className="mono">{a.event_id}</span></div>}
                    {a.search_name && <div><strong style={{ color: "var(--text-muted)" }}>Search Name:</strong> {a.search_name}</div>}
                    <div><strong style={{ color: "var(--text-muted)" }}>Status:</strong> {a.status}</div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div style={{ padding: "12px 16px", borderTop: "var(--glass-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button 
          className="btn" 
          style={{ background: "rgba(255,255,255,0.1)" }}
          disabled={state.page === 0} 
          onClick={() => setState({ ...state, page: state.page - 1 })}
        >
          Prev
        </button>
        <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Page {state.page + 1} of {totalPages}</span>
        <button 
          className="btn" 
          style={{ background: "rgba(255,255,255,0.1)" }}
          disabled={state.page >= totalPages - 1} 
          onClick={() => setState({ ...state, page: state.page + 1 })}
        >
          Next
        </button>
      </div>
    </div>
  );
}
