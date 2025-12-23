import puppeteer from 'puppeteer';

export interface PageResult {
    title: string;
    content: string;
    screenshot: string; // Base64
}

export class BrowserHandler {

    async visitPage(url: string): Promise<PageResult> {
        let browser;
        try {
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'] // Required for Docker
            });

            const page = await browser.newPage();
            // Set reasonable viewport
            await page.setViewport({ width: 1280, height: 800 });

            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

            const title = await page.title();

            // Get simple text content (inner text of body)
            // Ideally we'd convert to markdown, but text is a good start.
            const content = await page.evaluate(() => document.body.innerText);

            // Screenshot
            const screenshotBuffer = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 80 });

            return {
                title,
                content: content.slice(0, 5000), // Truncate for safety
                screenshot: screenshotBuffer as string
            };

        } catch (error: any) {
            throw new Error(`Browser Error: ${error.message}`);
        } finally {
            if (browser) await browser.close();
        }
    }
}
