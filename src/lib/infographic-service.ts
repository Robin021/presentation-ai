import { generateText, generateObject, streamText } from "ai";
import { z } from "zod";
import { modelPicker } from "./model-picker";
import { searchWeb } from "./search-service";
import { InfographicGenerateOptions, ALL_VALID_TEMPLATES } from "./infographic-constants";

// ... existing imports ...

// [Helper] Streaming version of generateStep
async function* generateStepStream(plan: any, theme: string = "default") {
  const model = modelPicker("openai");

  let themeInstructions = "";
  if (theme === "porsche") {
    themeInstructions = `** Theme **: Porsche - fontFamily "Porsche Next TT", palette #E60012 #000000 #FFFFFF`;
  } else if (theme === "tech") {
    themeInstructions = `** Theme **: Tech blue - palette #3b82f6 #8b5cf6 #60a5fa`;
  } else if (theme === "nature") {
    themeInstructions = `** Theme **: Nature green - palette #22c55e #10b981 #84cc16`;
  }

  const result = await streamText({
    model,
    system: GENERATION_SYSTEM_PROMPT,
    prompt: `Template: "${plan.templateName}"\nTitle: ${plan.titleSuggestion} \nData: ${JSON.stringify(plan.dataPoints)} \n${themeInstructions} \n${plan.category === 'compare' ? 'CRITICAL: TWO root nodes for comparison.\n' : ''} `,
  });

  for await (const textPart of result.textStream) {
    // Basic cleanup only (remove markdown blocks if they get tokenized split, hard to do perfectly in stream but we try)
    // For streaming, we mostly rely on the prompt to be clean.
    yield textPart;
  }
}

export async function* createInfographicStream(options: InfographicGenerateOptions): AsyncGenerator<string, void, unknown> {
  const { topic, description, theme, itemsCount = 1, webSearchEnabled = false, templateHint } = options;

  if (webSearchEnabled) {
    // Research Mode (Agentic)
    yield* generateResearchMode(options);
  } else {
    // Brainstorm Mode (Better Content than Simple Mode)
    // Yield a "thinking" message first? Optional.
    const slidesPlan = await brainstormStep(topic, description, itemsCount, templateHint);

    for (let i = 0; i < slidesPlan.length; i++) {
      if (i > 0) {
        yield "\n\n---SLIDE---\n\n";
      }

      // Use streaming generator
      const stream = generateStepStream(slidesPlan[i], theme || "default");

      for await (const token of stream) {
        yield token;
      }
    }
  }
}


// ===== BRAINSTORMING MODE (Internal Knowledge) =====

const BRAINSTORM_SYSTEM_PROMPT = `
You are a creative Information Designer and Content Strategist.
Your goal is to plan insightful, detailed, and visually engaging AntV Infographic slides based on the user's topic.

**Valid Templates (MUST choose from this list)**:
${ALL_VALID_TEMPLATES.join("\n")}

**Task**:
1. **ANALYZE INPUT FIRST**: Thoroughly read the "User Context" / "Description". 
   - **IF** the user provided detailed content (e.g. a report, a list of points, a structure): **Your primary job is to EXTRACT and ORGANIZE this content**. Do NOT invent new content if the user provided it. Stick to their terminology and structure.
   - **IF** the user provided a vague request (e.g. "make a slide about coffee"): **THEN** use your creativity to brainstorm high-quality, plausible content.

2. **Plan {slideCount} distinct slides**.
3. For EACH slide, select the most appropriate template.
   - Use specific details provided by the user.
   - If user provided "Pain Points", "Root Causes", "Stages" -> Map these explicitly to slides.
   - Do not use generic placeholders like "Lorem Ipsum".

5. **Logical Flow (CRITICAL)**:
   - **NARRATIVE**: Ensure a logical progression. Common patterns:
     - *Problem -> Solution -> Impact*
     - *Past -> Present -> Future*
     - *Overview -> Detailed Analysis -> Conclusion*
   - **TRANSITIONS**: Verify that Slide 2 follows naturally from Slide 1. Do NOT jump randomly between topics.
   - **ORDER**: If the user provided a numbered list or stages, YOU MUST RESPECT THAT ORDER.

**Variety Rules**:
**Variety Rules (CRITICAL)**:
- **AVOID REPETITION**: Do NOT use the same template category (especially "chart") more than once if possible.
- **FORCE VARIETY**: You MUST use at least 3 distinct categories from: Sequence, Compare, Hierarchy, List, Relation, Quadrant.
- **PROMOTE SEQUENCE/LIST**: For text-heavy content, prefer "sequence-*" (process/timeline) or "list-*" over charts.
- **USE CHARTS SPARINGLY**: Only use "chart-*" if there are actual hard numbers. Do not force text into charts.
- **VISUAL INTEREST**: Every slide must look completely different in structure to the previous one.

**Output (JSON)**:
{
  "slides": [
    {
      "category": "sequence" | "compare" | "hierarchy" | "chart" | "list" | "relation" | "quadrant",
      "templateName": "exact-template-name-from-list",
      "reasoning": "Why this template fits the content",
      "titleSuggestion": "Engaging Title (Use user's own headers if available)",
      "dataPoints": [
        "Use full sentences or key stats",
        "For charts: ensure you have label and value pairs implied here",
        "For comparisons: list pros/cons or features"
      ]
    }
  ]
}
`;

