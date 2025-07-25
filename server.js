const express = require('express');
const puppeteer = require('puppeteer-core');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

app.post('/analyze', async (req, res) => {
  const { url } = req.body;
  console.log(`🔍 Analizzo: ${url}`);
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: '/usr/bin/google-chrome' // questo fa usare Chrome già presente su Render
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    const fonts = await page.evaluate(() => {
      const fontSet = new Set();
      const elements = document.querySelectorAll('body *:not(script):not(style)');
      elements.forEach(element => {
        const computedStyle = window.getComputedStyle(element);
        const fontFamily = computedStyle.getPropertyValue('font-family');
        if (fontFamily && fontFamily !== 'inherit') {
          const primaryFont = fontFamily.split(',')[0].replace(/['"]/g, '').trim();
          const lower = primaryFont.toLowerCase();
          if (
            !['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy'].includes(lower) &&
            !lower.includes('font awesome') &&
            !lower.includes('eicons') &&
            !lower.includes('qlwapp') &&
            !lower.includes('whatsapp') &&
            lower !== 'none' &&
            lower !== '-apple-system'
          ) {
            fontSet.add(primaryFont);
          }
        }
      });
      return Array.from(fontSet);
    });

    const colors = await page.evaluate(() => {
      const colorSet = new Set();
      const elements = document.querySelectorAll('body *:not(script):not(style)');
      const rgbToHex = (rgb) => {
        const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
          const r = parseInt(match[1]);
          const g = parseInt(match[2]);
          const b = parseInt(match[3]);
          return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        }
        return null;
      };

      elements.forEach(element => {
        const style = window.getComputedStyle(element);
        const opacity = parseFloat(style.getPropertyValue('opacity')) || 1;
        if (opacity < 0.1 || style.display === 'none' || style.visibility === 'hidden') return;
        if (element.className && /icon|whatsapp|social|svg|eicon/i.test(element.className)) return;

        const color = style.getPropertyValue('color');
        const bgColor = style.getPropertyValue('background-color');

        [color, bgColor].forEach(value => {
          if (value && value.includes('rgb')) {
            const hex = rgbToHex(value);
            if (hex && hex !== '#000000') {
              colorSet.add(hex);
            }
          }
        });
      });

      return Array.from(colorSet).slice(0, 4);
    });

    await browser.close();

    const result = {
      url,
      fonts: fonts.map(font => ({
        name: font,
        family: `${font}, sans-serif`
      })),
      colors: colors.filter(color => color.startsWith('#')),
      timestamp: new Date().toISOString()
    };

    console.log(`✅ Trovati ${result.fonts.length} font e ${result.colors.length} colori`);
    res.json(result);

  } catch (error) {
    console.error('❌ Errore:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server avviato su http://localhost:${PORT}`);
  console.log(`📁 Apri il browser e vai su: http://localhost:${PORT}`);
});
