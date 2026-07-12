const assert = require("node:assert/strict");

const importApply = require("./import-apply.js");

function testAcceptedRecordPreservesCanonicalStatus() {
  const normalized = importApply.normalizeAcceptedRecord({
    store_id: "300",
    status: "rescheduled",
    status_reason: "Inventory reset",
    latitude: 28.5,
    longitude: -81.4
  }, 0);

  assert.equal(normalized.status_code, "rescheduled");
  assert.equal(normalized.status_reason, "Inventory reset");
  assert.equal(normalized.completed, false);
  assert.equal(normalized.closed, false);
}

function testAcceptedRecordDerivesLegacyFlagsFromStatus() {
  const completed = importApply.normalizeAcceptedRecord({
    store_id: "301",
    status_code: "complete"
  }, 1);
  const closed = importApply.normalizeAcceptedRecord({
    store_id: "302",
    closed: true
  }, 2);

  assert.equal(completed.status_code, "completed");
  assert.equal(completed.completed, true);
  assert.equal(completed.closed, false);
  assert.equal(closed.status_code, "closed");
  assert.equal(closed.completed, false);
  assert.equal(closed.closed, true);
}

testAcceptedRecordPreservesCanonicalStatus();
testAcceptedRecordDerivesLegacyFlagsFromStatus();
console.log("import apply regression checks passed");
