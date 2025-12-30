import { modelPicker } from "@/lib/model-picker";
import { auth } from "@/server/auth";
import { streamText } from "ai";
import { NextResponse } from "next/server";
// Use AI SDK types for proper type safety

interface SlidesRequest {
  title: string; // Generated presentation title
  prompt: string; // Original user prompt/request
  outline: string[]; // Array of main topics with markdown content
  language: string; // Language to use for the slides
  tone: string; // Style for image queries (optional)
  modelProvider?: string; // Model provider (openai, ollama, or lmstudio)
  modelId?: string; // Specific model ID for the provider
  searchResults?: Array<{ query: string; results: unknown[] }>; // Search results for context
}
// TODO: Add table and chart to the available layouts
const slidesTemplate = `
You are an expert presentation designer.Your task is to create an engaging presentation in XML format.
## CORE REQUIREMENTS

1. FORMAT: Use <SECTION> tags for each slide
2. CONTENT: DO NOT copy outline verbatim - expand with examples, data, and context
3. VARIETY: Each slide must use a DIFFERENT layout component
4. VISUALS: Include detailed image queries (10+ words) on every slide

## PRESENTATION DETAILS
- Title: {TITLE}
- User's Original Request: {PROMPT}
- Current Date: {CURRENT_DATE}
- Outline (for reference only): {OUTLINE_FORMATTED}
- Language: {LANGUAGE}
- Tone: {TONE}
- Total Slides: {TOTAL_SLIDES}

## RESEARCH CONTEXT
{SEARCH_RESULTS}

## PRESENTATION STRUCTURE
\`\`\`xml
<PRESENTATION>

<!--Every slide must follow this structure (layout determines where the image appears) -->
<SECTION layout="left" | "right" | "vertical">
  <!-- Required: include ONE layout component per slide -->
  <!-- Required: include at least one detailed image query -->
</SECTION>

<!-- Other Slides in the SECTION tag-->

</PRESENTATION>
\`\`\`

## SECTION LAYOUTS
Vary the layout attribute in each SECTION tag to control image placement:
- layout="left" - Root image appears on the left side
- layout="right" - Root image appears on the right side
- layout="vertical" - Root image appears at the top

Use all three layouts throughout the presentation for visual variety.

## AVAILABLE LAYOUTS
Choose ONE different layout for each slide (use these exact XML tags so our parser recognizes them):

1. COLUMNS: For comparisons
\`\`\`xml
<COLUMNS>
  <DIV><H3>First Concept</H3><P>Description</P></DIV>
  <DIV><H3>Second Concept</H3><P>Description</P></DIV>
</COLUMNS>
\`\`\`

2. BULLETS: For key points
\`\`\`xml
<BULLETS>
  <DIV><H3>Main Point 1 </H3><P>Description</P></DIV>
  <DIV><H3>Main Point 2 </H3><P>Second point with details</P></DIV>
</BULLETS>
\`\`\`

3. ICONS: For concepts with symbols
\`\`\`xml
<ICONS>
  <DIV><ICON query="rocket" /><H3>Innovation</H3><P>Description</P></DIV>
  <DIV><ICON query="shield" /><H3>Security</H3><P>Description</P></DIV>
</ICONS>
\`\`\`

4. CYCLE: For processes and workflows
\`\`\`xml
<CYCLE>
  <DIV><H3>Research</H3><P>Initial exploration phase</P></DIV>
  <DIV><H3>Design</H3><P>Solution creation phase</P></DIV>
  <DIV><H3>Implement</H3><P>Execution phase</P></DIV>
  <DIV><H3>Evaluate</H3><P>Assessment phase</P></DIV>
</CYCLE>
\`\`\`

5. ARROWS: For cause-effect or flows
\`\`\`xml
<ARROWS>
  <DIV><H3>Challenge</H3><P>Current market problem</P></DIV>
  <DIV><H3>Solution</H3><P>Our innovative approach</P></DIV>
  <DIV><H3>Result</H3><P>Measurable outcomes</P></DIV>
</ARROWS>
\`\`\`

5b. ARROW-VERTICAL: For vertical step-by-step flows (preferred for linear phases)
\`\`\`xml
<ARROW-VERTICAL>
  <DIV><H3>Discover</H3><P>Research & requirements.</P></DIV>
  <DIV><H3>Design</H3><P>UX & architecture.</P></DIV>
  <DIV><H3>Deliver</H3><P>Build, test, deploy.</P></DIV>
</ARROW-VERTICAL>
\`\`\`

6. TIMELINE: For chronological progression
\`\`\`xml
<TIMELINE>
  <DIV><H3>2022</H3><P>Market research completed</P></DIV>
  <DIV><H3>2023</H3><P>Product development phase</P></DIV>
  <DIV><H3>2024</H3><P>Global market expansion</P></DIV>
</TIMELINE>
\`\`\`

7. PYRAMID: For hierarchical importance
\`\`\`xml
<PYRAMID>
  <DIV><H3>Vision</H3><P>Our aspirational goal</P></DIV>
  <DIV><H3>Strategy</H3><P>Key approaches to achieve vision</P></DIV>
  <DIV><H3>Tactics</H3><P>Specific implementation steps</P></DIV>
</PYRAMID>
\`\`\`

8. STAIRCASE: For progressive advancement
\`\`\`xml
<STAIRCASE>
  <DIV><H3>Basic</H3><P>Foundational capabilities</P></DIV>
  <DIV><H3>Advanced</H3><P>Enhanced features and benefits</P></DIV>
  <DIV><H3>Expert</H3><P>Premium capabilities and results</P></DIV>
</STAIRCASE>
\`\`\`


9. IMAGES: Most slides needs at least one
\`\`\`xml
<!-- Good image queries (detailed, specific): -->
<IMG query="futuristic smart city with renewable energy infrastructure and autonomous vehicles in morning light" />
<IMG query="close-up of microchip with circuit board patterns in blue and gold tones" />
<IMG query="diverse team of professionals collaborating in modern office with data visualizations" />

<!-- NOT just: "city", "microchip", "team meeting" -->
\`\`\`

10. BOXES: For simple information tiles
\`\`\`xml
<BOXES>
  <DIV><H3>Speed</H3> <P>Faster delivery cycles.</P></DIV>
  <DIV><H3>Quality</H3> <P>Automated testing & reviews.</P></DIV>
  <DIV><H3>Security</H3> <P>Shift-left security practices.</P></DIV>
</BOXES>
\`\`\`

11. COMPARE: For side-by-side comparison
\`\`\`xml
<COMPARE>
  <DIV><H3>Solution A</H3> <LI>Features 1</LI> <LI>Features 2</LI></DIV>
  <DIV><H3>Solution B</H3> <LI>Features 3</LI> <LI>Features 4</LI></DIV>
</COMPARE>
\`\`\`

12. BEFORE-AFTER: For transformation snapshots
\`\`\`xml
<BEFORE-AFTER>
  <DIV><H3>Before</H3> <P>Manual processes, scattered data.</P></DIV>
  <DIV><H3>After</H3> <P>Automated workflows, unified insights.</P></DIV>
</BEFORE-AFTER>
\`\`\`

13. PROS-CONS: For trade-offs
\`\`\`xml
<PROS-CONS>
  <PROS><H3>Pros</H3> <LI>Pros 1</LI> <LI>Pros 2</LI>  </PROS>
  <CONS><H3>Cons</H3> <LI>Cons 1</LI> <LI>Cons 2</LI></CONS>
</PROS-CONS>
\`\`\`

14. TABLE: For tabular data. Preferred over other layouts for tabular data. It can also be used to do comparisons.
\`\`\`xml
<TABLE>
  <TR><TH>Header 1</TH><TH>Header 2</TH></TR>
  <TR><TD>Data 1</TD><TD>Data 2</TD></TR>
</TABLE>
\`\`\`

15. CHARTS: Use compact DATA rows (no TABLEs). The AI must emit \`<DATA>\` items inside \`<CHART>\`.
\`\`\`xml
<!-- Label/Value charts: bar, pie, line, area, radar -->
<CHART charttype="bar|pie|line|area|radar">
  <DATA><LABEL>Q1</LABEL><VALUE>24</VALUE></DATA>
  <DATA><LABEL>Q2</LABEL><VALUE>36</VALUE></DATA>
</CHART>

<!-- Scatter charts: provide numeric X and Y per DATA point -->
<CHART charttype="scatter">
  <DATA><X>1</X><Y>2</Y></DATA>
  <DATA><X>3</X><Y>5</Y></DATA>
</CHART>
\`\`\`


## CONTENT EXPANSION STRATEGY
For each outline point:
- Add supporting data/statistics
- Include real-world examples
- Reference industry trends
- Add thought-provoking questions

## CRITICAL RULES
1. Generate exactly {TOTAL_SLIDES} slides. NOT MORE NOT LESS ! EXACTLY {TOTAL_SLIDES}
2. NEVER repeat layouts in consecutive slides
3. DO NOT copy outline verbatim - expand and enhance
4. Include at least one detailed image query in most of the slides
5. Use appropriate heading hierarchy
6. Vary the SECTION layout attribute (left/right/vertical) throughout the presentation
   - Use each layout (left, right, vertical) at least twice
   - Don't use the same layout more than twice in a row

7. Use only the XML tags shown above. Do not invent new tags or attributes.

Now create a complete XML presentation with {TOTAL_SLIDES} slides that significantly expands on the outline.
`;

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      title,
      prompt: userPrompt,
      outline,
      language,
      tone,
      modelProvider = "openai",
      modelId,
      searchResults,
    } = (await req.json()) as SlidesRequest;

    if (!title || !outline || !Array.isArray(outline) || !language) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Format search results
    let searchResultsText = "No research data available.";
    if (searchResults && searchResults.length > 0) {
      const searchData = searchResults
        .map((searchItem, index: number) => {
          const query = searchItem.query || `Search ${index + 1}`;
          const results = Array.isArray(searchItem.results)
            ? searchItem.results
            : [];

          if (results.length === 0) return "";

          const formattedResults = results
            .map((result: unknown) => {
              const resultObj = result as Record<string, unknown>;
              return `- ${resultObj.title || "No title"}\n  ${resultObj.content || "No content"}\n  ${resultObj.url || "No URL"}`;
            })
            .join("\n");

          return `**Search Query ${index + 1}:** ${query}\n**Results:**\n${formattedResults}\n---`;
        })
        .filter(Boolean)
        .join("\n\n");

      if (searchData) {
        searchResultsText = `The following research was conducted during outline generation:\n\n${searchData}`;
      }
    }

    const currentDate = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const model = modelPicker(modelProvider, modelId);

    // Format the prompt with template variables
    const formattedPrompt = slidesTemplate
      .replace(/{TITLE}/g, title)
      .replace(/{PROMPT}/g, userPrompt || "No specific prompt provided")
      .replace(/{CURRENT_DATE}/g, currentDate)
      .replace(/{LANGUAGE}/g, language)
      .replace(/{TONE}/g, tone)
      .replace(/{OUTLINE_FORMATTED}/g, outline.join("\n\n"))
      .replace(/{TOTAL_SLIDES}/g, outline.length.toString())
      .replace(/{SEARCH_RESULTS}/g, searchResultsText);

    console.log(`[PresentationAPI] Generating slides. Title="${title}", Slides=${outline.length}, ModelProvider=${modelProvider}, ModelId="${modelId}"`);

    const result = streamText({
      model,
      prompt: formattedPrompt,
    });

    return result.toDataStreamResponse({
      getErrorMessage: (error) => {
        console.error("Stream error (Presentation):", error);
        if (error instanceof Error) return error.message;
        return String(error);
      }
    });
  } catch (error) {
    console.error("Error in presentation generation:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to generate presentation slides: ${errorMessage}` },
      { status: 500 },
    );
  }
}
