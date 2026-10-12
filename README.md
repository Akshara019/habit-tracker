# Habit Flow - Habit Tracker (WTL Project)

## Run on your laptop (Windows)
1. Install Node.js LTS from https://nodejs.org (one time).
2. Extract this ZIP completely.
3. Double-click **start.bat**. It installs packages the first time, starts the server and opens http://localhost:3000.
   Keep the black window open. Close it to stop the server.

(Terminal way: open PowerShell in this folder, run `npm install` then `npm start`.
If PowerShell blocks scripts, use `npm.cmd install` and `npm.cmd start`.)

## Put it online (free link)
1. Create a GitHub repository and upload everything in this folder (node_modules is not needed).
2. On https://render.com choose New > Web Service, connect the repository.
3. Build Command: `npm install`   Start Command: `npm start`   Instance type: Free.
4. When the build finishes, Render shows your public link (https://....onrender.com).

Free plan notes: the site sleeps after ~15 minutes without visitors (first load is slow),
and saved data resets to the sample data in data/db.json whenever it restarts.

Do not double-click public/index.html: the pages need the server.
