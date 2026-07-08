"use client";

import React, { useState, useEffect } from "react";
import { FiZap, FiPlay } from "react-icons/fi";
import { runPlaybook } from "../lib/api";
import { formatTime } from "../lib/utils";

export default function PlaybookEngine({ playbooks, actions, initialCaseId, initialTarget, clearPlaybookIntent }: any) {
  const [selectedPlaybook, setSelectedPlaybook] = useState("");
  const [caseId, setCaseId] = useState("");
  const [target, setTarget] = useState("");
  const [notes, setNotes] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    if (initialCaseId) setCaseId(initialCaseId.toString());
    if (initialTarget) setTarget(initialTarget);
    if (initialCaseId || initialTarget) {
      setSelectedPlaybook("block_ip"); // default assumption if action is triggered from cases
    }
  }, [initialCaseId, initialTarget]);

  const handleRun = async () => {
    if (!selectedPlaybook || !caseId) return;
    setIsExecuting(true);
    try {
      await runPlaybook(selectedPlaybook, {
        action_type: selectedPlaybook,
        case_id: parseInt(caseId),
        target,
        notes
      });
      // Clear form on success
      setCaseId("");
      setTarget("");
      setNotes("");
      if (clearPlaybookIntent) clearPlaybookIntent();
    } catch (e) {
      console.error(e);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="glass-panel" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: "400px" }}>
      <div style={{ padding: "16px", borderBottom: "var(--glass-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "1.1rem" }}>
          <FiZap color="var(--accent-yellow)" /> Playbook Engine
        </h3>
        <span style={{ background: "rgba(255,255,255,0.1)", padding: "2px 8px", borderRadius: "12px", fontSize: "0.8rem" }}>{actions.length}</span>
      </div>

      <div style={{ padding: "16px", borderBottom: "var(--glass-border)", display: "flex", flexDirection: "column", gap: "12px", background: "rgba(0,0,0,0.2)" }}>
        <select className="input-base" value={selectedPlaybook} onChange={(e) => setSelectedPlaybook(e.target.value)}>
          <option value="">Select Playbook...</option>
          {playbooks.map((pb: any) => (
            <option key={pb.id} value={pb.id}>⚡ {pb.name}</option>
          ))}
        </select>
        
        <div style={{ display: "flex", gap: "12px" }}>
          <input 
            type="number" 
            placeholder="Case ID" 
            className="input-base" 
            style={{ width: "100px" }} 
            value={caseId} 
            onChange={(e) => setCaseId(e.target.value)} 
          />
          <input 
            type="text" 
            placeholder="Target (Optional)" 
            className="input-base" 
            style={{ flex: 1 }} 
            value={target} 
            onChange={(e) => setTarget(e.target.value)} 
          />
        </div>
        
        <input 
          type="text" 
          placeholder="Notes" 
          className="input-base" 
          value={notes} 
          onChange={(e) => setNotes(e.target.value)} 
        />
        
        <button 
          className="btn btn-primary" 
          style={{ justifyContent: "center" }}
          disabled={!selectedPlaybook || !caseId || isExecuting}
          onClick={handleRun}
        >
          {isExecuting ? "Executing..." : <><FiPlay /> Execute Playbook</>}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {actions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>No playbooks executed yet.</div>
        ) : (
          actions.map((a: any, i: number) => {
            const isBlock = a.action_type.toLowerCase().includes("block");
            return (
              <div key={i} style={{ display: "flex", gap: "12px", background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "8px", border: "var(--glass-border)" }}>
                <div style={{ fontSize: "1.5rem" }}>{isBlock ? "🚫" : "📧"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{isBlock ? "IP Blocked" : "Notification"} — Case #{a.case_id}</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "4px" }}>{a.result}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "8px" }}>{formatTime(a.executed_at)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
