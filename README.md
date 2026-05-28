# Transport ERP Lite v0.4.0-performance-layout

Vanilla Web App MVP สำหรับระบบ ERP บริษัทขนส่ง โดยใช้ Google Sheet เป็นฐานข้อมูล และใช้ Google Apps Script เป็น API กลาง

## ไฟล์ในโปรเจกต์

```text
index.html
script.js
style.css
README.md
apps-script.gs
```

หมายเหตุ: เวอร์ชันนี้ไม่ใช้ Supabase แล้ว จึงไม่มี `schema.sql`

หมายเหตุ v0.4.0: เพิ่ม sidebar ย่อ/ขยาย, loading overlay, ปรับ performance Google Sheet API, เปลี่ยนเส้นทางเป็นต้นทาง/ปลายทาง และ format วันที่/เวลา

## ภาพรวมระบบ

ระบบนี้ออกแบบให้ user คีย์ "เที่ยววิ่งงาน" เป็นศูนย์กลาง แล้วระบบแปลงข้อมูลต่อไปยัง Settlement และ Accounting Queue

```text
คีย์เที่ยววิ่งงาน
  ↓
Operation อนุมัติ
  ├─ รถบริษัท → HR Settlement → Accounting Queue
  └─ รถร่วม / ผรม. → Subcontractor Settlement → Accounting Queue
  ↓
บัญชีสร้าง Bill / Inv / RV / PV
```


## สิ่งที่เปลี่ยนใน v0.4.0

```text
- Sidebar ย่อ/ขยายได้ และจำสถานะใน localStorage
- เพิ่ม loading overlay กลางหน้าจอ พร้อม blur background และ block การกดระหว่างโหลด/บันทึก
- ปรับ performance: action ฝั่ง Apps Script ส่งข้อมูลกลับแบบ minimal response และ frontend update state แบบ optimistic หลัง server สำเร็จ
- append หลายรายการใน Apps Script เป็น batch setValues เพื่อลดจำนวน calls ไปยัง Google Sheet
- วันที่บนเว็บแสดงแบบ DD/MM/YYYY
- เวลาแสดงแบบ HH:MM
- เปลี่ยน field คีย์เที่ยววิ่งจาก “เส้นทาง” เป็น “ต้นทาง” และ “ปลายทาง”
- เพิ่ม field origin_name, destination_name ใน trip_runs แบบ backward compatible
- route_name ยังเก็บไว้เป็น snapshot/compatibility สำหรับข้อมูลเดิม
```

## สิ่งที่เปลี่ยนใน v0.3.0

```text
- เปลี่ยน layout เป็น sidebar + content area
- แยกฟอร์มเพิ่มลูกค้า / คีย์เที่ยววิ่ง / ตั้งค่า API เป็น modal
- ตัดข้อความอธิบายที่ไม่จำเป็นออกจากหน้าเว็บ
- ย้ายรายละเอียดเชิงระบบให้อยู่ใน README.md
- เก็บโครงสร้าง Google Sheet เดิม ไม่มี migration เพิ่ม
```

## Stack

```text
Frontend: Vanilla HTML / CSS / JavaScript
Database: Google Sheet
Backend API: Google Apps Script Web App
Storage mode fallback: localStorage เมื่อยังไม่ตั้งค่า Apps Script URL
```

## วิธีติดตั้งบน GitHub repo

คัดลอกไฟล์ทั้งหมดไปไว้ใน repo:

```bash
git add index.html script.js style.css apps-script.gs README.md
git commit -m "Release v0.4.0 performance layout"
git push
```

ถ้า repo เป็น Public และมีข้อมูลจริง แนะนำเปลี่ยนเป็น Private ก่อนใช้งานจริง

## วิธีสร้าง Google Sheet Database

1. สร้าง Google Sheet ใหม่ เช่น `transport-erp-lite-db`
2. ไปที่ `Extensions > Apps Script`
3. ลบโค้ดเดิมใน Apps Script
4. วางเนื้อหาจากไฟล์ `apps-script.gs`
5. กด Save
6. ไปที่ `Project Settings > Script Properties`
7. เพิ่ม property:

```text
APP_TOKEN = สุ่ม token เอง เช่น uuid/random string
```

