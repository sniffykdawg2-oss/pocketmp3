# PocketMP3 Converter Backend

This is the deployable backend for YouTube-to-MP3 conversion. It runs `yt-dlp`
and `ffmpeg`, then returns a normalized MP3 to the PocketMP3 web app.

## Render Free Setup

1. Create a Render account at <https://render.com>.
2. Click **New +** -> **Web Service**.
3. Connect the `sniffykdawg2-oss/pocketmp3` GitHub repo.
4. Choose **Docker** for the runtime.
5. Set **Root Directory** to `server`.
6. Choose the **Free** instance type.
7. Add this environment variable:

   ```text
   ALLOWED_ORIGIN=https://sniffykdawg2-oss.github.io
   ```

8. If YouTube blocks Render with "Sign in to confirm you're not a bot", export
   YouTube cookies from your own logged-in browser in Netscape cookies.txt
   format, base64 encode the file, and add it as:

   ```text
   YOUTUBE_COOKIES_B64=PASTE_BASE64_COOKIES_HERE
   ```

9. Deploy.
10. Copy the service URL, for example:

   ```text
   https://pocketmp3-converter.onrender.com
   ```

11. In GitHub, go to **Settings** -> **Secrets and variables** -> **Actions** -> **Variables**.
12. Add a repository variable:

   ```text
   VITE_CONVERTER_API_URL=https://YOUR-RENDER-SERVICE.onrender.com
   ```

13. Re-run the **Deploy GitHub Pages** workflow.

After that, the GitHub Pages frontend will call:

```text
https://YOUR-RENDER-SERVICE.onrender.com/api/convert-youtube
```

## Free Tier Notes

Render Free web services spin down after idle time, so the first conversion after
a quiet period can take about a minute to wake up. Render also has monthly free
usage limits; if no payment method is added, Render suspends services instead of
charging for some overages.

YouTube may rate-limit shared cloud-hosting IPs. Cookies usually help for videos
from your own account, but they are sensitive: keep them only in Render
environment variables, never commit them to the repo.
