# ChatGPT-Lite

A **lightweight macOS desktop app for ChatGPT only**. Use [chatgpt.com](https://chatgpt.com) as a standalone app instead of keeping it in a browser tab.

Built with Electron and Svelte, it wraps the ChatGPT web app with a focused window, saved size/position, keyboard shortcuts, zoom, and a strict domain allowlist so only ChatGPT and auth-related sites run inside the app.

### Download

Pre-built macOS apps (DMG, ZIP) are available on [**Releases**](https://github.com/es-studio/ChatGPT-Lite/releases). Download the latest version and open the app.

---

## Why use this app

- **ChatGPT only**: No browser tabs or other sites—just the chat interface in its own window.
- **Feels like a native app**: Own window, Dock icon, remembered size and position, keyboard shortcuts.
- **Controlled access**: Only ChatGPT, OpenAI, and auth domains load in the app; other links open in your system browser.
- **Minimal**: No extra features—just the webview and the controls you need.

---

## Features

| Feature | Description |
|--------|-------------|
| **ChatGPT webview** | Loads `https://chatgpt.com/` inside the app. |
| **Domain allowlist** | chatgpt.com, openai.com, and OAuth/auth domains only; everything else opens in the default browser. |
| **Keyboard shortcuts** | New chat (`Cmd+Shift+N`), Quick switcher (`Cmd+P`), Sidebar toggle (`Cmd+B`). |
| **Zoom** | 50%–300% zoom. |
| **Window state** | Saves and restores window size and position. |
| **Security** | contextIsolation, sandbox, nodeIntegration disabled. |

---

## Tech stack

- **Electron 34** — desktop runtime  
- **Svelte 5** — UI  
- **TypeScript 5.7** — language  
- **Vite 6** + vite-plugin-electron — build  
- **Vitest** — tests  
- **electron-builder** — macOS DMG/ZIP packaging  

---

## Install and run

### Requirements

- Node.js 18+
- pnpm

### Development

```bash
pnpm install
pnpm dev
```

If Electron is blocked by pnpm policy:

```bash
pnpm install --force
pnpm dev
```

### Production build

```bash
pnpm build
```

### macOS distributable (DMG, ZIP)

```bash
pnpm dist:mac
```

Output is in the `release/` folder.

### Tests

```bash
pnpm test
```

---

## Project structure

```
electron/           # Electron main process (window, security, IPC, state)
src/                # Svelte app
  ├── App.svelte    # Main UI (webview, loading/error, controls)
  ├── main.ts       # App entry
  ├── lib/          # Domain policy and utilities
  └── test/         # Unit tests
build/              # Icons and other build assets
```

---

## Publishing a release

To ship a new version and attach build artifacts to GitHub Releases:

```bash
# 1. Build macOS app (output in release/)
pnpm dist:mac

# 2. Bump version in package.json if needed, then commit and push
git add . && git commit -m "release: v0.1.0" && git push

# 3. Create and push a tag (use the same version as package.json)
git tag v0.1.0
git push origin v0.1.0

# 4. Create GitHub Release with DMG and ZIP attached
gh release create v0.1.0 release/*.dmg release/*.zip --title "v0.1.0" --notes "Release notes here"
```

For later versions, repeat with a new tag (e.g. `v0.1.1`) and update the release notes.

---

## License

MIT. You may use, modify, and distribute the software; copies and substantial portions must include the copyright and license notice (see [LICENSE](LICENSE)).

---

## Contributing

Issues and pull requests are welcome.
