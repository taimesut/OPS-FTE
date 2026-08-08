# Station ID Configuration Design

## Goal

Replace every hard-coded source/destination station name and ID with user-managed Hub/SOC configuration.

## Configuration Format

The current SOC, internal Hubs, and external SOCs use `Name | ID`. The current SOC is one entry; Hub and destination-SOC fields accept one entry per line. Names remain the display and packed-TO `receiver` values. IDs are used by the loose-order endpoint.

Persist the existing name arrays for compatibility and add `soc_id`, `hub_ids`, and `soc_ids` lookup fields. Existing name-only configuration loads without data loss, but saving requires every station to have an ID. Reject empty names, empty IDs, duplicate names, and duplicate IDs across the current SOC, Hubs, and destination SOCs.

## Route Data Flow

For internal checks, build the loose-order request from the configured current-SOC ID and selected-Hub ID. For external checks, resolve all names in the selected SOC group to IDs and send them as a comma-separated destination-ID list. Packed TO queries continue using station names.

The loose-order payload is created at request time. No default route remains in source. Route labels in the summary receive configured names and IDs from the page.

## Removal of Defaults

Remove the fixed `Pleiku SOC`, `1030`, and `1069` filters, labels, layout fallback, tests, and sample-config action. Filters compare `current_station_name` with the configured current SOC name.

## Errors and Migration

Settings validation stops invalid configuration from being saved and shows a specific toast. Runtime checks stop a search when the selected route lacks an ID and direct the user to Settings. Imported legacy JSON remains readable and can be completed in the editor.

## Verification

Unit-test line parsing, duplicate validation, station lookup, and dynamic loose-order payload creation. Run tests, targeted lint, TypeScript/Vite build, and synchronize `dist/index.html` to the Apps Script artifact.
