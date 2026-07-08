"use client";

import React, { useState } from "react";
import { useSOAR } from "../hooks/useSOAR";
import StatsBar from "../components/StatsBar";
import DashboardCharts from "../components/DashboardCharts";
import AlertsPanel from "../components/AlertsPanel";
import CasesPanel from "../components/CasesPanel";
import CorrelationEngine from "../components/CorrelationEngine";
import PlaybookEngine from "../components/PlaybookEngine";
import { FiShield } from "react-icons/fi";

export default function Home() {
  const {
    stats,
    alerts,
    alertsTotal,
    cases,
    casesTotal,
    actions,
    playbooks,
    correlationGroups,
    detectedPatterns,
    wsConnected,
    toasts,
    alertState,
    setAlertState,
    caseState,
    setCaseState,
    loadAlerts,
    loadCases
  } = useSOAR();

  const [playbookIntent, setPlaybookIntent] = useState<{ caseId: number, target: string } | null>(null);

  const openPlaybook = (caseId: number, target: string) => {
    setPlaybookIntent({ caseId, target });
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  return (
    <div className="dashboard-container">
      {/* Toasts */}
      <div style={{ position: "fixed", top: "24px", right: "24px", zIndex: 9999, display: "flex", flexDirection: "column", gap: "12px" }}>
        {toasts.map(t => (
          <div key={t.id} className="glass-panel" style={{ padding: "16px", display: "flex", gap: "12px", alignItems: "center", minWidth: "300px", animation: "slideIn 0.3s ease-out" }}>
            <span style={{ fontSize: "1.5rem" }}>{t.icon}</span>
            <div>
              <div style={{ fontWeight: 600 }}>{t.title}</div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.message}</div>
            </div>
          </div>
        ))}
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}} />

      {/* Header */}
      <header className="header">
        <div style={{ display: "flex", alignItems: "center" }}>
          <div className="header-logo"><FiShield color="var(--accent-blue)" size={32} /></div>
          <div>
            <div className="header-title">SOAR Command Center</div>
            <div className="header-subtitle">Security Orchestration, Automation & Response</div>
          </div>
        </div>
        <div className="status-indicator">
          <span className={`status-dot ${wsConnected ? 'connected' : 'disconnected'}`}></span>
          {wsConnected ? 'Live' : 'Disconnected'}
        </div>
      </header>

      {/* Main Grid */}
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <StatsBar stats={stats} />
        
        <DashboardCharts stats={stats} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px" }}>
          <CorrelationEngine 
            groups={correlationGroups} 
            patterns={detectedPatterns} 
            stats={stats} 
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "24px", height: "600px" }}>
          <AlertsPanel 
            alerts={alerts} 
            total={alertsTotal} 
            state={alertState} 
            setState={setAlertState} 
            loadAlerts={loadAlerts} 
          />
          <CasesPanel 
            cases={cases} 
            total={casesTotal} 
            state={caseState} 
            setState={setCaseState} 
            loadCases={loadCases} 
            openPlaybook={openPlaybook}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px" }}>
          <PlaybookEngine 
            playbooks={playbooks} 
            actions={actions}
            initialCaseId={playbookIntent?.caseId}
            initialTarget={playbookIntent?.target}
            clearPlaybookIntent={() => setPlaybookIntent(null)}
          />
        </div>
      </div>
    </div>
  );
}
