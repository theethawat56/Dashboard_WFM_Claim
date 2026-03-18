/**
 * Dashboard builder for WFM Full Data sheet.
 * Sheet "Full Data" columns (0-indexed): A=customerGUId, B=warrantyId, C=model, D=description,
 * E=timestamp, F=workflowId, G=workflow_meaning, H=taskNumber, I=claimType, J=sku, K=serial_number,
 * L=issue_group, M=is_reclaim, N=ref_task_numbers
 */

// Column indices for Full Data (0-based)
var FD = {
  customerGUId: 0,
  warrantyId: 1,
  model: 2,
  description: 3,
  timestamp: 4,
  workflowId: 5,
  workflow_meaning: 6,
  taskNumber: 7,
  claimType: 8,
  sku: 9,
  serial_number: 10,
  issue_group: 11,
  is_reclaim: 12,
  ref_task_numbers: 13
};

var REPAIR_LABEL = 'งานซ่อม';
var CLAIM_LABEL = 'งานเคลม';
var RECLAIM_TRUE = 'TRUE';
var NO_DATA = 'ไม่มีข้อมูล';

/**
 * Returns processed dashboard data from "Full Data" sheet.
 * Skips rows with empty taskNumber.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} fullDataSheet - Sheet named "Full Data"
 * @return {Object} Dashboard data object
 */
function getDashboardData_(fullDataSheet) {
  var lastRow = fullDataSheet.getLastRow();
  var data = lastRow <= 1 ? [] : fullDataSheet.getRange(2, 1, lastRow, 14).getValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var taskNum = r[FD.taskNumber];
    if (taskNum === null || taskNum === undefined || String(taskNum).trim() === '') continue;
    rows.push(r);
  }

  var totalTasks = rows.length;
  var repairCount = 0;
  var claimCount = 0;
  var reclaimCount = 0;
  var skuSet = {};
  var modelStats = {};
  var monthStats = {};
  var symptomCount = {};
  var symptomSkus = {};
  var reclaimByModel = {};
  var reclaimBySymptom = {};
  var reclaimBySku = {};
  var serialCount = {};
  var reclaimByMonth = {};
  var claimByMonth = {};

  for (var j = 0; j < rows.length; j++) {
    var row = rows[j];
    var wf = String(row[FD.workflow_meaning] || '').trim();
    var reclaim = String(row[FD.is_reclaim] || '').toUpperCase() === RECLAIM_TRUE;
    var skuVal = String(row[FD.sku] || '').trim();
    var modelVal = String(row[FD.model] || '').trim();
    var issueVal = String(row[FD.issue_group] || '').trim();
    var serialVal = String(row[FD.serial_number] || '').trim();

    if (wf === REPAIR_LABEL) repairCount++;
    if (wf === CLAIM_LABEL) claimCount++;
    if (reclaim) reclaimCount++;

    if (skuVal) skuSet[skuVal] = true;

    var month = parseMonth_(row[FD.timestamp]);
    if (month) {
      if (!monthStats[month]) monthStats[month] = { repair: 0, claim: 0, total: 0, reclaim: 0 };
      monthStats[month].total++;
      if (wf === REPAIR_LABEL) { monthStats[month].repair++; }
      if (wf === CLAIM_LABEL) {
        monthStats[month].claim++;
        claimByMonth[month] = (claimByMonth[month] || 0) + 1;
      }
      if (reclaim) {
        monthStats[month].reclaim++;
        reclaimByMonth[month] = (reclaimByMonth[month] || 0) + 1;
      }
    }

    if (modelVal) {
      modelStats[modelVal] = modelStats[modelVal] || { total: 0, repair: 0, claim: 0, reclaim: 0, sampleSku: '' };
      modelStats[modelVal].total++;
      if (skuVal && !modelStats[modelVal].sampleSku) modelStats[modelVal].sampleSku = skuVal;
      if (wf === REPAIR_LABEL) modelStats[modelVal].repair++;
      if (wf === CLAIM_LABEL) modelStats[modelVal].claim++;
      if (reclaim) {
        modelStats[modelVal].reclaim++;
        reclaimByModel[modelVal] = (reclaimByModel[modelVal] || 0) + 1;
      }
    }

    if (issueVal) {
      symptomCount[issueVal] = (symptomCount[issueVal] || 0) + 1;
      if (!symptomSkus[issueVal]) symptomSkus[issueVal] = {};
      if (skuVal) symptomSkus[issueVal][skuVal] = true;
      if (reclaim) reclaimBySymptom[issueVal] = (reclaimBySymptom[issueVal] || 0) + 1;
    }

    if (skuVal) {
      reclaimBySku[skuVal] = reclaimBySku[skuVal] || { reclaim: 0, total: 0 };
      reclaimBySku[skuVal].total++;
      if (reclaim) reclaimBySku[skuVal].reclaim++;
    }

    if (serialVal) {
      serialCount[serialVal] = (serialCount[serialVal] || 0) + 1;
    }
  }

  var uniqueSkus = Object.keys(skuSet).length;
  var reclaimRate = totalTasks > 0 ? reclaimCount / totalTasks : 0;

  var topModels = buildTopModels_(modelStats, totalTasks);
  var monthlyTrend = buildMonthlyTrend_(monthStats);
  var topSymptoms = buildTopSymptoms_(symptomCount, symptomSkus, totalTasks);
  var evidenceSummary = buildEvidenceSummary_(
    reclaimByModel, reclaimBySymptom, reclaimBySku, serialCount, claimByMonth, reclaimByMonth
  );

  return {
    totalTasks: totalTasks,
    repairCount: repairCount,
    claimCount: claimCount,
    reclaimCount: reclaimCount,
    uniqueSkus: uniqueSkus,
    reclaimRate: reclaimRate,
    topModels: topModels,
    monthlyTrend: monthlyTrend,
    topSymptoms: topSymptoms,
    evidenceSummary: evidenceSummary
  };
}

