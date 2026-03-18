# Repair & Claim Dashboard (Web)

**Deploy to Vercel:** See [../docs/VERCEL_DEPLOY.md](../docs/VERCEL_DEPLOY.md) for step-by-step instructions.

---

เว็บแดชบอร์ดสำหรับดูสถิติงานซ่อมและเคลม และใช้เป็นเครื่องมือต่อรองเคลมโรงงาน (factory claim negotiation) โดยดึงข้อมูลจากฐานข้อมูล Turso (libSQL)

---

## Setup / การติดตั้ง

### 1. ติดตั้ง dependencies

```bash
cd web
npm install
```

### 2. ตั้งค่า Environment

สร้างไฟล์ `.env.local` ในโฟลเดอร์ `web/` (หรือคัดลอกจาก `.env.example`):

```env
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your_token_here
NEXT_PUBLIC_APP_TITLE=Repair & Claim Dashboard
```

- **TURSO_DATABASE_URL** และ **TURSO_AUTH_TOKEN**: ใช้ค่าจาก Turso Dashboard หรือจาก pipeline ที่ sync ข้อมูลอยู่แล้ว (ดูเอกสารหลักที่ `docs/TURSO_SETUP.md`)
- **NEXT_PUBLIC_APP_TITLE**: ชื่อแอปที่แสดงบนเบราว์เซอร์ (ถ้าไม่ใส่จะใช้ค่า default)

### 3. รันโปรเจกต์

```bash
npm run dev
```

