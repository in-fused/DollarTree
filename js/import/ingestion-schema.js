/* ================= INGESTION SCHEMA (PHASE 11.2.a) ================= */

// Canonical schema version for the reusable ingestion foundation.
const INGESTION_SCHEMA_VERSION = "11.2.0-foundation";

// Status values accepted by canonical ingestion records.
const INGESTION_STATUS_VALUES = Object.freeze([
  "active",
  "rescheduled",
  "completed",
  "closed"
]);

// Canonical field contract for store-level ingestion.
const INGESTION_REQUIRED_FIELDS = Object.freeze([
  "store_id"
]);

const INGESTION_OPTIONAL_FIELDS = Object.freeze([
  "full_address",
  "address_line_1",
  "address_line_2",
  "city",
  "state",
  "postal_code",
  "region",
  "territory",
  "status",
  "status_reason",
  "completed",
  "closed",
  "latitude",
  "longitude",
  "notes_count",
  "photos_count",
  "last_activity_at",
  "source_row_index"
]);

// Default values are applied by future normalizer modules only.
const INGESTION_DEFAULT_VALUES = Object.freeze({
  status: "active",
  status_reason: "",
  completed: false,
  closed: false,
  notes_count: 0,
  photos_count: 0,
  last_activity_at: "",
  source_row_index: -1
});

// Boolean-style values accepted from spreadsheets/CSVs.
// Keep this intentionally narrow so future modules do not confuse
// boolean normalization with status normalization.
const INGESTION_BOOLEAN_INPUTS = Object.freeze({
  truthy: Object.freeze([
    true,
    "true",
    "t",
    "yes",
    "y",
    "1",
    1,
    "on"
  ]),
  falsy: Object.freeze([
    false,
    "false",
    "f",
    "no",
    "n",
    "0",
    0,
    "off"
  ])
});

// Common incoming header variants mapped to canonical field names.
const INGESTION_FIELD_ALIASES = Object.freeze({
  store_id: Object.freeze([
    "store_id",
    "store id",
    "store#",
    "store #",
    "store number",
    "store_number",
    "store num",
    "storenumber"
  ]),
  full_address: Object.freeze([
    "full_address",
    "full address",
    "address",
    "location",
    "site address"
  ]),
  address_line_1: Object.freeze([
    "address_line_1",
    "address line 1",
    "address1",
    "street",
    "street address",
    "addr1"
  ]),
  address_line_2: Object.freeze([
    "address_line_2",
    "address line 2",
    "address2",
    "suite",
    "unit",
    "addr2"
  ]),
  city: Object.freeze([
    "city",
    "town"
  ]),
  state: Object.freeze([
    "state",
    "st",
    "province",
    "region_state"
  ]),
  postal_code: Object.freeze([
    "postal_code",
    "postal code",
    "zip",
    "zip code",
    "zipcode"
  ]),
  region: Object.freeze([
    "region",
    "market",
    "division"
  ]),
  territory: Object.freeze([
    "territory",
    "district",
    "area"
  ]),
  status: Object.freeze([
    "status",
    "status_code",
    "store status",
    "execution status"
  ]),
  status_reason: Object.freeze([
    "status_reason",
    "status reason",
    "reason",
    "reschedule reason"
  ]),
  completed: Object.freeze([
    "completed",
    "is_completed",
    "complete",
    "done"
  ]),
  closed: Object.freeze([
    "closed",
    "is_closed",
    "store_closed"
  ]),
  latitude: Object.freeze([
    "latitude",
    "lat",
    "y",
    "geo_lat"
  ]),
  longitude: Object.freeze([
    "longitude",
    "lng",
    "lon",
    "x",
    "geo_lng"
  ]),
  notes_count: Object.freeze([
    "notes_count",
    "notes count",
    "note_count",
    "notes"
  ]),
  photos_count: Object.freeze([
    "photos_count",
    "photos count",
    "photo_count",
    "photos",
    "images_count"
  ]),
  last_activity_at: Object.freeze([
    "last_activity_at",
    "last activity",
    "last_update",
    "updated_at",
    "activity_at"
  ]),
  source_row_index: Object.freeze([
    "source_row_index",
    "row",
    "row_index",
    "source row"
  ])
});