function parseMonth_(val) {
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = val.getMonth() + 1;
    return y + '-' + (m < 10 ? '0' : '') + m;
  }
  if (typeof val !== 'string') return null;
  var d = new Date(val);
  if (isNaN(d.getTime())) return null;
  var y = d.getFullYear();
  var m = d.getMonth() + 1;
  return y + '-' + (m < 10 ? '0' : '') + m;
}

function buildTopModels_(modelStats, totalTasks) {
  var list = [];
  for (var model in modelStats) {
    var s = modelStats[model];
    list.push({
      model: model,
      sku: s.sampleSku || '',
      total: s.total,
      repair: s.repair,
      claim: s.claim,
      reclaim: s.reclaim,
      pct: totalTasks > 0 ? s.total / totalTasks : 0
    });
  }
  list.sort(function (a, b) { return b.total - a.total; });
  var out = [];
  for (var i = 0; i < Math.min(10, list.length); i++) {
    out.push({
      rank: i + 1,
      sku: list[i].sku,
      model: list[i].model,
      total: list[i].total,
      repair: list[i].repair,
      claim: list[i].claim,
      reclaim: list[i].reclaim,
      pct: list[i].pct
    });
  }
  return out;
}

function buildMonthlyTrend_(monthStats) {
  var months = Object.keys(monthStats).sort();
  var out = [];
  for (var i = 0; i < months.length; i++) {
    var m = monthStats[months[i]];
    out.push({
      month: months[i],
      repair: m.repair,
      claim: m.claim,
      total: m.total,
      reclaim: m.reclaim
    });
  }
  return out;
}

function buildTopSymptoms_(symptomCount, symptomSkus, totalTasks) {
  var list = [];
  for (var s in symptomCount) {
    var count = symptomCount[s];
    var skus = symptomSkus[s] ? Object.keys(symptomSkus[s]).slice(0, 5).join(', ') : '';
    list.push({
      symptom: s,
      count: count,
      pct: totalTasks > 0 ? count / totalTasks : 0,
      skus: skus
    });
  }
  list.sort(function (a, b) { return b.count - a.count; });
  return list.slice(0, 10);
}

