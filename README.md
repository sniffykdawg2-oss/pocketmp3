# PocketMP3

PocketMP3 is a mobile-first personal web app/PWA for storing and playing your own local MP3 files and organizing playlists.

## Setup

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Notes

- Uploaded files are stored locally in IndexedDB on this device.
- No backend, accounts, or analytics are included.
- Background playback depends on normal browser support for HTML5 media. iOS/Safari decides whether playback can continue while locked; PocketMP3 can request media controls but cannot guarantee locked-screen playback.
