# Shelf

A private, mobile-friendly PDF reading room. Upload books, pick up exactly where you left off, save pages, and take notes — synced to your account on every device.

**Live:** https://shelf-sable-seven.vercel.app · **Repo:** https://github.com/hassanabni/shelf

## Stack
- Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui
- pdf.js for rendering · next-themes for light/dark
- Private Vercel Blob for books, progress, bookmarks and notes
- Cookie sessions (JWT via `jose`), PBKDF2 password hashing
- IndexedDB cache for instant, offline-capable reading

## Local development
```bash
npm install
vercel env pull .env.local   # BLOB_READ_WRITE_TOKEN, AUTH_SECRET
npm run dev
```

## Deploys
Every push to `main` deploys to production on Vercel. Pushes to other branches get preview URLs.

See [PROMPT.md](PROMPT.md) for the full product spec.
