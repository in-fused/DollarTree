const fs = require("fs");
const path = require("path");

const PROJECT_ID = "central-fl-dollar-tree";
const INPUT_FILE = path.join(__dirname, "stores_with_coords.json");
const OUTPUT_FILE = path.join(__dirname, "stores_for_supabase_import.csv");

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Input file not found: ${INPUT_FILE}`);
  }

  const raw = fs.readFileSync(INPUT_FILE, "utf8");
  const stores = JSON.parse(raw);

  if (!Array.isArray(stores)) {
    throw new Error("stores_with_coords.json must contain an array.");
  }

  const header = ["project_id", "store_id", "lat", "lng", "full_address"];
  const lines = [header.join(",")];

  for (const store of stores) {
    if (
      store.store_id === undefined ||
      store.lat === undefined ||
      store.lng === undefined ||
      store.full_address === undefined
    ) {
      console.warn("Skipping invalid row:", store);
      continue;
    }

    const row = [
      PROJECT_ID,
      store.store_id,
      store.lat,
      store.lng,
      store.full_address
    ].map(escapeCsv);

    lines.push(row.join(","));
  }

  fs.writeFileSync(OUTPUT_FILE, lines.join("\n"), "utf8");
  console.log(`CSV created: ${OUTPUT_FILE}`);
  console.log(`Rows written: ${lines.length - 1}`);
}

main();
