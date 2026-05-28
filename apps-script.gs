/**
 * Transport ERP Lite v0.4.0-performance-layout
 * Google Apps Script backend for Google Sheet database.
 *
 * Setup:
 * 1) Create Google Sheet.
 * 2) Extensions > Apps Script.
 * 3) Paste this file.
 * 4) Project Settings > Script Properties:
 *    APP_TOKEN = your-random-token
 * 5) Deploy > New deployment > Web app.
 */

const TABLE_HEADERS = {
  customers: [
    'id', 'name', 'tax_id', 'billing_address', 'revenue_type',
    'credit_term_days', 'default_wht_rate', 'default_vat_rate',
    'is_active', 'created_at', 'updated_at'
  ],
  trip_runs: [
    'id', 'trip_no', 'customer_id', 'customer_name', 'trip_date',
    'origin_name', 'destination_name', 'route_name', 'vehicle_type',
    'vehicle_mode', 'vehicle_no', 'driver_name', 'subcontractor_name',
    'freight_income_amount', 'freight_wht_rate', 'freight_vat_rate',
    'driver_trip_pay', 'subcontractor_pay_amount', 'subcontractor_wht_rate',
    'subcontractor_vat_rate', 'note', 'status', 'approved_at',
    'created_at', 'updated_at'
  ],
  trip_expenses: [
    'id', 'trip_run_id', 'description', 'leg', 'amount', 'paid_by',
    'payee_name', 'deduct_from_driver', 'deduction_amount',
    'deduction_target_type', 'payment_status', 'deduction_status',
    'vat_rate', 'wht_rate', 'created_at'
  ],
  trip_special_items: [
    'id', 'trip_run_id', 'description', 'leg', 'bill_to_customer',
    'customer_charge_calc_type', 'customer_charge_rate',
    'customer_charge_amount', 'customer_wht_rate', 'customer_vat_rate',
    'payable_to_party', 'payable_calc_type', 'payable_rate',
    'payable_amount', 'payable_wht_rate', 'payable_vat_rate',
    'payee_name', 'note', 'billing_status', 'payment_status', 'created_at'
  ],
  hr_settlement_items: [
    'id', 'trip_run_id', 'trip_no', 'source_type', 'source_id',
    'target_type', 'target_name', 'item_type', 'direction',
    'description', 'amount', 'vat_rate', 'wht_rate', 'status',
    'approved_at', 'created_at'
  ],
  subcontractor_settlement_items: [
    'id', 'trip_run_id', 'trip_no', 'source_type', 'source_id',
    'target_type', 'target_name', 'item_type', 'direction',
    'description', 'amount', 'vat_rate', 'wht_rate', 'status',
    'approved_at', 'created_at'
  ],
  accounting_queue_items: [
    'id', 'source_type', 'source_id', 'accounting_side', 'queue_type',
    'document_type_hint', 'party_type', 'party_name', 'description',
    'amount_before_vat', 'vat_rate', 'vat_amount', 'wht_rate',
    'wht_amount', 'net_amount', 'status', 'document_id', 'created_at'
  ],
  accounting_documents: [
    'id', 'document_no', 'document_type', 'queue_item_id', 'source_type',
    'source_id', 'party_type', 'party_name', 'description',
    'amount_before_vat', 'vat_rate', 'vat_amount', 'wht_rate',
    'wht_amount', 'net_amount', 'status', 'created_at'
  ],
  audit_logs: [
    'id', 'action', 'table_name', 'record_id', 'message', 'created_at'
  ]
};

