# Tenang BC sign-up app — setup guide

No programming needed. Allow about 10 minutes. Do this on a computer, not a phone.

You have two files: `Code.gs` and `Index.html`.

## 1. Create the Google Sheet

1. Go to <https://sheets.new> (sign in with the Google account that will own the app).
2. Name it, e.g. **Tenang BC Minton**.

## 2. Add the code

1. In the Sheet menu: **Extensions → Apps Script**. A new tab opens.
2. You will see a file called `Code.gs` with a few lines in it. Select everything, delete it, and paste the full contents of your `Code.gs`.
3. Click the **+** next to "Files" → **HTML**. Name it exactly `Index` (capital I; Google adds `.html` itself).
4. Delete what is in it and paste the full contents of your `Index.html`.
5. Click the **Save** icon (💾).

## 3. Run setup (once)

1. In the toolbar, open the function dropdown and choose **setup**.
2. Click **Run**.
3. Google asks for permission: **Review permissions** → pick your account → you will see "Google hasn't verified this app" → **Advanced** → **Go to (project name) (unsafe)** → **Allow**. This is normal for your own script; it only gets access to your own Sheets.
4. Wait for "Execution completed".

Go back to the Sheet. You now have three tabs:

| Tab | What it holds |
|---|---|
| `Sesi` | One row per session (old sessions stay here as the archive) |
| `Pemain` | Everyone who signed up, for every session |
| `TarikDiri` | The dropout log |

The first session (next Sunday) is already created, and the admin PIN is **1234**.

## 4. Deploy

1. In the Apps Script tab: **Deploy → New deployment**.
2. Click the gear ⚙ next to "Select type" → **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**, then copy the **Web app URL** (it ends in `/exec`).

That URL is your one permanent link. Pin it in the WhatsApp group.

## 5. First things to do

1. Open the link on your phone.
2. Scroll to the bottom → **🔒 Admin** → enter `1234`.
3. Tap **🔑 Tukar PIN** and set your own PIN (4–8 digits). Do this before sharing the link.

## Weekly routine

1. **🆕 Sesi baru** — date is pre-filled with next Sunday; time, venue, map and shuttle price are copied from the last session.
2. **📋 Salin senarai** (in the admin panel) and paste the list into the group.
3. When ready, **TUTUP senarai**.
4. After the game, enter **Sewa court**, **Bil. shuttle**, **Harga / shuttle** → **Simpan bayaran**.
5. Tick **bayar** as people pay.

## If something goes wrong

**Forgot the PIN.** Apps Script → ⚙ **Project Settings** → scroll to **Script Properties** → edit `ADMIN_PIN` → save.

**"Terlalu banyak PIN salah".** Admin is locked for 10 minutes after 10 wrong PINs. Wait, then try again.

**A member's phone "forgot" them** (their name is in the list but there is no "Tarik diri" button — happens with a new phone, a different browser, private mode, or browsers that block storage). If they registered **with a phone number**, they type the same name and phone number and tap **Hadir ✅** again (or, when the list is closed, **Saya sudah daftar — tunjuk nama saya**). The app reconnects them to their existing entry and their guests. If they registered **without** a phone number, only the admin can help: add their number with ✏️ so they can reconnect, or remove them with 🗑️.

**The link in the copied WhatsApp text is wrong or missing.** Open `Code.gs`, find `APP_URL: ''` near the top, paste your `/exec` link between the quotes, then redeploy (below).

**Changing settings or code later.** Edit the `CONFIG` block at the top of `Code.gs` (max players, default day/time/venue, shuttle price…), save, then:
**Deploy → Manage deployments → ✏️ (edit) → Version: New version → Deploy.**
This keeps the same link. Do **not** use "New deployment" again — that creates a different link.

## Good to know

- You can read the Sheet freely. Avoid editing the `ID`, `Sesi` and `DeviceID` columns by hand; use the admin screen for changes.
- Phone numbers are only in the Sheet and the admin screen. Anyone you share the Sheet itself with can see them, so keep the Sheet private.
- Players are identified by their phone's browser, not by an account. Someone opening the link in a different browser on the same phone counts as a new device.
- Google shows a small grey banner at the top of the page ("This application was created by a Google Apps Script user"). It cannot be removed on free accounts.
