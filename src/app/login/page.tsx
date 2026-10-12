import { Activity } from "lucide-react";
import { discordConfigured } from "@/lib/session";
export const dynamic = "force-dynamic";
export default function LoginPage() {
  const ready = discordConfigured();
  return <div className="login-wrap"><div className="login-card"><span className="brand-mark"><Activity size={23}/></span><h1>ยินดีต้อนรับสู่ totalwork</h1><p>เข้าสู่ระบบด้วย Discord เพื่อดูงานและอัปเดตของทีม</p>{ready ? <a className="discord-button" href="/api/auth/discord">เข้าสู่ระบบด้วย Discord</a> : <button className="discord-button" type="button" disabled>รอการเชื่อมต่อ Discord</button>}<small>{ready ? "ใช้บัญชี Discord ที่อยู่ในรายชื่อ Members" : "รอ Application ID, Client Secret และ AUTH_SECRET"}</small></div></div>;
}
