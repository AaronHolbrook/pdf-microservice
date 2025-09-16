const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'pdf-microservice' });
});

// Main PDF generation endpoint
app.post('/generate-pdf', async (req, res) => {
    try {
        const {
            url,
            format = 'A4',
            landscape = false,
            margin = { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
            waitUntil = 'networkidle0',
            timeout = 30000
        } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Launch browser
        const browser = await puppeteer.launch({
            headless: true,
            executablePath: '/usr/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();

        // Set viewport
        await page.setViewport({ width: 1200, height: 800 });

        // Navigate to URL
        await page.goto(url, {
            waitUntil: waitUntil,
            timeout: timeout
        });

        // Generate PDF
        const pdf = await page.pdf({
            format: format,
            landscape: landscape,
            margin: margin,
            printBackground: true
        });

        await browser.close();

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="document.pdf"');
        res.setHeader('Content-Length', pdf.length);

        // Send PDF
        res.send(pdf);

    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).json({
            error: 'Failed to generate PDF',
            message: error.message
        });
    }
});

// GET endpoint for simple URL-based generation
app.get('/generate-pdf', async (req, res) => {
    const { url, format, landscape } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    // Forward to POST endpoint
    req.body = {
        url,
        format: format || 'A4',
        landscape: landscape === 'true'
    };

    // Call the POST handler
    return app._router.handle({ method: 'POST', url: '/generate-pdf', body: req.body }, res);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`PDF microservice running on port ${PORT}`);
});