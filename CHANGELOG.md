# Changelog

All notable changes to Tapko CDN Widget are documented here.

## [4.2.0.0] - 2026-05-13

### Added
- Edit feedback — widget users can edit the title of their own pins inline; changes are saved to the backend with ownership verification
- Delete feedback — widget users can delete their own pins with an in-card confirmation step before the request fires
- "Edited" badge on pin detail cards for modified feedback
- `deleteFeedback` and `updateFeedback` API client methods with explicit `userId` for backend ownership checks
- Redirect detection in `APIClient._request` — logs a clear error when a 3xx is received instead of silently failing on CORS pre-flight

### Changed
- `DELETE` API requests can now carry a JSON body (needed to send `userId` for user-initiated deletes)
- `isOwner` flag from backend response gates Edit/Delete button visibility on pin detail cards
- `editedAt` stored as Unix ms (matching backend/DynamoDB contract) rather than ISO string

### Fixed
- Annotation coordinates now scale correctly from drawing-canvas space to screenshot image space — fixes misaligned annotations on screenshots captured at different resolutions (e.g. Screen Capture API resolution caps)
- `outsideClickHandler` is now removed when `showPinDetail` replaces an already-open card, preventing the new card from closing on the next document click
- `err.message` in save-failure error UI now escaped via `_escapeHTML` to prevent HTML injection from server error text
- `updateFeedback` now throws immediately if `userId` is undefined rather than silently dropping the field from the request body
- Delete operation now removes IndexedDB pin record before removing the card DOM element, so a storage failure restores the card with an error state instead of leaving an orphaned pin dot
