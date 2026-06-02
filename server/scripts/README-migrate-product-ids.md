# Product ID Migration

This script assigns numeric `productId` values to existing products that either lack a `productId` or have it stored as a string.

Location: `server/scripts/migrate-product-ids.js`

Usage:

- Dry run (no DB changes):

```bash
node scripts/migrate-product-ids.js --dry-run
```

- Dry run with a backup JSON of affected documents:

```bash
node scripts/migrate-product-ids.js --dry-run --backup
```

- Apply changes (writes to DB):

```bash
node scripts/migrate-product-ids.js --backup
```

- Start assigning from a custom id (e.g. 2000):

```bash
node scripts/migrate-product-ids.js --start=2000
```

Notes:
- The script will choose starting `productId` as 1000 or one higher than the current max numeric `productId` unless overridden by `--start`.
- For large production databases, run the script during maintenance windows and ensure you have backups.
- The `--backup` option writes a JSON file `product-id-migration-backup.json` containing the documents that will be processed.
- This script is conservative and checks for collisions; it is not transactional. For high-concurrency environments consider running with appropriate DB locks or using a migration framework.
