const assert = require("node:assert/strict");

const resolver = require("./resolve.js");

function testStoragePathScoping() {
  assert.equal(
    resolver._test.isStoragePathScopedToStore(
      "project-a/store-10/1700000000-photo.jpg",
      "project-a",
      "store-10"
    ),
    true
  );
  assert.equal(
    resolver._test.isStoragePathScopedToStore(
      "project-b/store-10/1700000000-photo.jpg",
      "project-a",
      "store-10"
    ),
    false
  );
  assert.equal(
    resolver._test.isStoragePathScopedToStore(
      "project-a/store-11/1700000000-photo.jpg",
      "project-a",
      "store-10"
    ),
    false
  );
  assert.equal(resolver._test.normalizeStoragePath("project-a/store-10/../secret.jpg"), "");
  assert.equal(resolver._test.normalizeStoragePath("https://example.com/photo.jpg"), "");
}

testStoragePathScoping();
console.log("share resolver regression checks passed");
