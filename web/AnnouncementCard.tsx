import { useState, type FormEvent } from "react";
import { api } from "./api";
import { MarkdownText } from "./MarkdownText";

export type Announcement = { id: string; title: string; body: string; authorDiscordId: string; publishedAt: string; meetingTopic: string; note: string; hasRawText: boolean };
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
  const mine = announcement.authorDiscordId === currentUserId;

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true); setError("");
    try {
      const { comment } = await api<{ comment: AnnouncementComment }>(`/api/announcements/${encodeURIComponent(announcement.id)}/comments`, { method: "POST", body: JSON.stringify({ body }) });
      onCommentAdded(comment);
      setDraft("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ส่งไม่สำเร็จ"); }
    finally { setSaving(false); }
  }

  async function deleteComment(comment: AnnouncementComment) {
    if (!window.confirm("ลบความเห็นนี้?")) return;
    setSaving(true); setError("");
    try {
      await api(`/api/announcements/${encodeURIComponent(announcement.id)}/comments/${encodeURIComponent(comment.id)}`, { method: "DELETE" });
      onCommentDeleted(comment.id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ลบไม่สำเร็จ"); }
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
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ดาวน์โหลดไม่สำเร็จ"); }
    finally { setDownloading(false); }
  }

  return <article className="entry">
    <div className="entry-head">
      <strong>{announcement.title}</strong>
      <div className="tools">
        {announcement.hasRawText && <button type="button" className="link" disabled={downloading} onClick={() => void downloadRawText()}>ไฟล์ดิบ</button>}
        {mine && <button type="button" className="link" onClick={() => onEditAnnouncement(announcement)}>แก้ไข</button>}
        {mine && <button type="button" className="link danger" onClick={() => void onDeleteAnnouncement(announcement)}>ลบ</button>}
      </div>
    </div>
    <small>{name(announcement.authorDiscordId)} · {dateTime(announcement.publishedAt)}{announcement.meetingTopic ? ` · ${announcement.meetingTopic}` : ""}</small>
    <MarkdownText text={announcement.body}/>
    {announcement.note && <div className="note"><MarkdownText text={announcement.note}/></div>}
    <section className="comments" aria-label="ความเห็น">
      {comments.map((comment) => <div className="comment" key={comment.id}>
        <div className="comment-top"><strong>{comment.authorName || name(comment.authorDiscordId)}</strong><time dateTime={comment.createdAt}>{dateTime(comment.createdAt)}</time>{(comment.authorDiscordId === currentUserId || isAdmin) && <button type="button" className="link danger" disabled={saving} onClick={() => void deleteComment(comment)}>ลบ</button>}</div>
        <MarkdownText text={comment.body}/>
      </div>)}
      {canComment && <form className="comment-form" onSubmit={submitComment}><label className="sr-only" htmlFor={`comment-${announcement.id}`}>ความเห็น</label><textarea id={`comment-${announcement.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={2} placeholder="ความเห็น"/><button type="submit" className="btn" disabled={saving || !draft.trim()}>ส่ง</button></form>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  </article>;
}
