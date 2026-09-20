# taiwan-exchange-rates

## 0.2.0

### Minor Changes

- 28dd17a: Add a reusable rate client with process-local caching, concurrent miss coalescing, and provider scheduling controls.
- 28dd17a: Add a local read-only HTTP API and accessible dependency-free exchange-rate web interface.
- 28dd17a: Add bank metadata, live currency discovery, multi-currency comparison, CSV output, and CLI query controls.
- 28dd17a: Add minimum-Node-compatible test tooling, packed-package verification, and scheduled live contract checks for every bank provider.
- 28dd17a: Add customer-intent rate ranking helpers and structured all-bank failure results.
- 28dd17a: Add versioned JSONL history APIs and customer buy or sell threshold alerts.

### Patch Changes

- 9df4b9c: Exclude unavailable quotes from price and top-N spread rankings, and return the CLI no-data status for empty ranked results. Invalidate pending cache fills when clearing the cache and use usage exits for invalid CLI numbers. Reject non-finite history quotes before writing, and render history with the selected cash or spot quote type.
- ff7f785: Reject direct price sorting without a customer action. Show an explicit no-usable-rates warning for empty web results instead of claiming partial success.
- cc5d757: Treat an empty currency filter as unfiltered in rate queries. Return HTTP 500 for history storage and record failures while preserving HTTP 400 for invalid queries through a dedicated RangeError-compatible HistoryQueryError.
- a097a5c: Keep web results consistent with their requested quote type and ignore superseded responses and errors. Preserve snapshot recording timestamps and order in CLI history tables without changing JSON or CSV output schemas.

## 0.1.0

### Minor Changes

- 0f511a8: Add the typed 17-bank exchange-rate library and `twrate` CLI.
