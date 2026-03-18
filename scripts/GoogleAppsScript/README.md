# Google Sheets Dashboard (Apps Script)

Builds an in-Sheets dashboard from the **"Full Data"** sheet.

## Full Data sheet layout

| Col | Header           | Description                    |
|-----|------------------|--------------------------------|
| A   | customerGUId     | Customer GUID                  |
| B   | warrantyId       | Warranty ID                    |
| C   | model            | Product model                  |
| D   | description      | Customer complaint text        |
| E   | timestamp        | Date/time (dd/mm/yyyy HH:mm:ss)|
| F   | workflowId       | ulMEhA / OC8LiE                |
| G   | workflow_meaning | งานซ่อม / งานเคลม             |
| H   | taskNumber       | MNT-... / CLM-...             |
| I   | claimType        | Claim type                     |
| J   | sku              | SKU                            |
| K   | serial_number    | Serial                         |
| L   | issue_group      | Symptom / issue group          |
| M   | is_reclaim       | TRUE / FALSE                   |
| N   | ref_task_numbers | Comma-separated ref tasks      |

## Install

1. Open your Google Sheet.
2. **Extensions → Apps Script**.
3. Replace the default `Code.gs` content with the contents of `Dashboard.gs` (or add `Dashboard.gs` as a new file and remove the default script).
4. Save. On first run, authorize the script when prompted.

## Use

- **Menu:** A custom menu **Dashboard** is added with **สร้าง / อัพเดท Dashboard**.
- **Run once:** Click **สร้าง / อัพเดท Dashboard** to create or refresh the **Dashboard** sheet.

The script:

1. Reads all data from **Full Data** (skips rows with empty taskNumber).
2. Computes KPIs, top models, monthly trend, top symptoms, and evidence summary in Apps Script (no sheet formulas).
3. Writes the **Dashboard** sheet with 5 sections and applies formatting.
4. Shows an alert with the last-updated time.

## Sections

1. **KPI cards** — Total tasks, งานซ่อม, งานเคลม, เคลมซ้ำ, unique SKUs, reclaim rate.
2. **Top 10 models** — By issue count (Rank, SKU, Model, counts, %). Top 3 rows highlighted.
3. **Monthly trend** — Rows = month (YYYY-MM), columns = งานซ่อม, งานเคลม, รวม, เคลมซ้ำ. Color: green &lt; avg, yellow = avg, red &gt; avg.
4. **Top symptoms (issue_group)** — อาการ, จำนวน, %, SKU ที่เกี่ยวข้อง (top 10).
5. **Factory evidence summary** — Red header; top reclaim model, top symptom, top reclaim SKU, repeat serial count, peak claim month.
