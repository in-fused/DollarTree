"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_MAPBOX_TOKEN =
  "pk.eyJ1IjoiaW4tZnVzZWQiLCJhIjoiY21sZ2E2ZzV4MGFmaTNjb2NydW04eXVpaCJ9.3-ZXlPJosjQ4c5bucpnWYA";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function geocode(store, mapboxToken) {
  const address = String(store?.full_address || "").trim();
  if (!address) {
    console.warn("Skipping store without a full_address", store?.store_id || "(unknown)");
    return null;
  }

  const query = encodeURIComponent(address);
  const url =
    "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
    query +
    ".json?access_token=" +
    encodeURIComponent(mapboxToken) +
    "&limit=1&country=US";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Mapbox request failed (${response.status}) for store ${store?.store_id || "(unknown)"}.`);
  }

  const data = await response.json();
  if (!data.features || !data.features[0]) {
    console.warn("No result for store", store?.store_id || "(unknown)");
    return null;
  }

  const [lng, lat] = data.features[0].center;
  return {
    store_id: store.store_id,
    lat,
    lng,
    full_address: address
  };
}

async function run({ inputPath, outputPath, mapboxToken }) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(
      `Input file not found: ${inputPath}\nUsage: node generate_coords.js [input.json] [output.json]`
    );
  }

  const stores = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  if (!Array.isArray(stores)) {
    throw new TypeError(`Expected ${inputPath} to contain a JSON array.`);
  }

  const output = [];
  for (const store of stores) {
    const result = await geocode(store, mapboxToken);
    if (result) output.push(result);
    await sleep(150);
  }

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
  console.log("Generated", output.length, "stores in", outputPath);
}

if (require.main === module) {
  const inputPath = path.resolve(process.argv[2] || "stores.json");
  const outputPath = path.resolve(process.argv[3] || "stores_with_coords.json");
  const mapboxToken = String(process.env.MAPBOX_TOKEN || DEFAULT_MAPBOX_TOKEN).trim();

  run({ inputPath, outputPath, mapboxToken }).catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}

module.exports = { geocode, run };
