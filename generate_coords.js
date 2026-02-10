import fs from "fs";

const MAPBOX_TOKEN =
  "pk.eyJ1IjoiaW4tZnVzZWQiLCJhIjoiY21sZ2E2ZzV4MGFmaTNjb2NydW04eXVpaCJ9.3-ZXlPJosjQ4c5bucpnWYA";

const stores = JSON.parse(fs.readFileSync("stores.json", "utf8"));

async function geocode(store) {
  const q = encodeURIComponent(store.full_address);
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json` +
    `?access_token=${MAPBOX_TOKEN}&limit=1&country=US`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.features || !data.features[0]) {
    console.warn("No result for", store.store_id);
    return null;
  }

  const [lng, lat] = data.features[0].center;

  return {
    store_id: store.store_id,
    lat,
    lng,
    full_address: store.full_address
  };
}

async function run() {
  const output = [];

  for (const store of stores) {
    const result = await geocode(store);
    if (result) output.push(result);

    // polite rate limit
    await new Promise(r => setTimeout(r, 120));
  }

  fs.writeFileSync(
    "stores_with_coords.json",
    JSON.stringify(output, null, 2)
  );

  console.log("Done. Generated", output.length, "stores.");
}

run();