async function brainstormStep(
  topic: string,
  description: string,
  slideCount: number,
  templateHint?: string
) {
  const model = modelPicker("openai");

  const { object } = await generateObject({
    model,
    schema: z.object({
      slides: z.array(z.object({
        category: z.enum(["sequence", "compare", "hierarchy", "chart", "list", "relation", "quadrant"]),
        templateName: z.string(),
        reasoning: z.string(),
        titleSuggestion: z.string(),
        dataPoints: z.array(z.string()),
      })),
    }),
    system: BRAINSTORM_SYSTEM_PROMPT.replace('{slideCount}', slideCount.toString()),
    prompt: `Topic: ${topic} \nUser Context: ${description} \n\nGoal: Create a high-quality content plan for ${slideCount} slides. \n${templateHint ? `Preferred category: ${templateHint}` : ""}\n\nIMPORTANT: Think about the content first. What is the most interesting way to present this?`,
  });

  return object.slides;
}


/**
 * Fix incorrectly structured DSL.
 * AI often generates DSL with everything indented under infographic line.
 * This function restructures it to have data and theme at root level.
 * 
 * AI generates:
 *   infographic template
 *     title X
 *     theme
 *       palette ...
 *     data
 *       value ...
 * 
 * Correct format:
 *   infographic template
 *   data
 *     title X
 *     items
 *       - label ...
 *         value ...
 *   theme
 *     palette ...
 */
function fixDslStructure(dsl: string): string {
  const lines = dsl.split('\n');

  // Check if fix is needed (if line 2 is indented and not 'data' or 'theme')
  if (lines.length < 2) return dsl;

  const firstLine = lines[0]?.trim() || '';
  if (!firstLine.startsWith('infographic ')) return dsl;

  const secondLine = lines[1] || '';
  const secondTrimmed = secondLine.trimStart();

  // If second line is already 'data' or 'theme' at root, DSL is correct
  if (secondTrimmed.startsWith('data') || secondTrimmed.startsWith('theme')) {
    if (secondLine === secondTrimmed) {
      return dsl; // Already correct format
    }
  }

  // Need to restructure - extract components from indented structure
  let title = '';
  let desc = '';
  const items: string[] = [];
  let themeContent = '';
  let currentSection = '';
  let baseIndent = 0;

  // Detect base indentation
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line && line.trim()) {
      baseIndent = line.length - line.trimStart().length;
      break;
    }
  }

  if (baseIndent === 0) return dsl; // No indentation issues

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    const trimmed = line.trimStart();
    const currentIndentLevel = line.length - trimmed.length;
    const relativeIndent = currentIndentLevel - baseIndent;

    if (trimmed.startsWith('title ')) {
      title = trimmed.substring(6).trim();
    } else if (trimmed.startsWith('desc ')) {
      desc = trimmed.substring(5).trim();
    } else if (trimmed === 'theme') {
      currentSection = 'theme';
    } else if (trimmed === 'data') {
      currentSection = 'data';
    } else if (trimmed.startsWith('data')) {
      // Handle inline data like "data" followed by items
      currentSection = 'data';
    } else if (currentSection === 'theme') {
      themeContent += '  ' + trimmed + '\n';
    } else if (currentSection === 'data' || trimmed.startsWith('- ') || trimmed.startsWith('value ') || trimmed.startsWith('label ')) {
      // Collect data items
      if (trimmed.startsWith('- ')) {
        items.push(trimmed);
      } else if (relativeIndent > 0 && items.length > 0) {
        items[items.length - 1] += '\n      ' + trimmed;
      } else if (trimmed.startsWith('value ') || trimmed.startsWith('label ')) {
        items.push('- ' + trimmed);
      } else if (trimmed) {
        items.push('- label ' + trimmed);
      }
    }
  }

  // Build correct DSL
  let result = firstLine + '\n';
  result += 'data\n';
  if (title) result += '  title ' + title + '\n';
  if (desc) result += '  desc ' + desc + '\n';
  if (items.length > 0) {
    result += '  items\n';
    for (const item of items) {
      result += '    ' + item + '\n';
    }
  }
  if (themeContent) {
    result += 'theme\n' + themeContent;
  }

  return result.trim();
}

