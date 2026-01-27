import { nanoid } from "nanoid";
import { type PlateSlide, type PlateNode } from "@/components/presentation/utils/parser";

// Porsche background images available
const PORSCHE_BACKGROUNDS = [
    "/imgs/porsche_parking.png",
    "/imgs/porsche2.png",
    "/imgs/porsche_blue.png",
];

/**
 * Creates the Porsche logo slide (first slide)
 * Simple white background with centered PORSCHE text logo
 * Logo should be appropriately sized and perfectly centered
 */
export function createPorscheLogoSlide(): PlateSlide {
    const content: PlateNode[] = [
        {
            type: "img",
            id: nanoid(),
            url: "/imgs/Porsche_wordmark_black_rgb.svg",
            alt: "PORSCHE",
            children: [{ text: "" }],
            width: 600,
            align: "center",
        } as unknown as PlateNode,
    ];

    return {
        id: nanoid(),
        content,
        layoutType: "text-only",
        alignment: "center",
        bgColor: "#FFFFFF",
    };
}

/**
 * Creates the Porsche title slide (second slide)
 * Full-screen background image with white overlay containing title
 * Title: 38pt, Subtitle: 18pt (Porsche brand guidelines)
 */
export function createPorscheTitleSlide(
    title: string,
    department?: string,
    date?: string,
): PlateSlide {
    // Randomly pick a background image
    const backgroundIndex = Math.floor(Math.random() * PORSCHE_BACKGROUNDS.length);
    const backgroundUrl = PORSCHE_BACKGROUNDS[backgroundIndex];

    const content: PlateNode[] = [
        {
            type: "h1",
            id: nanoid(),
            children: [{ text: title || "Title of the presentation" }],
            // Font size 38pt for main title
            fontSize: 38,
        } as unknown as PlateNode,
        {
            type: "p",
            id: nanoid(),
            children: [{ text: department || "Department | Author" }],
            // Font size 18pt for subtitle
            fontSize: 18,
        } as unknown as PlateNode,
        {
            type: "p",
            id: nanoid(),
            children: [{
                text: date || new Date().toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                })
            }],
            // Font size 18pt for date
            fontSize: 18,
        } as unknown as PlateNode,
    ];

    return {
        id: nanoid(),
        content,
        layoutType: "left",
        alignment: "start",
        rootImage: {
            query: "Porsche cars",
            url: backgroundUrl,
            layoutType: "left",
        },
    };
}

/**
 * Returns the complete set of Porsche template slides
 * @param title - The presentation title to display on the title slide
 * @param department - Optional department/author info
 * @param date - Optional date string
 */
export function getPorscheTemplateSlides(
    title: string,
    department?: string,
    date?: string,
): PlateSlide[] {
    return [
        createPorscheLogoSlide(),
        createPorscheTitleSlide(title, department, date),
    ];
}
