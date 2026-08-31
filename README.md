# PV Capture — Physical Verification App v3

An iPhone-friendly PWA for fast photo-based fixed-asset physical verification with AI-assisted multi-asset detection and Excel reporting.

## Capture workflow

### Sticky fields — enter once, change only when needed
1. City
2. Area
3. Building
4. Floor Number
5. Room Number

### For each photo
- Take a new photo with the rear camera **or upload from the iPhone gallery**.
- Date and time are captured automatically.
- Enter Sub-location.
- Select which of the 3 team members clicked the photo.
- Add optional Remarks.
- AI can automatically detect multiple asset types and quantities from one photo.
- Every AI-created asset row is editable.
- You can add/delete asset rows manually.
- Each asset row includes:
  - Name of Asset
  - Quantity
  - Serial Number
  - Barcode / Asset Tag
  - Condition: Good / Fair / Poor / Damaged / Under Repair
  - Not Found Reason: Missing / Disposed / Transferred / Stolen / Under Maintenance / Not applicable

Example: a cabin photo showing 3 chairs, 1 PC, 1 table and 1 AC can produce four editable rows automatically.

## Crash / refresh protection
- Photos and records are saved in IndexedDB on the device before Excel export.
- Saved records are grouped under **All + one tab for each team member**.
- Records older than **30 days** are automatically deleted when the app opens.
- The app requests persistent browser storage when iOS/browser support allows it.
- Because website storage is still controlled by iOS, periodically export important work during very large verification exercises.

## Excel output
The Excel export contains:
1. Sr No
2. Photo
3. City
4. Area
5. Building
6. Floor Number
7. Room Number
8. Sub-location
9. Name of Asset
10. Quantity
11. Serial Number
12. Barcode / Asset Tag
13. Condition
14. Not Found Reason
15. Remarks
16. Clicked By
17. Date
18. Time

If one photo contains several asset types, the Excel contains one row per asset type while the photo is shown once for that photo group.

If a team-member tab is selected, **Export Excel** exports only that member's stored photos. The All tab exports everybody.

## AI architecture
Do not place your OpenAI API key in GitHub Pages. The public PWA sends a compressed photo to the included Cloudflare Worker, and the Worker securely calls OpenAI. See `AI_SETUP.md`.

## Updating an existing GitHub Pages installation
Replace these files in the repository root:
- `index.html`
- `app.js`
- `styles.css`
- `sw.js`

Also replace the code in your Cloudflare Worker with:
- `cloudflare-worker/worker.js`

Existing saved records remain compatible; older single-asset records are automatically displayed as one asset row.
