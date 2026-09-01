# PRS.AssetVerify — Version 5

Version 5 is a fresh multi-company physical-verification PWA designed for iPhone/Safari and shared team use.

## Main workflow

1. Welcome page → **Create Company** or **Existing Company**.
2. Each company is a separate workspace/tunnel with its own users, photos and records.
3. Users login with a company-specific username/password and have either **Admin** or **Verifier** rights.
4. Admin can manage users, edit/delete the company and delete verification photos.
5. Verifier can capture, upload, edit, search, export and view shared records, but cannot delete photos or manage users/company settings.
6. City, Area, Building, Floor and Room stay sticky until manually changed.
7. Camera or gallery photos are compressed to approximately 1 MB or less before upload.
8. OpenAI vision suggests all visible asset types and quantities; all suggestions remain editable.
9. Each asset row includes quantity, condition, Found / Not Found / Pending status, not-found reason, serial number and barcode/asset tag.
10. Search by location and filter by condition / Found status.
11. Usage screen shows company photo storage against a 10 GB reference bar.
12. Excel export includes embedded photos and all captured fields.

## Fresh start from Version 4

Version 5 uses new D1 tables prefixed with `v5_`. Version 4 demo records are not shown in Version 5. Old Version 4 objects can be removed from R2 separately later if you want to reclaim the small amount of space they use.

## Password recovery

Passwords are stored as salted PBKDF2 hashes, so the original password is deliberately not recoverable. **Forgot password** creates a 6-digit reset code and sends it to `mahipal.office21@gmail.com` when an email delivery binding/webhook is configured. This is safer than emailing the original password.

See `V5_SETUP.md` for deployment steps.
