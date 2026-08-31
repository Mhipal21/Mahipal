# PV Capture — Physical Verification App

A minimal iPhone-friendly PWA for photo-based physical verification.

## What it does
- City, Area, Building and Floor are sticky: enter once and they remain until changed.
- Tap **Take Asset Photo** to open the rear camera on iPhone.
- After each photo enter: Room Number, Sub-location, Asset Name, Quantity, Serial Number (optional), and select who clicked it from a 3-member team.
- Date and time are captured automatically in `dd/mm/yyyy` and `hh:mm:ss`.
- Records and photos are stored locally in the browser using IndexedDB.
- **Export Excel** creates an `.xlsx` file containing the photo in each row plus all captured fields.
- On iPhone the Excel file opens the native Share Sheet where it can be saved to Files, mailed, AirDropped, etc.

## Excel columns
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
12. Clicked By
13. Date
14. Time

## Deploy for iPhone
This is a static web app. Host this folder on any HTTPS host (Netlify, Vercel, GitHub Pages, Cloudflare Pages, etc.). HTTPS is recommended for iPhone/PWA use.

After deployment:
1. Open the HTTPS URL in **Safari** on iPhone.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Launch **PV Capture** from the Home Screen.
5. Open Settings and enter the three team-member names.
6. Enter the fixed City / Area / Building / Floor.
7. Start taking asset photos.

## Important operational note
The app stores photos locally on the iPhone/browser until you export or delete them. iOS may clear website data under storage pressure, so export the Excel periodically during a long verification exercise.

## Excel library
Excel export uses ExcelJS loaded from unpkg.com. Once loaded, the service worker attempts to cache it for later use. If Excel export says the library is unavailable, connect to the internet and reopen the app once.