ห้ามใช้ password จริง ห้าม commit token จริงลง GitHub

8. กด `Deploy > New deployment`
9. เลือก type: `Web app`
10. Execute as: `Me`
11. Who has access:
    - MVP ภายใน: `Anyone with the link`
    - ถ้าใช้ Google Workspace แนะนำจำกัดเฉพาะองค์กร
12. Copy Web App URL

## วิธีตั้งค่าใน Web App

1. เปิด `index.html`
2. เข้าเมนู `ตั้งค่า`
3. ใส่:
   - Web App URL
   - API Token ที่ตรงกับ `APP_TOKEN`
4. กด `บันทึก config`
5. กด `Initialize Sheets`
6. กลับไปเมนู `ลูกค้า` แล้วเริ่มเพิ่มลูกค้า

## เมนูหลัก

```text
Dashboard
ลูกค้า
เที่ยววิ่งงาน
HR Settlement
รถร่วม Settlement
บัญชี
ตั้งค่า
```

## Layout v0.3.0

```text
Sidebar เมนูหลัก
Content area สำหรับตารางและ summary
Modal สำหรับฟอร์มเพิ่ม/แก้/ตั้งค่า
```

หน้าที่แยกเป็น modal:

```text
เพิ่มลูกค้า
คีย์เที่ยววิ่งงาน
ตั้งค่า Google Sheet API
ดูสรุปกำไรขาดทุนของเที่ยววิ่ง
```

## Business Rule สำคัญ

### ลูกค้า

ตอนคีย์เที่ยววิ่งต้องเลือกลูกค้าจาก dropdown

รูปแบบรายได้ MVP:

```text
manual = กรอกเอง
route_based = ราคาตามต้นทาง/ปลายทาง
vehicle_type_based = ราคาตามประเภทรถ
```

### รายได้ค่าขนส่ง

```text
ค่าขนส่งจากลูกค้า default WHT = 1%
VAT มี field เตรียมไว้ แต่ default เป็น 0%
```

WHT แสดงแยก ไม่เอาไปลดยอดรายได้โดยตรง

### ค่าใช้จ่ายปกติ

ค่าใช้จ่ายปกติมี checkbox:

```text
[ ] หัก พขร. / หัก ผรม.
```

Rule:

```text
ถ้าเป็นรถบริษัท → หมายถึง หัก พขร.
ถ้าเป็นรถร่วม → หมายถึง หัก ผรม.
ถ้าติ๊กหัก → default ยอดหักเต็มจำนวน
รายการหัก → สร้างเป็นลูกหนี้ฝั่งบัญชีหลังผ่าน Settlement
```

### ค่าพิเศษ

ค่าพิเศษมีทั้งฝั่งรับและฝั่งจ่าย:

```text
ฝั่งรับลูกค้า:
- เรียกเก็บลูกค้าไหม
- วิธีคิด: บาท / %
- ราคารับ
- WHT รับ
- VAT รับ

ฝั่งจ่าย:
- ต้องจ่ายต่อไหม
- วิธีคิด: บาท / %
- ราคาจ่าย
- WHT จ่าย
- VAT จ่าย
```

ถ้าเลือก `%`:
- ราคารับคิดจากค่าขนส่งหลัก
- ราคาจ่ายคิดจากราคารับของค่าพิเศษ ถ้ามี ถ้าไม่มีใช้ค่าขนส่งหลักเป็นฐาน

### รถบริษัท

```text
Operation อนุมัติเที่ยววิ่ง
  ↓
ค่าเที่ยว พขร. / รายการหัก / ค่าพิเศษจ่าย
  ↓
HR Settlement
  ↓
อนุมัติส่ง Accounting Queue
```

### รถร่วม / ผรม.

```text
Operation อนุมัติเที่ยววิ่ง
  ↓
ค่าจ้างรถร่วม / รายการหัก ผรม. / ค่าพิเศษจ่าย
  ↓
Subcontractor Settlement
  ↓
อนุมัติส่ง Accounting Queue
```

### Accounting Queue

เอกสารหลัก:

