import { useEffect, useState, useRef, useCallback } from "react";
import * as api from "../lib/api";

export function useSOAR() {
  const [stats, setStats] = useState<any>({});
  const [alerts, setAlerts] = useState<any[]>([]);
  const [alertsTotal, setAlertsTotal] = useState(0);
  const [cases, setCases] = useState<any[]>([]);
  const [casesTotal, setCasesTotal] = useState(0);
  const [actions, setActions] = useState<any[]>([]);
  const [playbooks, setPlaybooks] = useState<any[]>([]);
  const [correlationGroups, setCorrelationGroups] = useState<any[]>([]);
  const [detectedPatterns, setDetectedPatterns] = useState<any[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [toasts, setToasts] = useState<any[]>([]);

  // Pagination / Filter states
  const [alertState, setAlertState] = useState({ page: 0, limit: 10, query: "", severity: "" });
  const [caseState, setCaseState] = useState({ page: 0, limit: 10, query: "", status: "" });

  const ws = useRef<WebSocket | null>(null);

  const addToast = useCallback((title: string, message: string, icon = "ℹ️") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, title, message, icon }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      const data = await api.fetchAlerts(alertState.page, alertState.limit, alertState.query, alertState.severity);
      setAlerts(data.items);
      setAlertsTotal(data.total);
    } catch (e) {
      console.error(e);
    }
  }, [alertState]);

  const loadCases = useCallback(async () => {
    try {
      const data = await api.fetchCases(caseState.page, caseState.limit, caseState.query, caseState.status);
      setCases(data.items);
      setCasesTotal(data.total);
    } catch (e) {
      console.error(e);
    }
  }, [caseState]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const loadInitialData = useCallback(async () => {
    try {
      const [statsData, actionsData, playbooksData, groupsData, patternsData] = await Promise.all([
        api.fetchStats(),
        api.fetchActions(),
        api.fetchPlaybooks(),
        api.fetchCorrelationGroups(),
        api.fetchCorrelationPatterns(),
      ]);
      setStats(statsData);
      setActions(actionsData);
      setPlaybooks(playbooksData);
      setCorrelationGroups(groupsData);
      setDetectedPatterns(patternsData);
    } catch (e) {
      console.error("Failed to load initial data", e);
      addToast("Error", "Could not connect to backend", "❌");
    }
  }, [addToast]);

  const connectWebSocket = useCallback(() => {
    ws.current = new WebSocket(api.WS_BASE);

    ws.current.onopen = () => {
      setWsConnected(true);
      console.log("WebSocket connected");
    };

    ws.current.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "new_alert":
          loadAlerts(); // simplistic reload for now
          addToast("New Alert", `${msg.data.rule_name} - ${msg.data.severity}`, "🚨");
          break;
        case "new_case":
          loadCases();
          break;
        case "case_update":
          setCases((prev) => prev.map((c) => (c.id === msg.data.id ? msg.data : c)));
          break;
        case "new_action":
          setActions((prev) => [msg.data, ...prev]);
          addToast("Action Executed", msg.data.result, msg.data.action_type.includes("block") ? "🚫" : "📧");
          break;
        case "stats_update":
          setStats(msg.data);
          break;
        case "correlation_update":
          api.fetchCorrelationGroups().then(setCorrelationGroups);
          break;
        case "pattern_detected":
          setDetectedPatterns((prev) => [msg.data, ...prev]);
          addToast("Pattern Detected", `From ${msg.data.source_ip}`, "🧠");
          break;
      }
    };

    ws.current.onclose = () => {
      setWsConnected(false);
      setTimeout(connectWebSocket, 3000);
    };

    ws.current.onerror = () => {
      if (ws.current) ws.current.close();
    };
  }, [addToast, loadAlerts, loadCases]);

  useEffect(() => {
    loadInitialData();
    connectWebSocket();
    return () => {
      if (ws.current) ws.current.close();
    };
  }, [loadInitialData, connectWebSocket]);

  return {
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
    loadCases,
  };
}
