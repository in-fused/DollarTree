const assert = require("node:assert/strict");

const handler = require("./send.js");

async function testServerlessHandlerIsDiscoverableAndRejectsGet() {
  const headers = {};
  let body = "";
  const req = {
    method: "GET",
    headers: {},
    url: "/api/project-invites/send"
  };
  const res = {
    statusCode: 0,
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    end(value = "") {
      body = String(value || "");
    }
  };

  await handler(req, res);
  assert.equal(res.statusCode, 405);
  assert.equal(headers.allow, "POST");
  assert.deepEqual(JSON.parse(body), {
    ok: false,
    error: {
      code: "method_not_allowed",
      message: "Only POST is supported."
    }
  });
}

testServerlessHandlerIsDiscoverableAndRejectsGet()
  .then(() => console.log("project invite serverless regression checks passed"))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
