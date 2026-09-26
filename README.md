# Instagram Focus

A minimal browser extension that blocks distracting Instagram content —
posts, reels, Explore, and Channels- while leaving messages, stories,
profiles and settings untouched.

## Features

- **Full block** — Visiting a post, reel, or Channels page shows an
  overlay instead of the content, with quick links to Inbox or Home.
- **Feed & Explore hiding** — Feed posts, reels, and Explore tiles are
  hidden and replaced with a placeholder; stories stay visible.
- **Optional search hiding** — A separate toggle hides the search bar.
- **One master switch** — Turn the whole extension on or off from the popup.

## Installation

**Chrome / Edge / Chromium**

1. Download or clone this repository.
2. Go to `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select the `instagram-focus` folder.

## How it works

- Runs entirely as a content script on `instagram.com` - no network requests.
- Watches for route changes and DOM mutations to catch client-side
  navigation and infinite scroll.
- Uses semantic structure (`<main>`, `<article>`, href patterns) instead of
  Instagram's obfuscated class names, so it holds up across markup changes.

## Privacy

- All data stays local — no external servers, no tracking, no analytics.
- Doesn't read or modify your Instagram account data.
