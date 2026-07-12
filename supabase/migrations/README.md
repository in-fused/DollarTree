# Migration ledger warning

The live project migration ledger currently starts with:

- `20260712144232_core_access_security_hotfix`
- `20260712144943_operational_rls_consolidation`
- `20260712145431_remaining_advisor_cleanup`

The three older SQL files in this directory describe schema that was created or changed ad hoc before migration tracking was established. Do **not** run an unrestricted `supabase db push`: the invite lifecycle file references a legacy column that is not present in the live schema.

Reconcile the older files against a schema-only dump and repair/baseline migration history in a reviewed maintenance change before enabling automated pushes.
