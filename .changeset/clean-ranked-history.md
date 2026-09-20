---
"taiwan-exchange-rates": patch
---

Exclude unavailable quotes from price and top-N spread rankings, and return the CLI no-data status for empty ranked results. Invalidate pending cache fills when clearing the cache and use usage exits for invalid CLI numbers. Reject non-finite history quotes before writing, and render history with the selected cash or spot quote type.
