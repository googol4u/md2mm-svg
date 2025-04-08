#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');
const {
    Command
} = require('commander');
const {
    Transformer
} = require('markmap-lib');
const puppeteer = require('puppeteer');

const program = new Command();

program
.name('md2svg')
.description('Markdown to SVG Mindmap CLI Tool (Uses Local node_modules Dependencies)')
.version('1.0.0')
.argument('<input>', 'Input Markdown File')
.argument('[output]', 'Output SVG File，defaults to the input filename without extension, and add .svg.')
.action(async(input, output) => {
    const inputPath = path.resolve(input);
    const outputPath = output ? path.resolve(output) : inputPath.replace(/\.md$/, '.svg');

    if (!fs.existsSync(inputPath)) {
        console.error('File Not Found:', inputPath);
        process.exit(1);
    }

    const markdownContent = fs.readFileSync(inputPath, 'utf-8');
    const transformer = new Transformer();
    const {
        root
    } = transformer.transform(markdownContent);

    // Serve static files using the built-in HTTP server.
    const server = http.createServer((req, res) => {
        let filePath = path.join(__dirname, req.url === '/' ? 'template.html' : req.url);

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }

            const ext = path.extname(filePath).slice(1);
            const mimeType = {
                'html': 'text/html',
                'js': 'application/javascript',
                'css': 'text/css',
                'svg': 'image/svg+xml'
            }
            [ext] || 'application/octet-stream';

            res.writeHead(200, {
                'Content-Type': mimeType
            });
            res.end(data);
        });
    });

    server.listen(0, async() => {
        const port = server.address().port;
        const url = `http://localhost:${port}/`;

        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setViewport({
            width: 1200,
            height: 800
        });

        await page.goto(url);

        await page.evaluate(data => window.renderMindMap(data), root);
        await page.waitForSelector('#mindmap path');
        await new Promise(resolve => setTimeout(resolve, 1500));

        await page.evaluate(() => {

            const svg = document.querySelector('svg#mindmap');

            // Fix self-closing <img> tags (keep them if needed).
            svg.querySelectorAll('img').forEach(img => {
                // If not self-closing (i.e., missing the ending />), replace manually.
                if (!img.outerHTML.endsWith('/>')) {
                    const newImg = img.cloneNode(true); // Deep copy properties.
                    const imgString = newImg.outerHTML.replace(/>$/, ' />');
                    img.replaceWith(new DOMParser().parseFromString(imgString, 'image/svg+xml').documentElement);
                }
            });

            if (svg && !svg.getAttribute('xmlns')) {
                svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            }

            const foreignDivs = svg.querySelectorAll('foreignObject > div');
            foreignDivs.forEach(div => {
                if (!div.getAttribute('xmlns')) {
                    div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
                }
            });

            // 👇 Add viewBox and adjust dimensions.
            const bbox = svg.getBBox();
            const padding = 20; // Add some margin.
            const viewBox = `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + 2 * padding} ${bbox.height + 2 * padding}`;
            svg.setAttribute('viewBox', viewBox);
            svg.setAttribute('width', `${bbox.width + 2 * padding}`);
            svg.setAttribute('height', `${bbox.height + 2 * padding}`);

            // Adapt for Typora: removing any hardcoded styles
            svg.removeAttribute('style');

        });

        const svgContent = await page.$eval('#mindmap', el => el.outerHTML);

        // ⚠️ Post-processing: fix issues with non-self-closing tags.
        const fixedSvgContent = svgContent
            .replace(/<img([^>]*)>/g, '<img$1 />')
            .replace(/<br([^>]*)>/g, '<br$1 />')
            .replace(/<hr([^>]*)>/g, '<hr$1 />');

        fs.writeFileSync(outputPath, fixedSvgContent, 'utf-8');

        console.log('✅ Export is Successful:', outputPath);

        await browser.close();
        server.close();
    });
});

program.parse();