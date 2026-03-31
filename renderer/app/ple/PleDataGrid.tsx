"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   PLE DataGrid — Bewerkbare tabel component voor PLE4Win-style data editing
   
   Features:
   - Inline cell editing (dubbelklik of Enter)
   - Type-aware editing (text, number, select)
   - Validatie met min/max/required
   - Rij toevoegen/verwijderen
   - Tab navigatie tussen cellen
   - PLE4Win 3-rij header (naam, eenheid)
   - Compact donker thema passend bij PLE Calculator UI
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PleColumnDef {
  key: string;
  label: string;
  unit?: string;
  type: "text" | "number" | "select" | "boolean";
  options?: string[];
  datalist?: string[];   // autocomplete suggesties (vrije invoer blijft mogelijk)
  min?: number;
  max?: number;
  required?: boolean;
  readOnly?: boolean;
  width?: number;
  decimals?: number;
}

export interface PleDataGridProps {
  columns: PleColumnDef[];
  data: Record<string, any>[];
  onChange: (newData: Record<string, any>[]) => void;
  title: string;
  subtitle?: string;
  canAddRows?: boolean;
  canDeleteRows?: boolean;
  newRowTemplate?: Record<string, any>;
  maxHeight?: number;
  compact?: boolean;
}

const F = "'JetBrains Mono','Fira Code','Courier New',monospace";

