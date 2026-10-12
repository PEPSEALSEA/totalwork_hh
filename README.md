# totalwork HH

แอปติดตามงานของทีมสร้างด้วย Next.js โดยใช้ Cloudflare Workers เป็นตัวกลางติดต่อ Google Sheets หน้า Kanban อ่านงานจริงจาก Sheet หลัง Discord login และตรวจสิทธิ์จากแท็บ `Members` ผู้ดูแลมอบหมายงานพร้อมขอให้ผู้รับช่วยดูเป็นพิเศษได้ การแจ้งเตือนงานใหม่อยู่ในเว็บ

เว็บนี้เปิดให้เฉพาะ Discord ID ของสมาชิกที่มี `active=TRUE` ในแท็บ `Members` เท่านั้น ทุกหน้าพื้นที่ทำงานบังคับเข้าสู่ระบบและตรวจรายชื่อใน Sheet อีกครั้ง ผู้ที่ไม่อยู่ในรายชื่อจะเข้าสู่เว็บไม่ได้ แม้มีลิงก์ตรง

## เริ่มใช้งานในเครื่อง

```bash
npm install
npm run dev
```

เปิด `http://localhost:3000` ไฟล์ `.env.local` และ `.dev.vars` ในเครื่องนี้มีค่าเชื่อมต่อแล้ว ต้องเพิ่ม `http://localhost:3000/api/auth/callback/discord` เป็น Redirect URL ใน Discord Developer Portal ก่อนทดสอบการ login จริง

## หน้าในโครงแอป

- `/` ภาพรวมงาน ปัญหา และอัปเดตล่าสุด
- `/tasks` Kanban งานและผู้รับผิดชอบ
- `/notifications` งานใหม่และคำขอให้ช่วยดูของผู้ใช้ที่ล็อกอิน
- `/issues` ปัญหาและสถานะ
- `/updates` วันนี้ทำอะไร และพรุ่งนี้ทำอะไร
- `/team` สมาชิกและบทบาท
- `/login` จุดเริ่ม Discord OAuth
- `/setup` ขั้นตอนเชื่อมระบบ

## โครงข้อมูล Google Sheets ที่เตรียมไว้

Spreadsheet ID `1AjOYO0EwPoUUOgUKjo47Dv0ZDuXccspJfYZtDDZdzP0` ถูกตั้งค่าแท็บและคอลัมน์ต่อไปนี้แล้ว แถวแรกเป็น header เสมอ เก็บ `discord_user_id` เป็นข้อความเพื่อไม่ให้เลข ID ถูกปัดค่า

| แท็บ | คอลัมน์ |
| --- | --- |
| `Members` | `discord_user_id`, `display_name`, `role`, `active`, `joined_at`, `team_role` |
| `Tasks` | `id`, `title`, `description`, `assignee_discord_id`, `status`, `due_date`, `updated_at`, `review_requested`, `created_by_discord_id`, `created_at` |
| `Issues` | `id`, `title`, `description`, `reporter_discord_id`, `owner_discord_id`, `priority`, `status`, `created_at`, `updated_at` |
| `Updates` | `id`, `author_discord_id`, `work_date`, `today`, `blockers`, `tomorrow`, `created_at` |
| `Announcements` | `id`, `title`, `body`, `author_discord_id`, `published_at`, `audience` |
| `Notifications` | `id`, `recipient_discord_id`, `task_id`, `type`, `title`, `body`, `created_at`, `read_at` |

ค่า role: `admin` และ `lead` มอบหมายงานและเปลี่ยนสถานะงานทุกคนได้, `member` เปลี่ยนสถานะงานที่มอบหมายให้ตนเองได้, `viewer` อ่านอย่างเดียว เพิ่มสมาชิก 8 คนตามรายการที่ให้มาแล้ว โดยเป๊ปเป็น `admin` และคนอื่นเป็น `member` ส่วน `team_role` เก็บหน้าที่ เช่น website design หรือ game design

## ก่อนเปิดใช้จริง