เปิดเบราว์เซอร์ที่ [http://localhost:3000](http://localhost:3000) แล้วไปที่ `/dashboard`

---

## How to Run / วิธีรัน

| คำสั่ง | ความหมาย |
|--------|----------|
| `npm run dev` | รันโหมดพัฒนา (development) ที่พอร์ต 3000 |
| `npm run build` | สร้าง build สำหรับ production |
| `npm run start` | รันเซิร์ฟเวอร์หลัง build แล้ว |
| `npm run lint` | ตรวจสอบโค้ดด้วย ESLint |

---

## หน้าแดชบอร์ดและฟีเจอร์

### Tab 1 — ภาพรวม (Overview)

- **KPI Cards**: งานทั้งหมด, งานซ่อม/เคลม, เคลมซ้ำ (และ %), ซ่อมแล้วไม่หาย, จำนวน SKU ที่มีปัญหา, อัพเดทล่าสุด
- **Top 10 รุ่น**: กราฟแท่งแนวนอนรวมงานซ่อม+เคลมต่อรุ่น
- **สัดส่วน repair / claim / reclaim**: กราฟโดนัท
- **แนวโน้มรายเดือน**: กราฟ stacked bar 18 เดือน (งานซ่อม, งานเคลม, เคลมซ้ำ)
- **อาการเสียที่พบบ่อย**: Top 15 อาการ (สีแดง = สูงกว่าค่าเฉลี่ย, เหลือง = ประมาณค่าเฉลี่ย, เขียว = ต่ำกว่า)

### Tab 2 — แยกตามรุ่น (By Model/SKU)

- ตัวกรอง: ค้นหารุ่น/SKU, ประเภทงาน (ทั้งหมด/ซ่อม/เคลม), ช่วงเวลา (3/6/12/18 เดือน หรือทั้งหมด), ระดับความเสี่ยง (สูงมาก/กลาง/ต่ำ)
- ตาราง: SKU, Model, งานซ่อม, งานเคลม, รวม, เคลมซ้ำ, ซ่อมไม่หาย, อาการหลัก, เดือนที่มีปัญหามากสุด, ความเสี่ยง, ปุ่ม Export PDF ต่อแถว

**ระดับความเสี่ยง (Risk level)**  
- **สูงมาก**: เคลมซ้ำ ≥ 3 หรือ ซ่อมไม่หาย ≥ 2 หรือ สัดส่วนเคลม > 60%  
- **กลาง**: เคลมซ้ำ ≥ 1 หรือ สัดส่วนเคลม > 30%  
- **ต่ำ**: นอกเหนือจากสองระดับด้านบน  

### Tab 3 — รายการงาน (Task List)

- ตัวกรอง: ค้นหา (เลขงาน, ลูกค้า, รุ่น, Serial, SKU), ประเภท, รุ่น/SKU, เคลมซ้ำ (ทั้งหมด/ซ้ำเท่านั้น/ครั้งแรกเท่านั้น), ช่วงวันที่
- ตาราง: เลขงาน, ประเภท (ซ่อม/เคลม), ลูกค้า, รุ่น, SKU, Serial, อาการ (ย่อ 60 ตัวอักษร), วันที่, เคลมซ้ำ/ไม่หาย, อ้างอิง
- แบ่งหน้า 50 รายการต่อหน้า

### Tab 4 — หลักฐานต่อรอง (Factory Claim Evidence)

- **เลือกรุ่นเพื่อ Export**: เลือก SKU จาก dropdown → แสดงการ์ดสรุปหลักฐาน (สถิติ, อาการที่พบบ่อย, Serial ที่เสียซ้ำ, Reclaim chain, ข้อเรียกร้องที่แนะนำ) และปุ่ม Export PDF
- **Bulk Export**: Export CSV / Excel / PDF / TXT (รายงานต่อรองโรงงาน) — สำหรับ CSV/PDF/TXT ใช้รุ่นที่เลือกในช่อง “เลือกรุ่น”; สำหรับ Excel ใช้ query parameter `skus=SKU1,SKU2` หรือไม่ส่งเพื่อ export ข้อมูลรวม

---

## Export Formats / รูปแบบการ Export

### CSV

- **URL**: `GET /api/export/csv?sku=SKU-001`
- **ไฟล์**: `claim_evidence_{SKU}_{YYYY-MM-DD}.csv`
- คอลัมน์: task_number, task_type, customer_name, customer_province, product_model, sku, serial_number, issue_description, issue_group, create_date, is_reclaim, ref_task_numbers, claim_type, is_unfixed

### Excel

- **URL**: `GET /api/export/excel` หรือ `GET /api/export/excel?skus=SKU1,SKU2`
- **ไฟล์**: `factory_claim_report_{YYYY-MM-DD}.xlsx`
- Sheet: สรุปรายรุ่น, รายการงาน, อาการเสีย, หลักฐาน, และหนึ่ง sheet ต่อ SKU ที่เลือก (`{SKU}_tasks`)

### PDF

- **URL**: `GET /api/export/pdf?sku=SKU-001`
- **ไฟล์**: `evidence_{SKU}_{YYYY-MM-DD}.pdf`
- เนื้อหา: หน้าปก (SKU, รุ่น, วันที่, ระดับความเสี่ยง), สรุปสถิติ, Reclaim chain, จดหมายเรียกร้อง (ข้อความภาษาไทย)

### TXT

- **URL**: `GET /api/export/txt?sku=SKU-001`
- **ไฟล์**: `demand_letter_{SKU}_{YYYY-MM-DD}.txt`
- เนื้อหา: จดหมายเรียกร้องแบบ plain text (เหมือนหน้า 5 ของ PDF)

---

## How to Interpret Risk Level / การอ่านระดับความเสี่ยง

| ระดับ | เงื่อนไข (อย่างใดอย่างหนึ่ง) |
|-------|-----------------------------|
| **สูงมาก** | เคลมซ้ำ ≥ 3 ครั้ง, หรือ ซ่อมแล้วไม่หาย ≥ 2 ครั้ง, หรือ สัดส่วนงานเคลม > 60% ของงานทั้งหมด |
| **กลาง** | เคลมซ้ำ ≥ 1 ครั้ง, หรือ สัดส่วนงานเคลม > 30% |
| **ต่ำ** | ไม่เข้าเงื่อนไข “สูงมาก” หรือ “กลาง” |

ใช้ระดับความเสี่ยงเป็นตัวช่วยจัดลำดับความสำคัญในการต่อรองกับโรงงานและเลือกรุ่นที่ควรส่งหลักฐานก่อน

---

## Technical Notes

- ข้อมูลทั้งหมดดึงจาก Turso ผ่าน API routes (server-side) — **ไม่ส่ง TURSO_AUTH_TOKEN ไปที่ client**
- ตัวกรองส่งเป็น query string ไปที่ API (เช่น `type=claim`, `months=6`, `risk=high`, `page=1`, `limit=50`)
- วันที่แสดงในรูปแบบ วันที่ DD/MM/YYYY (ไทย)
- ตัวเลขใช้เครื่องหมายคั่นหลักพันตาม locale ไทย

---

## File Structure

```
web/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── dashboard/     # summary, by-model, trend, symptoms, tasks, evidence, skus
│   │   │   └── export/       # [type]: csv, excel, pdf, txt
│   │   ├── dashboard/
│   │   │   ├── _components/  # KpiCards, charts, tables, FilterBar, EvidenceExportPanel, etc.
│   │   │   └── page.tsx
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/ui/        # Card, Badge, Button, Tabs, Select
│   ├── lib/
│   │   ├── db.ts
│   │   ├── utils.ts
│   │   ├── queries/         # summary, byModel, trend, symptoms, tasks, evidence
│   │   └── export/          # generateCsv, generateExcel, generatePdf, generateTxt
│   └── types/
├── package.json
├── tailwind.config.ts
└── README.md
```
