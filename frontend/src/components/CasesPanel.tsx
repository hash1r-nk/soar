"use client";

import React, { useState } from "react";
import { FiFolder, FiCheck, FiX, FiShieldOff } from "react-icons/fi";
import { acknowledgeCase, closeCase } from "../lib/api";

export default function CasesPanel({ cases, total, state, setState, loadCases, openPlaybook }: any) {
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (searchTimeout) clearTimeout(searchTimeout);
    const val = e.target.value;
    setSearchTimeout(setTimeout(() => {
      setState({ ...state, query: val, page: 0 });
    }, 300));
  };

  const handleAcknowledge = async (id: number) => {
    try {
      await acknowledgeCase(id);
      loadCases();
    } catch (e) {
      console.error(e);
    }
  };

  const handleClose = async (id: number) => {
    try {
      await closeCase(id);
      loadCases();
    } catch (e) {
      console.error(e);
    }
  };

  const totalPages = Math.ceil(total / state.limit) || 1;

  return (
    <div className="glass-panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "16px", borderBottom: "var(--glass-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "1.1rem" }}>
          <FiFolder color="var(--accent-blue)" /> Cases
        </h3>
        <span style={{ background: "rgba(255,255,255,0.1)", padding: "2px 8px", borderRadius: "12px", fontSize: "0.8rem" }}>{total}</span>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", gap: "12px", borderBottom: "var(--glass-border)" }}>
        <input 
          type="text" 
          placeholder="Search cases..." 
          className="input-base" 
          style={{ flex: 1 }} 
          onChange={handleSearch}
        />
        <select 
          className="input-base" 
          value={state.status} 
          onChange={(e) => setState({ ...state, status: e.target.value, page: 0 })}
        >
          <option value="">All Statuses</option>
          <option value="Open">Open</option>
          <option value="Acknowledged">Acknowledged</option>
          <option value="Closed">Closed</option>
        </select>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {cases.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
            No cases found.
          </div>
        ) : (
          cases.map((c: any) => {
            const isClosed = c.status === "Closed";
            const isAcked = c.status === "Acknowledged";

            return (
              <div 
                key={c.id} 
                style={{ 
                  background: "rgba(255,255,255,0.02)", 
                  border: "var(--glass-border)", 
                  borderRadius: "8px", 
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "1.05rem", marginBottom: "4px" }}>{c.title}</div>
                    <div className="mono" style={{ color: "var(--text-muted)" }}>Case #{c.id} • {c.type === 'correlated' ? '🔗 Correlated' : `Alert ${c.alert_id || 'N/A'}`}</div>
                  </div>
                </div>
                
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <span className={`badge badge-${c.severity.toLowerCase()}`}>{c.severity}</span>
                  <span className={`badge badge-${c.status.toLowerCase()}`}>{c.status}</span>
                  {c.source_ip && <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginLeft: "8px" }}>📤 <span className="mono">{c.source_ip}</span></span>}
                  {c.dest_ip && <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>📥 <span className="mono">{c.dest_ip}</span></span>}
                </div>

                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                  {!isAcked && !isClosed && (
                    <button className="btn" style={{ background: "rgba(168, 85, 247, 0.15)", color: "#D8B4FE", border: "1px solid rgba(168,85,247,0.3)" }} onClick={() => handleAcknowledge(c.id)}>
                      <FiCheck /> Acknowledge
                    </button>
                  )}
                  {!isClosed && (
                    <button className="btn btn-danger" onClick={() => handleClose(c.id)}>
                      <FiX /> Close
                    </button>
                  )}
                  {!isClosed && c.source_ip && (
                    <button className="btn btn-success" onClick={() => openPlaybook(c.id, c.source_ip)}>
                      <FiShieldOff /> Take Action
                    </button>
                  )}
                </div>
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
