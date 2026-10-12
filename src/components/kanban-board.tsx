"use client";

import { useState } from "react";
import { CalendarDays, ChevronRight } from "lucide-react";

export type BoardTask = { id: string; title: string; description: string; owner: string; status: string; dueDate: string; canEdit?: boolean; reviewRequested?: boolean };
const columns = [
  { name: "ถัดไป", color: "slate" },
  { name: "กำลังทำ", color: "violet" },
  { name: "รอตรวจ", color: "amber" },
  { name: "เสร็จแล้ว", color: "green" },
];

export function KanbanBoard({ initialTasks, editable }: { initialTasks: BoardTask[]; editable: boolean }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  async function move(task: BoardTask, status: string) {
    const before = tasks;
    setTasks((items) => items.map((item) => item.id === task.id ? { ...item, status } : item));
    setSaving(task.id);
    setMessage("");
    try {
      const result = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      if (!result.ok) throw new Error("บันทึกสถานะไม่สำเร็จ");
    } catch { setTasks(before); setMessage("บันทึกสถานะไม่สำเร็จ โปรดลองอีกครั้ง"); }
    finally { setSaving(null); }
  }
  return <div className="kanban-wrap"><div className="board-intro"><span>งานทั้งหมด</span><ChevronRight size={14}/><strong>Kanban board</strong></div>{message && <p className="board-error" role="alert">{message}</p>}<div className="kanban-grid">{columns.map((column) => {
    const items = tasks.filter((task) => task.status === column.name);
    return <section className="kanban-column" key={column.name} onDragOver={editable ? (event) => event.preventDefault() : undefined} onDrop={editable ? (event) => { event.preventDefault(); const task = tasks.find((item) => item.id === draggedId); if (task && task.canEdit !== false && task.status !== column.name) void move(task, column.name); setDraggedId(null); } : undefined}><div className="kanban-heading"><span className={`kanban-dot ${column.color}`}/><h2>{column.name}</h2><span className="kanban-count">{items.length}</span></div><div className="kanban-items">{items.length === 0 ? <div className="kanban-empty">ยังไม่มีงานในขั้นนี้</div> : items.map((task) => <article className="kanban-card" key={task.id} draggable={editable && task.canEdit !== false} onDragStart={editable && task.canEdit !== false ? () => setDraggedId(task.id) : undefined} onDragEnd={editable ? () => setDraggedId(null) : undefined}><div className="card-top"><span>{task.id}</span>{task.reviewRequested && <span className="review-badge">ขอให้ช่วยดู</span>}</div><h3>{task.title}</h3><p>{task.description || "ไม่มีรายละเอียดเพิ่มเติม"}</p><div className="card-footer"><span className="card-owner"><span>{task.owner.slice(0, 1)}</span>{task.owner}</span>{task.dueDate && <span className="card-date"><CalendarDays size={12}/>{task.dueDate}</span>}</div>{editable && task.canEdit !== false && <label className="status-select">ย้ายไป <select value={task.status} disabled={saving === task.id} onChange={(event) => move(task, event.target.value)}>{columns.map((choice) => <option key={choice.name} value={choice.name}>{choice.name}</option>)}</select></label>}</article>)}</div></section>;
  })}</div></div>;
}
