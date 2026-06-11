# Invalid Fixture Coverage

The invalid fixture scenarios are generated in `tests/core.test.ts` so each case can be kept minimal and isolated. Covered cases include duplicate ids/names, missing body, missing Markdown links, missing view embeds, invalid enum fields, aliases to missing uids, alias/name conflicts, forbidden body embeds, dependency cycles, forbidden TeX macros, allowed macros inside code, and embeds with pipe syntax.