// ===== RESEARCH MODE (Agentic Workflow) =====

const PLANNING_SYSTEM_PROMPT = `
You are an expert Information Designer analyzing data to plan AntV Infographic slides.

**Valid Templates (MUST choose from this list)**:
${ALL_VALID_TEMPLATES.join("\n")}

**Template Categories**:
- sequence-* : timeline, steps, roadmap, process flow
- compare-* : binary comparison, SWOT, pros/cons (MUST have exactly 2 root nodes)
- hierarchy-* : tree structure, org chart (use "children" field)
- chart-* : data visualization with numeric values
- list-* : items, features, grid layouts
- relation-* : connections, relationships
- quadrant-* : 2x2 matrix analysis

**Task**:
1. Analyze research data structure
2. Plan {slideCount} distinct slides covering different aspects
3. For EACH slide, select the most appropriate template from the VALID list
4. Extract key data points for each slide

**Variety Rules**:
**Variety Rules (CRITICAL)**:
- **AVOID REPETITION**: Do NOT use the same template category (especially "chart") more than once if possible.
- **FORCE VARIETY**: You MUST use at least 3 distinct categories from: Sequence, Compare, Hierarchy, List, Relation, Quadrant.
- **PROMOTE SEQUENCE/LIST**: For text-heavy content, prefer "sequence-*" (process/timeline) or "list-*" over charts.
- **USE CHARTS SPARINGLY**: Only use "chart-*" if there are actual hard numbers. Do not force text into charts.
- **VISUAL INTEREST**: Every slide must look completely different in structure to the previous one.
- **DATA DENSITY RULES**:
   - **Pie/Donut Charts**: MAX 6 ITEMS. If > 6 items, MUST use "chart-bar" or "list-grid". Pie charts with many slices cause overlap.
   - **Vertical Lists**: MAX 6 ITEMS. If > 6 items, use "list-grid" or "chart-bar".

**Output (JSON)**:
{
  "slides": [
    {
      "category": "sequence" | "compare" | "hierarchy" | "chart" | "list" | "relation" | "quadrant",
      "templateName": "exact-template-name-from-list-above",
      "reasoning": "Brief reason",
      "titleSuggestion": "Slide title",
      "dataPoints": ["data point 1", "data point 2"]
    }
  ]
}
`;