```text
BILL = ใบวางบิล
INV  = ใบแจ้งหนี้ / ตั้งหนี้
RV   = ใบสำคัญรับ
PV   = ใบสำคัญจ่าย
```

MVP ตอนนี้สร้างเอกสารจาก Queue ได้ 1 รายการต่อ 1 เอกสารก่อน หากต้องรวมหลายเที่ยวเป็น 1 ใบ ค่อยเพิ่มในเวอร์ชันถัดไป

## สูตร Tab สรุปกำไรขาดทุน

```text
รายรับก่อน WHT =
ค่าขนส่งจากลูกค้า + ค่าพิเศษที่เรียกเก็บลูกค้า

WHT รับ =
WHT ค่าขนส่ง + WHT ค่าพิเศษฝั่งรับ

เงินจ่ายออกก่อนหักคืน =
ค่าใช้จ่ายปกติ + ค่าเที่ยว พขร. + ค่าจ้างรถร่วม + ค่าพิเศษฝั่งจ่าย

รายการหักคืน =
ค่าใช้จ่ายปกติที่ติ๊กหัก พขร. / ผรม.

ต้นทุนสุทธิของบริษัท =
เงินจ่ายออกก่อนหักคืน - รายการหักคืน

กำไรขั้นต้น =
รายรับก่อน WHT - ต้นทุนสุทธิของบริษัท
```

## Google Sheet Structure

ระบบจะสร้าง tab อัตโนมัติเมื่อกด `Initialize Sheets`

### 1. customers

| Field | ความหมาย |
|---|---|
| id | รหัสลูกค้า |
| name | ชื่อลูกค้า |
| tax_id | เลขผู้เสียภาษี |
| billing_address | ที่อยู่ใบกำกับภาษี |
| revenue_type | รูปแบบรายได้: manual / route_based / vehicle_type_based |
| credit_term_days | Credit term จำนวนวัน |
| default_wht_rate | WHT default ของลูกค้า |
| default_vat_rate | VAT default ของลูกค้า |
| is_active | ใช้งานอยู่หรือไม่ |
| created_at | วันที่สร้าง |
| updated_at | วันที่แก้ไขล่าสุด |

### 2. trip_runs

| Field | ความหมาย |
|---|---|
| id | รหัสเที่ยววิ่ง |
| trip_no | เลขที่เที่ยววิ่ง |
| customer_id | อ้างอิง customers.id |
| customer_name | ชื่อลูกค้า snapshot |
| trip_date | วันที่วิ่ง |
| origin_name | ต้นทาง |
| destination_name | ปลายทาง |
| route_name | snapshot เส้นทางเดิม/compatibility เช่น `ต้นทาง → ปลายทาง` |
| vehicle_type | ประเภทรถ |
| vehicle_mode | company / subcontractor |
| vehicle_no | ทะเบียนหรือชื่อรถ |
| driver_name | ชื่อ พขร. รถบริษัท |
| subcontractor_name | ชื่อ ผรม. / รถร่วม |
| freight_income_amount | ค่าขนส่งจากลูกค้า |
| freight_wht_rate | WHT ค่าขนส่ง |
| freight_vat_rate | VAT ค่าขนส่ง |
| driver_trip_pay | ค่าเที่ยว พขร. |
| subcontractor_pay_amount | ค่าจ้างรถร่วม |
| subcontractor_wht_rate | WHT จ่ายรถร่วม |
| subcontractor_vat_rate | VAT จ่ายรถร่วม |
| note | หมายเหตุ |
| status | draft / approved |
| approved_at | วันที่อนุมัติ |
| created_at | วันที่สร้าง |
| updated_at | วันที่แก้ไขล่าสุด |

### 3. trip_expenses

| Field | ความหมาย |
|---|---|
| id | รหัสค่าใช้จ่าย |
| trip_run_id | อ้างอิง trip_runs.id |
| description | รายการค่าใช้จ่าย |
| leg | pickup / delivery / other |
| amount | จำนวนเงิน |
| paid_by | company / driver / subcontractor / other |
| payee_name | ผู้รับเงิน |
| deduct_from_driver | true/false หัก พขร. หรือ ผรม. |
| deduction_amount | จำนวนเงินที่หัก |
| deduction_target_type | driver / subcontractor |
| payment_status | pending / paid |
| deduction_status | pending / deducted |
| vat_rate | VAT field เตรียมไว้ |
| wht_rate | WHT field เตรียมไว้ |
| created_at | วันที่สร้าง |

