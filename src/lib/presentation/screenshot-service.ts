/**
 * Screenshot Service for PPT Export
 * Uses Puppeteer to capture high-fidelity screenshots of presentation slides
 */

import puppeteer, { type Browser } from "puppeteer";

export interface ScreenshotOptions {
    width?: number;
    height?: number;
    scale?: number;
}

const DEFAULT_OPTIONS: Required<ScreenshotOptions> = {
    width: 1920,
    height: 1080,
    scale: 2, // Retina quality
};

/**
 * Capture screenshots of all slides in a presentation
 * @param baseUrl - Base URL of the application (e.g., http://localhost:3000)
 * @param presentationId - ID of the presentation to capture
 * @param totalSlides - Total number of slides
 * @param options - Screenshot options
 * @returns Array of base64 encoded PNG images
 */
export async function captureSlideScreenshots(
    baseUrl: string,
    presentationId: string,
    totalSlides: number,
    options?: ScreenshotOptions
): Promise<string[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const screenshots: string[] = [];

    let browser: Browser | null = null;

    try {
        // Launch browser with optimized settings for server environment
        // Uses system Chromium in Docker (set via PUPPETEER_EXECUTABLE_PATH)
        browser = await puppeteer.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--disable-gpu",
                "--font-render-hinting=none",
            ],
        });

        const page = await browser.newPage();

        // Set viewport for 16:9 presentation aspect ratio
        await page.setViewport({
            width: opts.width,
            height: opts.height,
            deviceScaleFactor: opts.scale,
        });

        // Capture each slide
        for (let slideIndex = 0; slideIndex < totalSlides; slideIndex++) {
            const url = `${baseUrl}/api/presentation/export-render?id=${presentationId}&slideIndex=${slideIndex}`;

            await page.goto(url, {
                waitUntil: "networkidle0",
                timeout: 30000,
            });

            // Wait for fonts to load
            await page.evaluate(() => {
                return document.fonts?.ready;
            });

            // Additional wait for any animations to settle
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Capture screenshot
            const screenshot = await page.screenshot({
                type: "png",
                encoding: "base64",
                fullPage: false,
                clip: {
                    x: 0,
                    y: 0,
                    width: opts.width,
                    height: opts.height,
                },
            });

            screenshots.push(screenshot as string);
        }

        return screenshots;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * Capture a single slide screenshot
 */
export async function captureSingleSlideScreenshot(
    baseUrl: string,
    presentationId: string,
    slideIndex: number,
    options?: ScreenshotOptions
): Promise<string> {
    const screenshots = await captureSlideScreenshots(
        baseUrl,
        presentationId,
        slideIndex + 1,
        options
    );
    return screenshots[slideIndex] ?? "";
}