const GENERATION_SYSTEM_PROMPT = `
You are an expert in AntV Infographic syntax generation.

Generate STRICT AntV Infographic Syntax following this EXACT structure.

## CRITICAL STRUCTURE

The DSL has exactly THREE root-level elements (NO indentation for data/theme):
1. \`infographic <template-name>\` - First line
2. \`data\` block - Contains title, desc, items
3. \`theme\` block - Contains palette, fontFamily

## CORRECT FORMAT EXAMPLE (List/Sequence):
\`\`\`plain
infographic list-row-horizontal-icon-arrow
data
  title Technology Evolution
  desc From past to future
  items
    - label Web 1.0
      desc Static websites
      icon mdi/web
    - label Web 2.0
      desc Social media era
      icon mdi/account-group
    - label AI Era
      desc Generative AI
      icon mdi/brain
theme
  palette #3b82f6 #8b5cf6 #f97316
\`\`\`

## CORRECT FORMAT EXAMPLE (Chart):
\`\`\`plain
infographic chart-bar-plain-text
data
  title Q1 Sales Report
  items
    - label January
      value 1200
    - label February
      value 1500
    - label March
      value 1800
theme
  palette #22c55e #10b981 #84cc16
\`\`\`

## CORRECT FORMAT EXAMPLE (Compare):
\`\`\`plain
infographic compare-binary-horizontal-underline-text-vs
data
  title Product A vs Product B
  items
    - label Product A
      children
        - label Feature 1
          icon mdi/check
        - label Feature 2
          icon mdi/check
    - label Product B
      children
        - label Feature 1
          icon mdi/check
        - label Feature 3
          icon mdi/star
theme
  palette #ef4444 #3b82f6 #10b981
\`\`\`

## RULES
1. \`data\` and \`theme\` MUST be at root level (NO indentation)
2. \`title\` and \`items\` MUST be inside \`data\` block (2-space indent)
3. Each item in \`items\` MUST start with \`- label\`
4. Icons MUST use \`mdi/\` prefix
5. **DESCRIPTION LENGTH**: \`desc\` fields MUST be VERY short. **MAX 4 WORDS**. Example: "High growth", NOT "This segment experienced high growth in Q1".
6. **LABEL LENGTH**: \`label\` fields MUST be VERY short. **MAX 3 WORDS**. Example: "Revenue", NOT "Total Annual Revenue Stream".
7. **FULL FIELDS**: Use \`icon\` and \`value\` whenever possible to enhance visuals.
8. **NO COMMAS**: Numeric values MUST NOT contain commas. e.g. \`value 10000\`.
9. **NORMALIZE SCALES**: For chart templates, ensure all \`value\` fields are on a consistent scale (e.g., all in thousands, millions, or percentages) and clearly indicate the unit in the \`desc\` field of the data block if applicable.
10. **PALETTE SAFETY**: Do NOT use White (#FFFFFF) in the palette. It will be invisible.
11. **BACKGROUND**: You MAY set \`background #RRGGBB\` inside the \`theme\` block. If used, ensure palette contrasts with it.
12. Output ONLY the DSL in \`\`\`plain block, NO explanations
  `;

async function researchStep(topic: string, description: string): Promise<string> {
  console.log(`[Research Mode]Researching: ${topic} `);
  const model = modelPicker("openai");

  const queryResult = await generateText({
    model,
    system: "You are a search query generator. Output ONLY a concise search query.",
    prompt: `Topic: ${topic} \nUser Description: ${description} \n\nGoal: Generate a targeted search query. CRITICAL: Use the User Description to refine the query if provided. Find stats/trends/comparisons.`,
  });

  const searchQuery = queryResult.text.trim().replace(/^"|"$/g, '');
  const searchResults = await searchWeb(searchQuery);

  if (!searchResults || searchResults.length === 0) {
    return "No external data found.";
  }

  return searchResults.map(r => `- ${r.title}: ${r.snippet} `).join("\n");
}

async function planStep(
  topic: string,
  description: string,
  researchData: string,
  slideCount: number,
  templateHint?: string
) {
  const model = modelPicker("openai");

  const { object } = await generateObject({
    model,
    schema: z.object({
      slides: z.array(z.object({
        category: z.enum(["sequence", "compare", "hierarchy", "chart", "list", "relation", "quadrant"]),
        templateName: z.string(),
        reasoning: z.string(),
        titleSuggestion: z.string(),
        dataPoints: z.array(z.string()),
      })),
    }),
    system: PLANNING_SYSTEM_PROMPT.replace('{slideCount}', slideCount.toString()),
    prompt: `Topic: ${topic} \nUser Request: ${description} \nResearch: \n${researchData} \n\nPlan ${slideCount} slides.${templateHint ? `\nPreferred category: ${templateHint}` : ""} `,
  });

  return object.slides;
}

async function generateStep(plan: any, theme: string = "default") {
  const model = modelPicker("openai");

  let themeInstructions = "";
  if (theme === "porsche") {
    themeInstructions = `** Theme **: Porsche - fontFamily "Porsche Next TT", palette #E60012 #000000 #FFFFFF`;
  } else if (theme === "tech") {
    themeInstructions = `** Theme **: Tech blue - palette #3b82f6 #8b5cf6 #60a5fa`;
  } else if (theme === "nature") {
    themeInstructions = `** Theme **: Nature green - palette #22c55e #10b981 #84cc16`;
  }

  const { text } = await generateText({
    model,
    system: GENERATION_SYSTEM_PROMPT,
    prompt: `Template: "${plan.templateName}"\nTitle: ${plan.titleSuggestion} \nData: ${JSON.stringify(plan.dataPoints)} \n${themeInstructions} \n${plan.category === 'compare' ? 'CRITICAL: TWO root nodes for comparison.\n' : ''} `,
  });

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const cleanDsl = text.replace(/```plain\n?/g, "").replace(/```\n?/g, "").trim();

  // Apply structure fix for robustness
  return fixDslStructure(cleanDsl);
}

