export const people = [
  { name: "คุณเมย์", role: "หัวหน้าทีม", initials: "ม", color: "lavender" },
  { name: "คุณนัท", role: "ออกแบบ", initials: "น", color: "peach" },
  { name: "คุณบีม", role: "พัฒนา", initials: "บ", color: "blue" },
  { name: "คุณฟ้า", role: "ตรวจสอบ", initials: "ฟ", color: "green" },
];

export const tasks = [
  { title: "สรุปความต้องการหน้าแจ้งปัญหา", owner: "คุณเมย์", status: "กำลังทำ", due: "วันนี้", area: "วางแผน" },
  { title: "ออกแบบฟอร์มและสถานะงาน", owner: "คุณนัท", status: "กำลังทำ", due: "วันนี้", area: "ออกแบบ" },
  { title: "เตรียม Discord OAuth", owner: "คุณบีม", status: "รอข้อมูล", due: "พรุ่งนี้", area: "พัฒนา" },
  { title: "ตรวจ flow แจ้งปัญหาบนมือถือ", owner: "คุณฟ้า", status: "ถัดไป", due: "พรุ่งนี้", area: "ตรวจสอบ" },
];

export const issues = [
  { id: "ISS-024", title: "สมาชิกใหม่ยังไม่เห็นงานของตัวเอง", owner: "คุณบีม", priority: "สูง", state: "กำลังตรวจสอบ" },
  { id: "ISS-023", title: "ข้อความอัปเดตยาวอ่านยากบนมือถือ", owner: "คุณนัท", priority: "ปานกลาง", state: "รอแก้ไข" },
  { id: "ISS-022", title: "ต้องระบุผู้รับผิดชอบเมื่อเปิดปัญหา", owner: "คุณเมย์", priority: "ปานกลาง", state: "วางแผน" },
];

export const updates = [
  { person: "คุณเมย์", time: "09:30", text: "วันนี้สรุปขอบเขตหน้าแจ้งปัญหาและรายการสิทธิ์ของแต่ละ role", tomorrow: "พรุ่งนี้จะตรวจโครงสร้าง Sheet กับทีม" },
  { person: "คุณนัท", time: "10:15", text: "ปรับหน้ารวมงานให้อ่านง่ายขึ้น และเตรียมรูปแบบสถานะที่ใช้ร่วมกัน", tomorrow: "พรุ่งนี้จะทำหน้ารายละเอียดงาน" },
  { person: "คุณบีม", time: "11:20", text: "ตรวจขั้นตอน Discord OAuth และแนวทางเชื่อม Sheets ผ่านฝั่ง server", tomorrow: "พรุ่งนี้จะต่อ API หลังได้ credential" },
];
