export function Status({ value }: { value: string }) {
  const kind = value === "กำลังทำ" || value === "กำลังตรวจสอบ" ? "progress" : value === "รอข้อมูล" || value === "รอแก้ไข" ? "waiting" : "next";
  return <span className={`status ${kind}`}><span />{value}</span>;
}

export function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  return <div className="section-heading"><h2>{title}</h2>{detail && <span>{detail}</span>}</div>;
}
