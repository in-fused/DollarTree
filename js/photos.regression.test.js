const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function testPhotoUploadSingleFlight() {
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    document: {},
    currentModalStoreId: "100"
  });
  context.window = context;
  context.globalThis = context;

  const source = fs.readFileSync(path.join(__dirname, "photos.js"), "utf8");
  vm.runInContext(source, context, { filename: "photos.js" });

  let invocationCount = 0;
  let releaseUpload;
  context.performPhotoUpload = () => {
    invocationCount += 1;
    return new Promise(resolve => {
      releaseUpload = resolve;
    });
  };
  context.setPhotoMessage = () => {};

  const first = context.uploadPhoto("100");
  const second = context.uploadPhoto("101");
  assert.strictEqual(second, first);
  assert.equal(invocationCount, 1);

  releaseUpload();
  await first;
  await Promise.resolve();

  context.performPhotoUpload = async () => {
    invocationCount += 1;
  };
  await context.uploadPhoto("101");
  assert.equal(invocationCount, 2);
}

function testModalDoesNotDoubleBindUpload() {
  const modalSource = fs.readFileSync(path.join(__dirname, "modal-store.js"), "utf8");
  assert.doesNotMatch(
    modalSource,
    /uploadPhotoBtn\.onclick\s*=\s*\(\)\s*=>\s*uploadPhoto/,
    "modal-store must not add a second photo upload handler"
  );
}

testPhotoUploadSingleFlight()
  .then(() => {
    testModalDoesNotDoubleBindUpload();
    console.log("photo upload regression checks passed");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