function doGet() {
  return jsonOutput({
    ok: true,
    name: 'Transport ERP Lite API',
    version: 'v0.4.0-performance-layout',
    time: new Date().toISOString()
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(25000);

    const body = parseBody(e);
    assertToken(body.token);

    const action = body.action;
    const payload = body.payload || {};
    ensureSchema(action === 'initSheets');
    let result;

    if (action === 'initSheets') {
      result = { initialized: true, tables: Object.keys(TABLE_HEADERS) };
      addAudit('initSheets', 'system', '', 'Initialized sheets');
    } else if (action === 'listAll') {
      result = readAllTables();
    } else if (action === 'createCustomer') {
      appendObject('customers', payload.customer);
      addAudit('createCustomer', 'customers', payload.customer.id, payload.customer.name);
      result = { customer: payload.customer };
    } else if (action === 'createTrip') {
      appendObject('trip_runs', payload.trip);
      appendObjects('trip_expenses', payload.expenses || []);
      appendObjects('trip_special_items', payload.specials || []);
      addAudit('createTrip', 'trip_runs', payload.trip.id, payload.trip.trip_no);
      result = {
        trip: payload.trip,
        expenses: payload.expenses || [],
        specials: payload.specials || []
      };
    } else if (action === 'approveTrip') {
      updateById('trip_runs', payload.trip_id, {
        status: 'approved',
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      const generated = payload.generated || {};
      appendObjects('accounting_queue_items', generated.accounting_queue_items || []);
      appendObjects('hr_settlement_items', generated.hr_settlement_items || []);
      appendObjects('subcontractor_settlement_items', generated.subcontractor_settlement_items || []);

      addAudit('approveTrip', 'trip_runs', payload.trip_id, 'Approved trip and generated queue/settlement');
      result = generated;
    } else if (action === 'approveSettlementItem') {
      const tableName = payload.table_name;
      if (!TABLE_HEADERS[tableName]) throw new Error('Invalid settlement table');

      updateById(tableName, payload.item_id, {
        status: 'approved',
        approved_at: new Date().toISOString()
      });
      appendObject('accounting_queue_items', payload.queue_item);

      addAudit('approveSettlementItem', tableName, payload.item_id, 'Approved settlement item');
      result = { queue_item: payload.queue_item };
    } else if (action === 'createAccountingDocument') {
      updateById('accounting_queue_items', payload.queue_id, {
        status: 'documented',
        document_id: payload.document.id
      });
      appendObject('accounting_documents', payload.document);

      addAudit('createAccountingDocument', 'accounting_documents', payload.document.id, payload.document.document_no);
      result = { document: payload.document };
    } else {
      throw new Error('Unknown action: ' + action);
    }

    return jsonOutput({ ok: true, data: result });
  } catch (error) {
    return jsonOutput({
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (releaseError) {
      // ignore release errors
    }
  }
}

function parseBody(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Empty request body');
  }
  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error('Invalid JSON body');
  }
}

function assertToken(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
  if (!expected) {
    throw new Error('APP_TOKEN is not set in Script Properties');
  }
  if (token !== expected) {
    throw new Error('Invalid API token');
  }
}


function ensureSchema(force) {
  const props = PropertiesService.getScriptProperties();
  const schemaVersion = 'v0.4.0';
  if (force || props.getProperty('SCHEMA_VERSION') !== schemaVersion) {
    ensureSheets();
    props.setProperty('SCHEMA_VERSION', schemaVersion);
  }
}

function ensureSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(TABLE_HEADERS).forEach(function(tableName) {
    let sheet = ss.getSheetByName(tableName);
    if (!sheet) {
      sheet = ss.insertSheet(tableName);
    }

    const headers = TABLE_HEADERS[tableName];
    const currentLastColumn = Math.max(sheet.getLastColumn(), headers.length);
    const firstRow = sheet.getRange(1, 1, 1, currentLastColumn).getValues()[0];
    const hasHeaders = firstRow.some(function(value) { return String(value || '').trim() !== ''; });

    if (!hasHeaders) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      return;
    }

    const existingHeaders = firstRow.map(function(value) { return String(value || '').trim(); });
    let changed = false;

    headers.forEach(function(header) {
      if (existingHeaders.indexOf(header) === -1) {
        existingHeaders.push(header);
        changed = true;
      }
    });

    if (changed) {
      sheet.getRange(1, 1, 1, existingHeaders.length).setValues([existingHeaders]);
    }
    sheet.setFrozenRows(1);
  });
}

function readAllTables() {
  const result = {};
  Object.keys(TABLE_HEADERS).forEach(function(tableName) {
    result[tableName] = readTable(tableName);
  });
  return result;
}

function readTable(tableName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(tableName);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const headers = values[0].map(function(value) { return String(value || '').trim(); });

  return values.slice(1)
    .filter(function(row) {
      return row.some(function(value) { return value !== '' && value !== null; });
    })
    .map(function(row) {
      const object = {};
      headers.forEach(function(header, index) {
        if (header) object[header] = normalizeCell(row[index]);
      });
      return object;
    });
}

function appendObjects(tableName, objects) {
  const rows = objects || [];
  if (!rows.length) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(tableName);
  if (!sheet) throw new Error('Sheet not found: ' + tableName);

  const headers = getHeaders(sheet);
  const values = rows.map(function(object) {
    return headers.map(function(header) {
      return object && object[header] !== undefined ? object[header] : '';
    });
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
}

function appendObject(tableName, object) {
  if (!object) return;
  appendObjects(tableName, [object]);
}

function updateById(tableName, id, patch) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(tableName);
  if (!sheet) throw new Error('Sheet not found: ' + tableName);

  const headers = getHeaders(sheet);
  const idColumnIndex = headers.indexOf('id');
  if (idColumnIndex === -1) throw new Error('Missing id column: ' + tableName);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Record not found: ' + id);

  const idValues = sheet.getRange(2, idColumnIndex + 1, lastRow - 1, 1).getValues();
  let targetRow = -1;

  for (let index = 0; index < idValues.length; index += 1) {
    if (String(idValues[index][0]) === String(id)) {
      targetRow = index + 2;
      break;
    }
  }

  if (targetRow === -1) throw new Error('Record not found: ' + id);

  Object.keys(patch || {}).forEach(function(key) {
    const columnIndex = headers.indexOf(key);
    if (columnIndex !== -1) {
      sheet.getRange(targetRow, columnIndex + 1).setValue(patch[key]);
    }
  });
}

function getHeaders(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return [];
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map(function(value) { return String(value || '').trim(); });
}

function normalizeCell(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function addAudit(action, tableName, recordId, message) {
  appendObject('audit_logs', {
    id: 'AUD-' + Date.now() + '-' + Math.random().toString(16).slice(2, 8),
    action: action,
    table_name: tableName,
    record_id: recordId,
    message: message,
    created_at: new Date().toISOString()
  });
}

function jsonOutput(object) {
  return ContentService
    .createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}
