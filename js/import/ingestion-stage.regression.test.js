const assert = require("node:assert/strict");

const stage = require("./ingestion-stage.js");

function testCanonicalProjectedRowsAreAccepted() {
  const result = stage.stageImportBatch({
    sourceHeaders: ["store_id", "store_name", "address_line_1", "city", "state"],
    rawRows: [["100", "Store 100", "1 Main St", "Orlando", "FL"]],
    presetId: "canonical"
  });

  assert.equal(result.isValid, true);
  assert.equal(result.canProceed, true);
  assert.equal(result.acceptedRecords.length, 1);
  assert.equal(result.rejectedRows.length, 0);
  assert.equal(result.acceptedRecords[0].store_id, "100");
}

function testCommonStatusLabelsNormalizeToCanonicalValues() {
  const result = stage.stageImportBatch({
    sourceHeaders: ["store_id", "status", "address_line_1", "city", "state"],
    rawRows: [["101", "Complete", "2 Main St", "Orlando", "FL"]],
    presetId: "canonical"
  });

  assert.equal(result.isValid, true);
  assert.equal(result.canProceed, true);
  assert.equal(result.acceptedRecords.length, 1);
  assert.equal(result.rejectedRows.length, 0);
  assert.equal(result.acceptedRecords[0].status, "completed");
}

function testUnknownStatusStillRejects() {
  const result = stage.stageImportBatch({
    sourceHeaders: ["store_id", "status", "address_line_1", "city", "state"],
    rawRows: [["102", "paused", "3 Main St", "Orlando", "FL"]],
    presetId: "canonical"
  });

  assert.equal(result.isValid, false);
  assert.equal(result.canProceed, false);
  assert.equal(result.acceptedRecords.length, 0);
  assert.equal(result.rejectedRows.length, 1);
  assert.equal(result.rejectedRows[0].errors[0].code, "INVALID_STATUS");
}

testCanonicalProjectedRowsAreAccepted();
testCommonStatusLabelsNormalizeToCanonicalValues();
testUnknownStatusStillRejects();
console.log("ingestion-stage regression checks passed");