1. ใน Discord Developer Portal เพิ่ม OAuth2 redirect URI `http://localhost:3000/api/auth/callback/discord` และ `https://totalwork-hh.sealseapep.workers.dev/api/auth/callback/discord` เพื่อให้ล็อกอินทั้งในเครื่องและเว็บจริงได้
2. หมุนเวียน Discord Client Secret และ Bot Token ที่เคยส่งผ่านแชต แล้วอัปเดต `.env.local`, `.dev.vars` และ Cloudflare Worker secrets ให้ตรงกัน ระบบแจ้งเตือนในเว็บยังไม่ใช้ Bot Token
3. Cloudflare Worker มี env ทั้ง 7 ตัวจาก `.env.local` เป็น `secret_text` แล้ว เมื่อต้องอัปเดตค่าบน Worker ให้ใช้ `wrangler secret` หรือ deploy พร้อม `--secrets-file .env.local` โดยอย่า commit ไฟล์ env

ไฟล์ `.env.local` และ `.dev.vars` ถูก ignore โดย Git ทั้งสองไฟล์มี private key ของ service account และค่า Discord แล้ว อย่าส่ง private key หรือ token ในแชตหรือ commit

## Cloudflare

GitHub Pages รองรับเฉพาะเว็บ static จึงรัน Discord OAuth, session cookie และ API ของโปรเจกต์นี้โดยตรงไม่ได้ เว็บจริงเผยแพร่ผ่าน Cloudflare Workers เพื่อรักษาการตรวจสิทธิ์สมาชิกทั้ง 8 คน GitHub ใช้เก็บ source code โดย `.gitignore` ป้องกันไฟล์ env, private key และผล build ไม่ให้ถูก commit

เว็บจริงอยู่ที่ [totalwork-hh.sealseapep.workers.dev](https://totalwork-hh.sealseapep.workers.dev) และตรวจแล้วว่าหน้า login ตอบกลับได้ หน้าพื้นที่ทำงานส่งผู้ที่ยังไม่ล็อกอินไป `/login` ส่วน API แจ้งเตือนตอบ 401 การล็อกอิน Discord จริงต้องเพิ่ม redirect URI ข้างต้นใน Discord Developer Portal ก่อน

`npm run dev:vinext` และ `npm run build:vinext` ใช้ vinext ตาม [คู่มือ Cloudflare สำหรับ Next.js](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) การอัปเดตเว็บทำจากเครื่องที่ล็อกอิน Wrangler แล้ว: build ด้วย Node.js 22.18 ขึ้นไป แล้วรัน `npm run deploy:wrangler` GitHub ไม่ได้ deploy เว็บนี้

Cloudflare config รุ่นที่ติดตั้งต้องใช้ Node.js **22.18 ขึ้นไป** เครื่องนี้มี Node 22.16 จึงใช้ Node 22.18 ชั่วคราวเพื่อตรวจ build ของ Worker แล้วผ่าน

Discord OAuth ใช้ route handler ที่รองรับ Worker และ signed session cookie ฝั่ง server ทุกครั้งที่สร้างหรือเปลี่ยนสถานะงานจะอ่าน role จาก `Members` อีกครั้ง การแจ้งเตือนในเว็บอ่านจาก `Notifications` และผู้รับทำเครื่องหมายว่าอ่านแล้วได้

ผล `npm audit` ของแพ็กเกจที่ติดตั้งขณะ setup พบ 10 รายการ (สูง 6, ปานกลาง 4) ทั้งหมดมาจาก dependency chain ของ vinext; ควรตรวจและอัปเดตก่อน deploy ระบบจริง

## ที่มาธีม

เลย์เอาต์ dashboard ที่มี sidebar, แถวสรุป และตารางงานอิงแนวทางของ [shadcn/ui dashboard blocks](https://ui.shadcn.com/blocks) ซึ่งเป็น [MIT licensed](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md) โค้ดหน้าตัวอย่างในโปรเจกต์นี้เขียนให้ตรงงาน HH และใช้สี/เนื้อหาเฉพาะโปรเจกต์

## ตรวจโครงสร้าง

```bash
npm run typecheck
npm run build
npm run build:vinext
npx wrangler deploy --config wrangler.jsonc --dry-run
```
