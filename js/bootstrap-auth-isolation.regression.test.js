const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function testMapConstructorFailureLeavesAuthStateUsable() {
  const context = vm.createContext({
    console: { error() {}, warn() {}, info() {}, log() {} },
    mapboxgl: {
      Map: function BrokenMap() {
        throw new Error("WebGL unavailable");
      }
    },
    supabase: {
      createClient() {
        return { auth: {} };
      }
    },
    localStorage: {
      getItem() {
        return null;
      }
    },
    Set,
    Map,
    Error
  });
  context.window = context;
  context.globalThis = context;

  const source = fs.readFileSync(path.join(__dirname, "state.js"), "utf8");
  vm.runInContext(source, context, { filename: "state.js" });

  assert.equal(vm.runInContext("map === null", context), true);
  assert.equal(vm.runInContext("mapInitializationError instanceof Error", context), true);
  assert.equal(vm.runInContext("typeof currentSession", context), "object");
  assert.equal(vm.runInContext("typeof currentUser", context), "object");
  assert.equal(vm.runInContext("typeof SUPABASE_URL", context), "string");
}

testMapConstructorFailureLeavesAuthStateUsable();
console.log("bootstrap auth-isolation regression checks passed");