export default function PleDataGrid({
  columns, data, onChange, title, subtitle,
  canAddRows = true, canDeleteRows = true,
  newRowTemplate, maxHeight = 500, compact = false,
}: PleDataGridProps) {
  const [editCell, setEditCell] = useState<{ row: number; col: string } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedRow, setSelectedRow] = useState<number>(-1);

  useEffect(() => {
    if (editCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editCell]);

  const startEdit = useCallback((row: number, colKey: string) => {
    const col = columns.find(c => c.key === colKey);
    if (col?.readOnly) return;
    setEditCell({ row, col: colKey });
    const val = data[row]?.[colKey];
    setEditValue(val != null ? String(val) : "");
  }, [columns, data]);

  const commitEdit = useCallback(() => {
    if (!editCell) return;
    const col = columns.find(c => c.key === editCell.col);
    if (!col) return;

    let newVal: any = editValue;
    if (col.type === "number") {
      const parsed = parseFloat(editValue.replace(",", "."));
      if (!isNaN(parsed)) {
        if (col.min != null && parsed < col.min) newVal = col.min;
        else if (col.max != null && parsed > col.max) newVal = col.max;
        else newVal = parsed;
      } else {
        newVal = data[editCell.row]?.[editCell.col]; // revert
      }
    } else if (col.type === "boolean") {
      newVal = editValue === "true" || editValue === "1" || editValue === "yes";
    }

    const newData = [...data];
    newData[editCell.row] = { ...newData[editCell.row], [editCell.col]: newVal };
    onChange(newData);
    setEditCell(null);
  }, [editCell, editValue, columns, data, onChange]);

  const cancelEdit = useCallback(() => {
    setEditCell(null);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!editCell) return;
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      commitEdit();
      // Tab naar volgende cel
      if (e.key === "Tab") {
        const colIdx = columns.findIndex(c => c.key === editCell.col);
        const editableCols = columns.filter(c => !c.readOnly);
        const nextEditableIdx = editableCols.findIndex(c => c.key === editCell.col);
        if (e.shiftKey) {
          // Vorige cel
          if (nextEditableIdx > 0) {
            startEdit(editCell.row, editableCols[nextEditableIdx - 1].key);
          } else if (editCell.row > 0) {
            startEdit(editCell.row - 1, editableCols[editableCols.length - 1].key);
          }
        } else {
          // Volgende cel
          if (nextEditableIdx < editableCols.length - 1) {
            startEdit(editCell.row, editableCols[nextEditableIdx + 1].key);
          } else if (editCell.row < data.length - 1) {
            startEdit(editCell.row + 1, editableCols[0].key);
          }
        }
      }
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  }, [editCell, commitEdit, cancelEdit, startEdit, columns, data.length]);

  const addRow = useCallback(() => {
    const template = newRowTemplate || {};
    const newRow: Record<string, any> = {};
    columns.forEach(c => {
      newRow[c.key] = template[c.key] ?? (c.type === "number" ? 0 : "");
    });
    onChange([...data, newRow]);
  }, [columns, data, newRowTemplate, onChange]);

  const deleteRow = useCallback((idx: number) => {
    if (data.length <= 1) return;
    const newData = data.filter((_, i) => i !== idx);
    onChange(newData);
    setSelectedRow(-1);
  }, [data, onChange]);

  const moveRow = useCallback((idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= data.length) return;
    const newData = [...data];
    [newData[idx], newData[newIdx]] = [newData[newIdx], newData[idx]];
    onChange(newData);
    setSelectedRow(newIdx);
  }, [data, onChange]);

  const sz = compact ? 9 : 10;
  const pad = compact ? "2px 4px" : "3px 6px";
  const rowH = compact ? 22 : 26;

  const formatCell = (val: any, col: PleColumnDef): string => {
    if (val == null || val === "") return "—";
    if (col.type === "number" && typeof val === "number") {
      return col.decimals != null ? val.toFixed(col.decimals) : String(val);
    }
    if (col.type === "boolean") return val ? "✓" : "—";
    return String(val);
  };

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", fontFamily: F }}>{title}</span>
          {subtitle && <span style={{ fontSize: 10, color: "#64748b", marginLeft: 8 }}>{subtitle}</span>}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {canAddRows && (
            <button onClick={addRow} style={{
              padding: "2px 8px", fontSize: 9, fontFamily: F,
              background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: 4, color: "#22c55e", cursor: "pointer",
            }}>+ Rij</button>
          )}
          {canDeleteRows && selectedRow >= 0 && (
            <button onClick={() => deleteRow(selectedRow)} style={{
              padding: "2px 8px", fontSize: 9, fontFamily: F,
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 4, color: "#ef4444", cursor: "pointer",
            }}>- Rij</button>
          )}
          {selectedRow >= 0 && (
            <>
              <button onClick={() => moveRow(selectedRow, -1)} disabled={selectedRow <= 0} style={{
                padding: "2px 6px", fontSize: 9, fontFamily: F,
                background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)",
                borderRadius: 4, color: selectedRow > 0 ? "#3b82f6" : "#334155", cursor: selectedRow > 0 ? "pointer" : "default",
              }}>↑</button>
              <button onClick={() => moveRow(selectedRow, 1)} disabled={selectedRow >= data.length - 1} style={{
                padding: "2px 6px", fontSize: 9, fontFamily: F,
                background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)",
                borderRadius: 4, color: selectedRow < data.length - 1 ? "#3b82f6" : "#334155", cursor: selectedRow < data.length - 1 ? "pointer" : "default",
              }}>↓</button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{
        maxHeight, overflowY: "auto", overflowX: "auto",
        border: "1px solid #1e293b", borderRadius: 6,
        background: "#0f172a",
      }}>
        <table style={{
          width: "100%", borderCollapse: "collapse",
          fontSize: sz, fontFamily: F,
        }}>
          {/* Column headers */}
          <thead>
            <tr style={{ position: "sticky", top: 0, zIndex: 2 }}>
              <th style={{
                padding: pad, background: "#1e293b", color: "#64748b",
                borderBottom: "1px solid #334155", textAlign: "center",
                width: 28, fontSize: 8,
              }}>#</th>
              {columns.map(col => (
                <th key={col.key} style={{
                  padding: pad, background: "#1e293b", color: "#94a3b8",
                  borderBottom: "1px solid #334155", textAlign: "left",
                  whiteSpace: "nowrap", fontWeight: 600,
                  width: col.width || "auto",
                  minWidth: col.width || 60,
                }}>
                  {col.label}
                  {col.unit && (
                    <span style={{ color: "#475569", fontWeight: 400, fontSize: sz - 1, marginLeft: 3 }}>
                      ({col.unit})
                    </span>
                  )}
                  {col.readOnly && <span style={{ color: "#334155", marginLeft: 2 }}>🔒</span>}
                </th>
              ))}
            </tr>
          </thead>

          {/* Data rows */}
          <tbody>
            {data.map((row, ri) => (
              <tr
                key={ri}
                onClick={() => setSelectedRow(ri)}
                style={{
                  background: selectedRow === ri ? "rgba(59,130,246,0.08)" : ri % 2 === 0 ? "transparent" : "rgba(30,41,59,0.3)",
                  cursor: "pointer",
                }}
              >
                <td style={{
                  padding: pad, color: "#475569", textAlign: "center",
                  borderBottom: "1px solid #1a2332", fontSize: 8,
                  borderRight: "1px solid #1a2332",
                }}>{ri + 1}</td>
                {columns.map(col => {
                  const isEditing = editCell?.row === ri && editCell?.col === col.key;
                  const val = row[col.key];
                  const isInvalid = col.required && (val == null || val === "");

                  return (
                    <td
                      key={col.key}
                      onDoubleClick={() => startEdit(ri, col.key)}
                      style={{
                        padding: isEditing ? 0 : pad,
                        borderBottom: "1px solid #1a2332",
                        borderRight: "1px solid #0f1729",
                        color: col.readOnly ? "#475569" : isInvalid ? "#ef4444" : col.type === "number" ? "#e2e8f0" : "#94a3b8",
                        textAlign: col.type === "number" ? "right" : "left",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: col.width || 200,
                        background: isEditing ? "rgba(59,130,246,0.15)" : "transparent",
                      }}
                    >
                      {isEditing ? (
                        col.type === "select" ? (
                          <select
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={handleKeyDown}
                            ref={inputRef as any}
                            autoFocus
                            style={{
                              width: "100%", padding: pad,
                              background: "#1e293b", color: "#e2e8f0",
                              border: "1px solid #3b82f6", borderRadius: 0,
                              fontSize: sz, fontFamily: F, outline: "none",
                            }}
                          >
                            {(col.options || []).map(o => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        ) : (
                          <>
                            {col.datalist && (
                              <datalist id={`dl-${col.key}`}>
                                {col.datalist.map(o => <option key={o} value={o} />)}
                              </datalist>
                            )}
                            <input
                              ref={inputRef}
                              type={col.type === "number" ? "text" : "text"}
                              list={col.datalist ? `dl-${col.key}` : undefined}
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={commitEdit}
                              onKeyDown={handleKeyDown}
                              style={{
                                width: "100%", padding: pad,
                                background: "#1e293b", color: "#e2e8f0",
                                border: "1px solid #3b82f6", borderRadius: 0,
                                fontSize: sz, fontFamily: F, outline: "none",
                                textAlign: col.type === "number" ? "right" : "left",
                                boxSizing: "border-box",
                              }}
                            />
                          </>
                        )
                      ) : (
                        formatCell(val, col)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {data.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: "#475569", fontSize: 11 }}>
            Geen data. Klik "+ Rij" om een rij toe te voegen.
          </div>
        )}
      </div>

      {/* Footer info */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 8, color: "#475569", fontFamily: F }}>
        <span>{data.length} rij{data.length !== 1 ? "en" : ""}</span>
        <span>Dubbelklik om te bewerken · Tab = volgende cel · Esc = annuleren</span>
      </div>
    </div>
  );
}