function buildEvidenceSummary_(reclaimByModel, reclaimBySymptom, reclaimBySku, serialCount, claimByMonth, reclaimByMonth) {
  var topReclaimModel = { model: NO_DATA, count: 0 };
  for (var m in reclaimByModel) {
    if (reclaimByModel[m] > topReclaimModel.count) {
      topReclaimModel = { model: m, count: reclaimByModel[m] };
    }
  }
  var topSymptom = { symptom: NO_DATA, count: 0 };
  for (var s in reclaimBySymptom) {
    if (reclaimBySymptom[s] > topSymptom.count) {
      topSymptom = { symptom: s, count: reclaimBySymptom[s] };
    }
  }
  var topReclaimSku = { sku: NO_DATA, rate: 0, n: 0 };
  for (var sku in reclaimBySku) {
    var t = reclaimBySku[sku];
    var rate = t.total > 0 ? t.reclaim / t.total : 0;
    if (rate > topReclaimSku.rate) {
      topReclaimSku = { sku: sku, rate: rate, n: t.reclaim };
    }
  }
  var repeatSerialCount = 0;
  for (var ser in serialCount) {
    if (serialCount[ser] > 1) repeatSerialCount++;
  }
  var peakMonth = { month: NO_DATA, count: 0 };
  for (var mo in claimByMonth) {
    if (claimByMonth[mo] > peakMonth.count) {
      peakMonth = { month: mo, count: claimByMonth[mo] };
    }
  }
  return {
    topReclaimModel: topReclaimModel,
    topSymptom: topSymptom,
    topReclaimSku: topReclaimSku,
    repeatSerialCount: repeatSerialCount,
    peakMonth: peakMonth
  };
}

/**
 * Creates or updates the "Dashboard" sheet with all sections and formatting.
 */
function buildDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fullDataSheet = ss.getSheetByName('Full Data');
  if (!fullDataSheet) {
    SpreadsheetApp.getUi().alert('ไม่พบชีต "Full Data"');
    return;
  }

  var dashboardSheet = ss.getSheetByName('Dashboard');
  if (!dashboardSheet) {
    dashboardSheet = ss.insertSheet('Dashboard');
  }
  dashboardSheet.clear();
  dashboardSheet.setTabColor('#1565C0');

  var d = getDashboardData_(fullDataSheet);

  var row = 1;
  var sectionBg = '#37474F';
  var dataBg1 = '#FFFFFF';
  var dataBg2 = '#F5F5F5';

  // --- SECTION 1: KPI cards ---
  var cardRanges = [
    { range: 'A1:C4', label: 'งานทั้งหมด', value: d.totalTasks, color: '#1565C0' },
    { range: 'E1:G4', label: REPAIR_LABEL, value: d.repairCount, color: '#1976D2' },
    { range: 'I1:K4', label: CLAIM_LABEL, value: d.claimCount, color: '#E65100' },
    { range: 'M1:O4', label: 'เคลมซ้ำ', value: d.reclaimCount, color: '#B71C1C' },
    { range: 'A6:C8', label: 'SKU ที่มีปัญหา', value: d.uniqueSkus, color: '#4A148C' },
    { range: 'E6:G8', label: 'อัตราเคลมซ้ำ', value: (d.reclaimRate * 100).toFixed(1) + '%', color: '#880E4F' }
  ];
  for (var c = 0; c < cardRanges.length; c++) {
    var card = cardRanges[c];
    var rng = dashboardSheet.getRange(card.range);
    rng.merge();
    rng.setBackground(card.color).setFontColor('#FFFFFF').setFontSize(11);
    rng.setVerticalAlignment('middle').setHorizontalAlignment('center');
    rng.setValues([[card.label + '\n' + card.value]]);
  }

  row = 10;

  // --- SECTION 2: Top 10 Models ---
  dashboardSheet.getRange(row, 1, row, 8).setValues([['Rank', 'SKU', 'Model', 'Total Issues', 'งานซ่อม', 'งานเคลม', 'เคลมซ้ำ', '% of Total']]);
  dashboardSheet.getRange(row, 1, row, 8).setBackground('#263238').setFontColor('#FFFFFF').setFontWeight('bold');
  row++;
  var modelRows = [];
  for (var i = 0; i < d.topModels.length; i++) {
    var tm = d.topModels[i];
    modelRows.push([
      tm.rank,
      tm.sku,
      tm.model,
      tm.total,
      tm.repair,
      tm.claim,
      tm.reclaim,
      (tm.pct * 100).toFixed(1) + '%'
    ]);
  }
  if (modelRows.length === 0) modelRows.push([NO_DATA, '', '', '', '', '', '', '']);
  dashboardSheet.getRange(row, 1, row + modelRows.length - 1, 8).setValues(modelRows);
  dashboardSheet.getRange(row, 1, row + modelRows.length - 1, 8).setFontSize(10).setHorizontalAlignment('right');
  dashboardSheet.getRange(row, 2, row + modelRows.length - 1, 3).setHorizontalAlignment('left');
  dashboardSheet.getRange(row, 4, row + modelRows.length - 1, 7).setNumberFormat('###,###');
  dashboardSheet.getRange(row, 8, row + modelRows.length - 1, 8).setNumberFormat('0.0%');
  for (var r = 0; r < Math.min(3, modelRows.length); r++) {
    dashboardSheet.getRange(row + r, 1, row + r, 8).setBackground('#FFEB3B');
  }
  for (var r = 3; r < modelRows.length; r++) {
    dashboardSheet.getRange(row + r, 1, row + r, 8).setBackground(r % 2 === 0 ? dataBg1 : dataBg2);
  }
  row += modelRows.length + 2;

  // --- SECTION 3: Monthly Trend ---
  dashboardSheet.getRange(row, 1, row, 5).setValues([['เดือน', 'งานซ่อม', 'งานเคลม', 'รวม', 'เคลมซ้ำ']]);
  dashboardSheet.getRange(row, 1, row, 5).setBackground(sectionBg).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(12);
  row++;
  var trendRows = [];
  var avgTotal = 0;
  if (d.monthlyTrend.length > 0) {
    var sum = 0;
    for (var t = 0; t < d.monthlyTrend.length; t++) sum += d.monthlyTrend[t].total;
    avgTotal = sum / d.monthlyTrend.length;
  }
  for (var t = 0; t < d.monthlyTrend.length; t++) {
    var mt = d.monthlyTrend[t];
    var bg = avgTotal <= 0 ? dataBg1 : (mt.total < avgTotal ? '#C8E6C9' : (mt.total > avgTotal ? '#FFCDD2' : '#FFF9C4'));
    trendRows.push([mt.month, mt.repair, mt.claim, mt.total, mt.reclaim]);
  }
  if (trendRows.length === 0) trendRows.push([NO_DATA, '', '', '', '']);
  dashboardSheet.getRange(row, 1, row + trendRows.length - 1, 5).setValues(trendRows);
  dashboardSheet.getRange(row, 2, row + trendRows.length - 1, 5).setNumberFormat('###,###');
  for (var t = 0; t < trendRows.length; t++) {
    var mt = d.monthlyTrend[t];
    var bg = !mt ? dataBg1 : (avgTotal <= 0 ? dataBg1 : (mt.total < avgTotal ? '#C8E6C9' : (mt.total > avgTotal ? '#FFCDD2' : '#FFF9C4')));
    dashboardSheet.getRange(row + t, 1, row + t, 5).setBackground(bg).setFontSize(10).setHorizontalAlignment('right');
    dashboardSheet.getRange(row + t, 1, row + t, 1).setHorizontalAlignment('left');
  }
  row += trendRows.length + 2;

  // --- SECTION 4: Top Symptoms ---
  dashboardSheet.getRange(row, 1, row, 4).setValues([['อาการเสียที่พบบ่อย (issue_group)']]);
  dashboardSheet.getRange(row, 1, row, 4).merge().setBackground(sectionBg).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(12);
  row++;
  dashboardSheet.getRange(row, 1, row, 4).setValues([['อาการ', 'จำนวน', '%', 'SKU ที่เกี่ยวข้อง']]);
  dashboardSheet.getRange(row, 1, row, 4).setBackground('#263238').setFontColor('#FFFFFF').setFontWeight('bold');
  row++;
  var symptomRows = [];
  for (var s = 0; s < d.topSymptoms.length; s++) {
    var sym = d.topSymptoms[s];
    symptomRows.push([sym.symptom, sym.count, (sym.pct * 100).toFixed(1) + '%', sym.skus]);
  }
  if (symptomRows.length === 0) symptomRows.push([NO_DATA, '', '', '']);
  dashboardSheet.getRange(row, 1, row + symptomRows.length - 1, 4).setValues(symptomRows);
  for (var s = 0; s < symptomRows.length; s++) {
    dashboardSheet.getRange(row + s, 1, row + s, 4).setBackground(s % 2 === 0 ? dataBg1 : dataBg2).setFontSize(10);
    dashboardSheet.getRange(row + s, 2, row + s, 2).setHorizontalAlignment('right').setNumberFormat('###,###');
    dashboardSheet.getRange(row + s, 3, row + s, 3).setHorizontalAlignment('right').setNumberFormat('0.0%');
  }
  row += symptomRows.length + 2;

  // --- SECTION 5: Factory Evidence Summary ---
  var es = d.evidenceSummary;
  dashboardSheet.getRange(row, 1, row, 2).setValues([['หลักฐานสำหรับต่อรองกับโรงงาน']]);
  dashboardSheet.getRange(row, 1, row, 2).merge().setBackground('#B71C1C').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(12);
  row++;
  var evidenceLines = [
    'รุ่นที่มีเคลมซ้ำสูงสุด: ' + es.topReclaimModel.model + ' — ' + es.topReclaimModel.count + ' ครั้ง',
    'อาการที่พบซ้ำมากที่สุด: ' + es.topSymptom.symptom + ' — ' + es.topSymptom.count + ' ครั้ง',
    'SKU ที่มีอัตราเคลมสูงสุด: ' + es.topReclaimSku.sku + ' — ' + (es.topReclaimSku.rate * 100).toFixed(1) + '%',
    'Serial ที่เสียซ้ำ (เสีย > 1 ครั้ง): ' + es.repeatSerialCount + ' เครื่อง',
    'ช่วงเวลาที่มีงานเคลมสูงสุด: ' + es.peakMonth.month + ' — ' + es.peakMonth.count + ' ครั้ง'
  ];
  var evidenceRows = [];
  for (var e = 0; e < evidenceLines.length; e++) evidenceRows.push([evidenceLines[e]]);
  dashboardSheet.getRange(row, 1, row + evidenceRows.length - 1, 1).setValues(evidenceRows);
  dashboardSheet.getRange(row, 1, row + evidenceRows.length - 1, 1).setFontSize(10).setBackground(dataBg1);

  dashboardSheet.setFrozenRows(1);
  dashboardSheet.setColumnWidth(1, 120);
  dashboardSheet.setColumnWidth(2, 120);
  dashboardSheet.setColumnWidth(3, 200);
  for (var col = 4; col <= 14; col++) dashboardSheet.setColumnWidth(col, 140);

  SpreadsheetApp.getUi().alert('Dashboard สร้างเสร็จแล้ว! อัพเดทล่าสุด: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss'));
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Dashboard')
    .addItem('สร้าง / อัพเดท Dashboard', 'buildDashboard')
    .addToUi();
}
