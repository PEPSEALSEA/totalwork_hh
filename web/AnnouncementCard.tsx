import { useState, type FormEvent } from "react";
import { FileDown, Pencil, Send, Trash2 } from "lucide-react";
import { api } from "./api";
import { MarkdownText } from "./MarkdownText";

export type Announcement = { id: string; title: string; body: string; authorDiscordId: string; publishedAt: string; meetingTopic: string; hasRawText: boolean };
export type AnnouncementComment = { id: string; announcementId: string; authorDiscordId: string; authorName: string; body: string; createdAt: string };

type Props = {
  announcement: Announcement;
  comments: AnnouncementComment[];
  currentUserId: string;
  canComment: boolean;
  isAdmin: boolean;
  name: (id: string) => string;
  onCommentAdded: (comment: AnnouncementComment) => void;
  onCommentDeleted: (id: string) => void;
  onEditAnnouncement: (announcement: Announcement) => void;
  onDeleteAnnouncement: (announcement: Announcement) => Promise<void>;
};

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export function AnnouncementCard({ announcement, comments, currentUserId, canComment, isAdmin, name, onCommentAdded, onCommentDeleted, onEditAnnouncement, onDeleteAnnouncement }: Props) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true); setError("");
    try {
      const { comment } = await api<{ comment: AnnouncementComment }>(`/api/announcements/${encodeURIComponent(announcement.id)}/comments`, { method: "POST", body: JSON.stringify({ body }) });
      onCommentAdded(comment);
      setDraft("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ส่งคอมเมนต์ไม่สำเร็จ"); }
    finally { setSaving(false); }
  }

  async function deleteComment(comment: AnnouncementComment) {
    if (!window.confirm("ลบคอมเมนต์นี้?")) return;
    setSaving(true); setError("");
    try {
      await api(`/api/announcements/${encodeURIComponent(announcement.id)}/comments/${encodeURIComponent(comment.id)}`, { method: "DELETE" });
      onCommentDeleted(comment.id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ลบคอมเมนต์ไม่สำเร็จ"); }
    finally { setSaving(false); }
  }

  async function downloadRawText() {
    setDownloading(true); setError("");
    try {
      const { rawText } = await api<{ rawText: string }>(`/api/announcements/${encodeURIComponent(announcement.id)}/raw`);
      const url = URL.createObjectURL(new Blob([rawText], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${announcement.title.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 80) || "announcement"}.txt`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ดาวน์โหลดข้อมูลดิบไม่สำเร็จ"); }
    finally { setDownloading(false); }
  }

  return <article className="announcement-card">
    <div className="announcement-heading">
      <div><h3>{announcement.title}</h3>{announcement.meetingTopic && <p className="meeting-topic">ประชุมเรื่อง: {announcement.meetingTopic}</p>}<span className="announcement-author">โดย {name(announcement.authorDiscordId)} · {dateTime(announcement.publishedAt)}</span></div>
      <div className="announcement-tools">
        {announcement.hasRawText && <button type="button" disabled={downloading} title="ดาวน์โหลดข้อมูลดิบ .txt" aria-label={`ดาวน์โหลดข้อมูลดิบของ ${announcement.title}`} onClick={() => void downloadRawText()}><FileDown size={17}/></button>}
        {announcement.authorDiscordId === currentUserId && <button type="button" title="แก้ไขประกาศ" aria-label={`แก้ไขประกาศ ${announcement.title}`} onClick={() => onEditAnnouncement(announcement)}><Pencil size={15}/></button>}
        {announcement.authorDiscordId === currentUserId && <button type="button" title="ลบประกาศ" aria-label={`ลบประกาศ ${announcement.title}`} onClick={() => void onDeleteAnnouncement(announcement)}><Trash2 size={16}/></button>}
      </div>
    </div>
    <div className="announcement-summary-label">สรุป</div>
    <MarkdownText text={announcement.body}/>
    <section className="announcement-comments" aria-label={`คอมเมนต์ของ ${announcement.title}`}>
      <h4>คอมเมนต์ <span>{comments.length}</span></h4>
      {comments.length === 0 && <p className="comment-empty">ยังไม่มีคอมเมนต์</p>}
      {comments.map((comment) => <div className="comment-row" key={comment.id}>
        <div className="comment-top"><strong>{comment.authorName || name(comment.authorDiscordId)}</strong><time dateTime={comment.createdAt}>{dateTime(comment.createdAt)}</time>{(comment.authorDiscordId === currentUserId || isAdmin) && <button type="button" disabled={saving} onClick={() => void deleteComment(comment)} aria-label={`ลบคอมเมนต์ของ ${comment.authorName || name(comment.authorDiscordId)}`}><Trash2 size={13}/></button>}</div>
        <MarkdownText text={comment.body}/>
      </div>)}
      {canComment && <form className="comment-form" onSubmit={submitComment}><label className="sr-only" htmlFor={`comment-${announcement.id}`}>เขียนคอมเมนต์สำหรับ {announcement.title}</label><textarea id={`comment-${announcement.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={2} placeholder="เขียนคอมเมนต์หรือแชร์ข้อมูลเพิ่มเติม…"/><button type="submit" disabled={saving || !draft.trim()}><Send size={14}/> ส่งคอมเมนต์</button></form>}
      {error && <p className="comment-error" role="alert">{error}</p>}
    </section>
  </article>;
}
