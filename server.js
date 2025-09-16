const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// API Key from environment variable (required)
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    console.error('ERROR: API_KEY environment variable is required');
    process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());

// Authentication middleware
const requireApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;

    if (!apiKey) {
        return res.status(401).json({ error: 'API key required' });
    }

    if (apiKey !== API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    next();
};

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'pdf-microservice' });
});

// Main PDF generation endpoint (auth required)
app.post('/generate-pdf', requireApiKey, async (req, res) => {
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

        console.log('Attempting to launch browser...');

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

        console.log('Browser launched successfully');

        const page = await browser.newPage();
        console.log('New page created');

        // Set viewport
        await page.setViewport({ width: 1200, height: 800 });
        console.log('Viewport set');

        // Navigate to URL
        console.log(`Navigating to: ${url}`);
        await page.goto(url, {
            waitUntil: waitUntil,
            timeout: timeout
        });
        console.log('Page loaded successfully');

        // Generate PDF
        console.log('Generating PDF...');
        const pdf = await page.pdf({
            format: format,
            landscape: landscape,
            margin: margin,
            printBackground: true
        });
        console.log(`PDF generated, size: ${pdf.length} bytes`);

        await browser.close();
        console.log('Browser closed');

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="document.pdf"');
        res.setHeader('Content-Length', pdf.length);

        // Send PDF buffer as binary data
        res.write(pdf, 'binary');
        res.end();

    } catch (error) {
        console.error('PDF generation error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            error: 'Failed to generate PDF',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// GET endpoint for simple URL-based generation (auth required)
app.get('/generate-pdf', requireApiKey, async (req, res) => {
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