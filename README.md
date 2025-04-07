# md2mm-svg

Convert Markdown into SVG mindmaps using markmap and puppeteer.

## Features

- Support KaTeX
- Local fonts and assets (no CDN needed)
- Compatible with Typora and Markdown editors
- Outputs standards-compliant, clean SVG

## Usage

```bash
node index.js input.md output.svg
```

## Dependencies

- puppeteer
- markmap-lib
- markmap-view

### 📄 `.gitignore`

```gitignore
node_modules/
*.log
*.svg
temp/
```