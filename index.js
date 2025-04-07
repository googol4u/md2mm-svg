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
.description('Markdown 转 SVG 思维导图 CLI 工具（使用本地node_modules依赖）')
.version('1.0.0')
.argument('<input>', '输入markdown文件')
.argument('[output]', '输出svg文件，默认与输入文件同名')
.action(async(input, output) => {
    const inputPath = path.resolve(input);
    const outputPath = output ? path.resolve(output) : inputPath.replace(/\.md$/, '.svg');

    if (!fs.existsSync(inputPath)) {
        console.error('输入文件不存在:', inputPath);
        process.exit(1);
    }

    const markdownContent = fs.readFileSync(inputPath, 'utf-8');
    const transformer = new Transformer();
    const {
        root
    } = transformer.transform(markdownContent);

    // 使用内置HTTP服务器提供静态文件服务
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

            // 修复 img 自封闭标签（如果需要你可以保留这个）
            svg.querySelectorAll('img').forEach(img => {
                // 如果不是自封闭（即没有结尾的 />），手动替换
                if (!img.outerHTML.endsWith('/>')) {
                    const newImg = img.cloneNode(true); // 深复制属性
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

            // 👇 添加 viewBox 和适配尺寸
            const bbox = svg.getBBox();
            const padding = 20; // 增加一点边距
            const viewBox = `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + 2 * padding} ${bbox.height + 2 * padding}`;
            svg.setAttribute('viewBox', viewBox);
            svg.setAttribute('width', `${bbox.width + 2 * padding}`);
            svg.setAttribute('height', `${bbox.height + 2 * padding}`);

            // 为 Typora 适配：去除任何硬编码样式可能更好
            svg.removeAttribute('style');

        });

        const svgContent = await page.$eval('#mindmap', el => el.outerHTML);

        // ⚠️ 后处理：修复 <img> 没有自封闭的标签问题
        const fixedSvgContent = svgContent
            .replace(/<img([^>]*)>/g, '<img$1 />')
            .replace(/<br([^>]*)>/g, '<br$1 />')
            .replace(/<hr([^>]*)>/g, '<hr$1 />');

        fs.writeFileSync(outputPath, svgContent, 'utf-8');

        console.log('✅ 导出成功:', outputPath);

        await browser.close();
        server.close();
    });
});

program.parse();