async function* generateResearchMode(options: InfographicGenerateOptions): AsyncGenerator<string, void, unknown> {
  const { topic, description, templateHint, theme, itemsCount = 1 } = options;

  const researchData = await researchStep(topic, description);
  const slidesPlan = await planStep(topic, description, researchData, itemsCount, templateHint);

  for (let i = 0; i < slidesPlan.length; i++) {
    const result = await generateStep(slidesPlan[i], theme || "default");

    if (i > 0) {
      yield "\n\n---SLIDE---\n\n";
    }
    yield result;
  }
}



export async function generateInfographic(options: InfographicGenerateOptions) {
  const generator = createInfographicStream(options);
  const results: string[] = [];
  for await (const chunk of generator) {
    results.push(chunk);
  }
  return results.join("");
}

export async function generateInfographicLegacy(topic: string, description: string) {
  return generateInfographic({ topic, description });
}

// ===== EDIT SLIDE FUNCTION =====

const EDIT_SLIDE_SYSTEM_PROMPT = `
You are an expert AntV Infographic editor.Your task is to modify an existing infographic slide based on user instructions.

## Rules
1. ** Targeted Modification **: Focus strictly on what the user wants to change.
2. ** Data Updates Permitted **: If the user asks to change data, text, or values, you MUST update the \`items\` array accordingly.
3. **Template Flexibility**: If the user asks for a different chart type (e.g. "change to pie chart"), you SHOULD change the template name (e.g. \`chart-pie-...\`).
4. **Valid DSL**: Output must be valid AntV Infographic DSL syntax.
5. **No Explanations**: Output ONLY the modified DSL in \`\`\`plain block.

## DSL Structure (must follow)
\`\`\`
infographic <template-name>
data
  title Your Title
  desc Description
  items
    - label Item
      value 100
theme
  palette #color1 #color2
\`\`\`

## Common Modifications & Actions
- **"Change data/content"**: Completely rewrite the \`items\` list with new data.
- **"Change title"**: Update \`title\` in data block.
- **"Change color"**: Update \`palette\` in theme block.
- **"Change style/chart"**: Change the \`infographic <template-name>\` line to a more suitable template.

## DATA COMPATIBILITY RULES (CRITICAL)
6. **Chart Templates** (\`chart-*\`): MUST have \`value\` (number) for every item. If original data has no numbers, you **MUST** generate estimated or placeholder values (e.g., \`value 10\`). NEVER output a chart template without \`value\` fields.
7. **Adhere to Template capabilities**: Do not use chart templates for purely text data unless you can transform it.

## VALID TEMPLATES (You MUST choose from this list ONLY)
${ALL_VALID_TEMPLATES.join("\\n")}

Output ONLY the complete modified DSL.
`;

export async function editInfographicSlide(
  originalDsl: string,
  editInstruction: string,
  theme?: string
): Promise<string> {
  const model = modelPicker("openai");

  let themeContext = "";
  if (theme === "porsche") {
    themeContext = `Current theme: Porsche (fontFamily "Porsche Next TT", palette #E60012 #000000 #FFFFFF)`;
  } else if (theme === "tech") {
    themeContext = `Current theme: Tech blue (palette #3b82f6 #8b5cf6 #60a5fa)`;
  } else if (theme === "nature") {
    themeContext = `Current theme: Nature green (palette #22c55e #10b981 #84cc16)`;
  }

  const prompt = `
## Original DSL
\`\`\`
${originalDsl}
\`\`\`

## User's Modification Request
${editInstruction}

${themeContext ? `## Theme Context\n${themeContext}` : ""}

Apply the user's modification and output the complete modified DSL.
`;

  const { text } = await generateText({
    model,
    system: EDIT_SLIDE_SYSTEM_PROMPT,
    prompt,
  });

  // Clean the response
  let cleanDsl = text
    .replace(/```plain\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  // Robust extraction: Find the start of the DSL
  const dslStartIndex = cleanDsl.indexOf("infographic ");
  if (dslStartIndex > 0) {
    cleanDsl = cleanDsl.substring(dslStartIndex);
  }

  // Apply structure fix if needed
  return fixDslStructure(cleanDsl);
}