const INGESTION_CANONICAL_FIELDS = Object.freeze([
  ...INGESTION_REQUIRED_FIELDS,
  ...INGESTION_OPTIONAL_FIELDS
]);

const INGESTION_CANONICAL_FIELD_SET = new Set(INGESTION_CANONICAL_FIELDS);
const INGESTION_REQUIRED_FIELD_SET = new Set(INGESTION_REQUIRED_FIELDS);
const INGESTION_OPTIONAL_FIELD_SET = new Set(INGESTION_OPTIONAL_FIELDS);

function normalizeSchemaToken(value) {
  return String(value == null ? "" : value)
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_");
}

function getCanonicalFieldNames() {
  return INGESTION_CANONICAL_FIELDS.slice();
}

function getRequiredFieldNames() {
  return INGESTION_REQUIRED_FIELDS.slice();
}

function getOptionalFieldNames() {
  return INGESTION_OPTIONAL_FIELDS.slice();
}

function isRequiredField(fieldName) {
  return INGESTION_REQUIRED_FIELD_SET.has(normalizeSchemaToken(fieldName));
}

function isOptionalField(fieldName) {
  return INGESTION_OPTIONAL_FIELD_SET.has(normalizeSchemaToken(fieldName));
}

function isCanonicalField(fieldName) {
  return INGESTION_CANONICAL_FIELD_SET.has(normalizeSchemaToken(fieldName));
}

function getAcceptedStatusValues() {
  return INGESTION_STATUS_VALUES.slice();
}

function getBooleanNormalizationInputs() {
  return {
    truthy: INGESTION_BOOLEAN_INPUTS.truthy.slice(),
    falsy: INGESTION_BOOLEAN_INPUTS.falsy.slice()
  };
}

function getDefaultValuesPolicy() {
  return {
    ...INGESTION_DEFAULT_VALUES
  };
}

function getFieldAliases() {
  const copy = {};
  Object.keys(INGESTION_FIELD_ALIASES).forEach((canonical) => {
    copy[canonical] = INGESTION_FIELD_ALIASES[canonical].slice();
  });
  return copy;
}

function resolveIncomingFieldName(inputName) {
  const token = normalizeSchemaToken(inputName);
  if (!token) return "";
  if (INGESTION_CANONICAL_FIELD_SET.has(token)) return token;

  for (const canonicalName of Object.keys(INGESTION_FIELD_ALIASES)) {
    const aliases = INGESTION_FIELD_ALIASES[canonicalName];
    for (let i = 0; i < aliases.length; i += 1) {
      if (normalizeSchemaToken(aliases[i]) === token) {
        return canonicalName;
      }
    }
  }

  return "";
}

function getSchemaMetadata() {
  return {
    version: INGESTION_SCHEMA_VERSION,
    requiredFieldCount: INGESTION_REQUIRED_FIELDS.length,
    optionalFieldCount: INGESTION_OPTIONAL_FIELDS.length,
    canonicalFieldCount: INGESTION_CANONICAL_FIELDS.length
  };
}

const ingestionSchema = Object.freeze({
  INGESTION_SCHEMA_VERSION,
  INGESTION_STATUS_VALUES,
  INGESTION_REQUIRED_FIELDS,
  INGESTION_OPTIONAL_FIELDS,
  INGESTION_DEFAULT_VALUES,
  INGESTION_BOOLEAN_INPUTS,
  INGESTION_FIELD_ALIASES,
  normalizeSchemaToken,
  getCanonicalFieldNames,
  getRequiredFieldNames,
  getOptionalFieldNames,
  isRequiredField,
  isOptionalField,
  isCanonicalField,
  getAcceptedStatusValues,
  getBooleanNormalizationInputs,
  getDefaultValuesPolicy,
  getFieldAliases,
  resolveIncomingFieldName,
  getSchemaMetadata
});

if (typeof window !== "undefined") {
  window.ingestionSchema = ingestionSchema;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = ingestionSchema;
}