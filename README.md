# Arena Zine Maker

A browser-based editor for composing printable zines from your [Are.na](https://www.are.na) channels.

## What it does

Connect your Are.na account and browse your channels in the sidebar. Drag images, text, and links from any channel onto a canvas and arrange them into a zine layout. Blocks can be moved, resized, rotated, cropped, and layered. When your layout is ready, export it as a PDF sized for A4, Letter, A5, or half-letter booklet printing.

## Features

- Drag-and-drop blocks from Are.na channels onto multi-page layouts
- Resize and reposition blocks freely on the canvas
- Rotate blocks with a drag handle (Shift snaps to 15°)
- Per-block controls: opacity, corner radius, circle crop, image pan, layer order
- Undo up to 10 actions with Cmd+Z
- Export to PDF (A4, Letter, A5, half-letter)
- Layout auto-saves to your browser between sessions

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), paste your Are.na personal access token (generate one at [dev.are.na/oauth/applications](https://dev.are.na/oauth/applications)), and start building.

Your token is stored locally in the browser and is never included in the code or sent anywhere except Are.na.

## Tech

Vite · React · TypeScript · Zustand · @dnd-kit · @react-pdf/renderer · Tailwind CSS