### 4. trip_special_items

| Field | ความหมาย |
|---|---|
| id | รหัสค่าพิเศษ |
| trip_run_id | อ้างอิง trip_runs.id |
| description | รายการค่าพิเศษ |
| leg | pickup / delivery / other |
| bill_to_customer | เรียกเก็บลูกค้าหรือไม่ |
| customer_charge_calc_type | fixed / percent |
| customer_charge_rate | จำนวนบาทหรือเปอร์เซ็นต์ฝั่งรับ |
| customer_charge_amount | จำนวนเงินฝั่งรับหลังคำนวณ |
| customer_wht_rate | WHT ฝั่งรับ |
| customer_vat_rate | VAT ฝั่งรับ |
| payable_to_party | ต้องจ่ายต่อหรือไม่ |
| payable_calc_type | fixed / percent |
| payable_rate | จำนวนบาทหรือเปอร์เซ็นต์ฝั่งจ่าย |
| payable_amount | จำนวนเงินฝั่งจ่ายหลังคำนวณ |
| payable_wht_rate | WHT ฝั่งจ่าย |
| payable_vat_rate | VAT ฝั่งจ่าย |
| payee_name | ผู้รับเงินฝั่งจ่าย |
| note | หมายเหตุ |
| billing_status | pending / billed |
| payment_status | pending / paid |
| created_at | วันที่สร้าง |

### 5. hr_settlement_items

| Field | ความหมาย |
|---|---|
| id | รหัส settlement item |
| trip_run_id | อ้างอิง trip_runs.id |
| trip_no | เลขเที่ยววิ่ง snapshot |
| source_type | trip_run / trip_expense / trip_special_item |
| source_id | รหัสต้นทาง |
| target_type | driver |
| target_name | ชื่อ พขร. |
| item_type | trip_allowance / deduction / special_payable |
| direction | payable / receivable |
| description | รายละเอียด |
| amount | จำนวนเงิน |
| vat_rate | VAT field |
| wht_rate | WHT field |
| status | pending / approved |
| approved_at | วันที่อนุมัติ |
| created_at | วันที่สร้าง |

### 6. subcontractor_settlement_items

| Field | ความหมาย |
|---|---|
| id | รหัส settlement item |
| trip_run_id | อ้างอิง trip_runs.id |
| trip_no | เลขเที่ยววิ่ง snapshot |
| source_type | trip_run / trip_expense / trip_special_item |
| source_id | รหัสต้นทาง |
| target_type | subcontractor |
| target_name | ชื่อ ผรม. |
| item_type | subcontractor_pay / deduction / special_payable |
| direction | payable / receivable |
| description | รายละเอียด |
| amount | จำนวนเงิน |
| vat_rate | VAT field |
| wht_rate | WHT field |
| status | pending / approved |
| approved_at | วันที่อนุมัติ |
| created_at | วันที่สร้าง |

### 7. accounting_queue_items

| Field | ความหมาย |
|---|---|
| id | รหัส queue |
| source_type | ประเภทต้นทาง |
| source_id | รหัสต้นทาง |
| accounting_side | ar / ap |
| queue_type | customer_billing / normal_expense / deduction / special_payable / subcontractor_pay |
| document_type_hint | BILL / INV / RV / PV |
| party_type | customer / driver / subcontractor / company / other |
| party_name | ชื่อคู่ค้า |
| description | รายละเอียด |
| amount_before_vat | ยอดก่อน VAT |
| vat_rate | VAT % |
| vat_amount | ยอด VAT |
| wht_rate | WHT % |
| wht_amount | ยอด WHT |
| net_amount | ยอดสุทธิ |
| status | pending / documented |
| document_id | อ้างอิง accounting_documents.id |
| created_at | วันที่สร้าง |

### 8. accounting_documents

