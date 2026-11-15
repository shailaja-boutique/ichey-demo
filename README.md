# ICHEY Coming Soon

Static landing page for **ICHEY** — brand identity and launch announcement only. Suitable for GitHub Pages or any static host.

## Project structure

```
ichey_demoo/
├── index.html
├── styles.css
├── assets/images/
│   ├── ichey-logo.png
│   ├── google-play-badge.svg
│   └── apple-app-store-badge.svg
└── README.md
```

## Preview locally

From the project folder:

**Python 3:**

```bash
cd C:\Users\aruns\Downloads\ichey_demoo
python -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

**PowerShell (no Python):**

```powershell
cd C:\Users\aruns\Downloads\ichey_demoo
npx --yes serve -l 8080
```

## Logo asset

Place or replace the finalized toy-box logo at:

`assets/images/ichey-logo.png`

The site expects this file unchanged (original colours and transparency).

## Adding app store links later

In `index.html`, replace the non-clickable `<div class="store-badge">` blocks with `<a class="store-badge" href="...">` elements (see the HTML comment above the badges section). Remove the “Coming soon” labels when URLs are live.

## Deploy to GitHub Pages

1. Initialize a git repository in this folder (if you have not already):

   ```bash
   git init
   git add .
   git commit -m "Add ICHEY coming soon page"
   ```

2. Create a new GitHub repository and push:

   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/ichey-coming-soon.git
   git branch -M main
   git push -u origin main
   ```

3. In GitHub: **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main** / **/ (root)**

4. After deployment, the site is available at  
   `https://YOUR_USERNAME.github.io/ichey-coming-soon/`

### Custom domain (`ichey.in`) later

1. In the same **Pages** settings, set **Custom domain** to `ichey.in` (or `www.ichey.in`).
2. At your domain registrar, add DNS records as GitHub instructs (typically `A` records for the apex and/or a `CNAME` for `www`).
3. Enable **Enforce HTTPS** once DNS has propagated.

Do not change DNS until you are ready to point the live domain at this temporary page.

## Notes

- No backend, build step, or npm dependencies are required for the site itself.
- The logo PNG is large (~1.4 MB); compressing it with a lossless tool can improve load time without changing appearance.