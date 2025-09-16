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

// Debug endpoint to check environment (temporary - remove in production)
app.get('/debug', (req, res) => {
    res.json({
        hasApiKey: !!process.env.API_KEY,
        apiKeyLength: process.env.API_KEY ? process.env.API_KEY.length : 0,
        headers: req.headers['x-api-key'] ? 'header present' : 'no header',
        query: req.query.api_key ? 'query present' : 'no query',
        viewportWidth: 1800,
        margins: 'removed'
    });
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
        await page.setViewport({ width: 1800, height: 900 });
        console.log('Viewport set to 1800x900');

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
    const {
        url,
        format,
        landscape,
        viewport_width,
        viewport_height
    } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    // Create request body object for consistency with POST handler
    const requestBody = {
        url,
        format: format || 'A4',
        landscape: landscape === 'true',
        viewport_width: parseInt(viewport_width) || 1440,
        viewport_height: parseInt(viewport_height) || 900
    };

    try {
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
        await page.setViewport({ width: 1800, height: 900 });
        console.log('Viewport set to 1800x900');

        // Navigate to URL
        console.log(`Navigating to: ${url}`);
        await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        console.log('Page loaded successfully');

        // Generate PDF
        console.log('Generating PDF...');
        const pdf = await page.pdf({
            // Remove format to allow dynamic sizing based on content
            landscape: false,
            margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
            printBackground: true,
            width: '1800px'  // Set explicit width to match viewport, let height be automatic
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`PDF microservice running on port ${PORT}`);
});