| Field | ความหมาย |
|---|---|
| id | รหัสเอกสาร |
| document_no | เลขเอกสาร |
| document_type | BILL / INV / RV / PV |
| queue_item_id | อ้างอิง accounting_queue_items.id |
| source_type | ประเภทต้นทาง |
| source_id | รหัสต้นทาง |
| party_type | ประเภทคู่ค้า |
| party_name | ชื่อคู่ค้า |
| description | รายละเอียด |
| amount_before_vat | ยอดก่อน VAT |
| vat_rate | VAT % |
| vat_amount | ยอด VAT |
| wht_rate | WHT % |
| wht_amount | ยอด WHT |
| net_amount | ยอดสุทธิ |
| status | issued / cancelled |
| created_at | วันที่สร้าง |

### 9. audit_logs

| Field | ความหมาย |
|---|---|
| id | รหัส log |
| action | action ที่เกิดขึ้น |
| table_name | table ที่เกี่ยวข้อง |
| record_id | id record ที่เกี่ยวข้อง |
| message | รายละเอียด |
| created_at | วันที่สร้าง log |


## Migration Note v0.4.0

เมื่อกด `Initialize Sheets` ระบบจะเพิ่ม header ใหม่ใน tab `trip_runs` อัตโนมัติถ้ายังไม่มี:

```text
origin_name
destination_name
```

ข้อมูลเก่าที่มีเฉพาะ `route_name` ยังแสดงผลได้ตามเดิม ส่วนข้อมูลใหม่จะบันทึก `origin_name`, `destination_name` และสร้าง `route_name` เป็น snapshot เพื่อ compatibility

## Test Checklist

หลังติดตั้งให้ทดสอบขั้นต่ำ:

```text
[ ] เปิด index.html ได้
[ ] เพิ่มลูกค้าได้
[ ] เปิด modal ตั้งค่า API และบันทึก Web App URL + token ได้
[ ] กด Initialize Sheets แล้ว Google Sheet มี tabs ครบ
[ ] Sidebar ย่อ/ขยายได้และจำสถานะได้
[ ] Loading overlay แสดงตอน Sync/Save/Approve/Init และกดอย่างอื่นไม่ได้
[ ] วันที่บนเว็บเป็น DD/MM/YYYY และเวลาเป็น HH:MM
[ ] เปิด modal คีย์เที่ยววิ่งรถบริษัทได้
[ ] ติ๊กหัก พขร. แล้วยอดหัก default เท่าค่าใช้จ่าย
[ ] Operation อนุมัติรถบริษัทแล้วเข้า HR Settlement
[ ] HR อนุมัติแล้วเข้า Accounting Queue
[ ] คีย์เที่ยววิ่งด้วยต้นทาง/ปลายทางได้ และข้อมูลเดิม route_name ยังแสดงได้
[ ] เปิด modal คีย์เที่ยววิ่งรถร่วมได้
[ ] รถร่วมอนุมัติแล้วเข้า Subcontractor Settlement
[ ] Subcontractor Settlement อนุมัติแล้วเข้า Accounting Queue
[ ] สร้างเอกสารจาก Accounting Queue ได้
[ ] Dashboard แสดงกำไรขั้นต้น
```

## ข้อจำกัด v0.4.0

```text
- ยังไม่มีระบบ login/role จริง
- Token ใน frontend เป็น shared token สำหรับ MVP เท่านั้น
- ยังไม่รวมหลายเที่ยวเป็น Bill/Inv/PV ใบเดียว
- ยังไม่ทำ upload หลักฐาน
- ยังไม่ทำ edit/delete record
- Modal form ยังเป็น create-first flow ยังไม่มี edit modal
- Apps Script ยังใช้ข้อมูล generated จาก frontend เป็นหลัก ใน production ควร recompute ฝั่ง server อีกชั้น
- Google Sheet ไม่เหมาะกับ concurrent user จำนวนมากหรือข้อมูลปริมาณสูง
```

## Rollback

Frontend:

```bash
git revert <commit>
git push
```

Google Sheet:

```text
File > Version history > See version history
```

ก่อนแก้ข้อมูลจริงหรือเปลี่ยนโครงสร้าง tab ควร copy Google Sheet สำรองไว้ก่อนเสมอ

## Version

```text
Base: v0.3.0-modal-layout
Current: v0.4.0-performance-layout
```
