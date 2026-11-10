# Prompt: build "Shelf", a private PDF reading app

Build a mobile-first web app called **Shelf** for reading my own PDF books. Use Next.js (App Router, TypeScript), Tailwind CSS, and shadcn/ui. Deploy it to Vercel. Don't ask questions unless something truly blocks you. Verify every screen with screenshots in light mode, dark mode and at phone width (375px) before you finish.

## Accounts and cloud sync
- Sign-up (name, username, password) and sign-in screens. On first visit show "Create account"; after that show "Welcome back".
- Server-side auth in Next.js route handlers. Hash passwords with PBKDF2 (Node crypto, SHA-256, 200k+ iterations, random salt, timing-safe compare). Sessions are an HS256 JWT (jose) in an httpOnly, secure, SameSite=Lax cookie that lasts 1 year, signed with an `AUTH_SECRET` env var.
- Storage is a **private Vercel Blob store** (`vercel blob create-store <name> --access private`): `users/<username>.json`, `u/<userId>/books/<bookId>.json` (metadata, bookmarks, notes, last page, cover) and `u/<userId>/files/<bookId>.pdf`. Every API route checks the session, and users can only reach their own `u/<userId>/` paths.
- Upload PDFs straight from the browser with `@vercel/blob/client` `upload()` and a `/api/upload` `handleUpload` route. This gets around the 4.5 MB function body limit. Allow only PDFs up to 200 MB, and only to the user's own path. Show upload % progress.
- The library follows the account to every device. Opening a book on a new device downloads it (with % progress) and resumes at the last page read anywhere.
- Keep a per-user IndexedDB cache of metadata and PDF files so books open instantly and work offline. Queue changes made offline and push them when the app comes back online or regains focus.
## Library (home)
- Upload PDFs with a button or by dragging them onto the page. Read the title and page count, and render page 1 as a cover thumbnail.
- Everything is saved to the cloud, so it's still there weeks later on any device. Call `navigator.storage.persist()` so the local cache isn't evicted either.
- A "Continue reading" card at the top for the last-opened book, showing the page, % progress and a Resume link.
- A grid of book covers with progress bars, bookmark and note counts, and a menu to remove a book (with a confirmation dialog). Add search once there are more than 3 books.
- A friendly empty state with an upload call-to-action and three feature cards.

## Reader
- Render pages with pdf.js on a canvas, kept sharp on retina screens. On desktop, fit the whole page; on mobile, fit the width. Add zoom controls.
- **Automatically remember the last page.** Opening a book resumes exactly where I left off.
- A **"Save page"** button in the top bar bookmarks the current page and labels it with a text snippet from that page. Show a ribbon on bookmarked pages and tick marks on the progress slider.
- A **Notes** panel (right side on desktop, bottom sheet on mobile) with Notes and Bookmarks tabs. Add, edit and delete notes for the current page. Tapping a note or bookmark jumps to its page.
- Navigation: prev/next buttons, a page slider, tap-to-jump page number, arrow keys, and swipe on mobile. Tap the left or right edge to turn the page; tap the centre to hide or show the toolbars.
- Shortcuts: B saves the page, N opens notes.
- A "Night pages" toggle that inverts PDF pages for dark-mode reading.

## Design
- Warm, calm, book-like feel. Cream paper tones in light mode and deep warm charcoal in dark mode, with a terracotta accent. Use a serif display font (Fraunces) for headings and Geist for UI text.
- Light, Dark and System theme switch (next-themes).
- Use safe-area insets for iPhone, give tap targets at least 36px, use 16px inputs on mobile (prevents iOS zoom), and keep the page free of horizontal scrolling.
- Writes must be serialized, locally and to the cloud, so a quick page turn can never overwrite a note being saved. When two devices race on the reading position, keep the newest one.
