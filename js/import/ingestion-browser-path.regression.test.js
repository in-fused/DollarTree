const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadBrowserIngestionStack() {
  const context = vm.createContext({ console });
  context.window = context;
  context.globalThis = context;

  [
    "ingestion-schema.js",
    "ingestion-map.js",
    "ingestion-validate.js",
    "ingestion-normalize.js",
    "ingestion-stage.js"
  ].forEach(fileName => {
    const filePath = path.join(__dirname, fileName);
    vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
  });

  return context.ingestionStage;
}

function testBrowserStackPreservesProductionFieldsAndNormalizesStatus() {
  const stage = loadBrowserIngestionStack();
  const result = stage.stageImportBatch({
    sourceHeaders: [
      "store_id",
      "store_name",
      "customer_id",
      "district",
      "division",
      "market",
      "status",
      "address_line_1",
      "city",
      "state"
    ],
    rawRows: [[
      "200",
      "North Store",
      "C-200",
      "District 4",
      "Division East",
      "Metro",
      "Complete",
      "10 Main St",
      "Orlando",
      "FL"
    ]],
    presetId: "canonical"
  });

  assert.equal(result.canProceed, true);
  assert.equal(result.acceptedRecords.length, 1);
  assert.deepEqual(
    {
      store_name: result.acceptedRecords[0].store_name,
      customer_id: result.acceptedRecords[0].customer_id,
      district: result.acceptedRecords[0].district,
      division: result.acceptedRecords[0].division,
      market: result.acceptedRecords[0].market,
      status: result.acceptedRecords[0].status
    },
    {
      store_name: "North Store",
      customer_id: "C-200",
      district: "District 4",
      division: "Division East",
      market: "Metro",
      status: "completed"
    }
  );
}

function testBrowserStackRejectsUnknownStatus() {
  const stage = loadBrowserIngestionStack();
  const result = stage.stageImportBatch({
    sourceHeaders: ["store_id", "status"],
    rawRows: [["201", "paused"]]
  });

  assert.equal(result.canProceed, false);
  assert.equal(result.rejectedRows.length, 1);
  assert.equal(result.rejectedRows[0].errors[0].code, "INVALID_STATUS");
}

function testBrowserStackDerivesLegacyBooleanStatuses() {
  const stage = loadBrowserIngestionStack();
  const importApply = require("./import-apply.js");

  const completedResult = stage.stageImportBatch({
    sourceHeaders: ["store_id", "completed"],
    rawRows: [["202", true]]
  });
  const closedResult = stage.stageImportBatch({
    sourceHeaders: ["store_id", "closed"],
    rawRows: [["203", true]]
  });

  assert.equal(completedResult.canProceed, true);
  assert.equal(closedResult.canProceed, true);
  assert.equal(completedResult.acceptedRecords[0].status, "completed");
  assert.equal(closedResult.acceptedRecords[0].status, "closed");
  assert.equal(
    importApply.normalizeAcceptedRecord(completedResult.acceptedRecords[0], 0).status_code,
    "completed"
  );
  assert.equal(
    importApply.normalizeAcceptedRecord(closedResult.acceptedRecords[0], 0).status_code,
    "closed"
  );
}

testBrowserStackPreservesProductionFieldsAndNormalizesStatus();
testBrowserStackRejectsUnknownStatus();
testBrowserStackDerivesLegacyBooleanStatuses();
console.log("ingestion browser-path regression checks passed");
