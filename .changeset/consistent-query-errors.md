---
"taiwan-exchange-rates": patch
---

Treat an empty currency filter as unfiltered in rate queries. Return HTTP 500 for history storage and record failures while preserving HTTP 400 for invalid queries through a dedicated RangeError-compatible HistoryQueryError.
