import { generateText, generateObject } from "ai";
import { z } from "zod";
import { modelPicker } from "./model-picker";
import { searchWeb } from "./search-service";
import { InfographicGenerateOptions, ALL_VALID_TEMPLATES } from "./infographic-constants";

// ===== SIMPLE MODE (Original Workflow) =====

const SIMPLE_MODE_SYSTEM_PROMPT = `
## Role
You are an expert in infographic generation, mastering the core concepts of AntV Infographic and familiar with the syntax of AntV Infographic.

## Task
Based on the given content, output AntV Infographic Syntax. You need to:
1. Extract key information structure (title, description, items, etc).
2. Select an appropriate template and theme.
3. Use the AntV Infographic Syntax to describe the content, convenient for real-time streaming rendering.

## Output Format
Always use AntV Infographic Syntax plain text, wrapped in \`\`\`plain code block, no explanatory text should be output.

## CRITICAL STRUCTURE (MUST FOLLOW EXACTLY)

The DSL has THREE root-level blocks:
1. \`infographic <template-name>\` - First line only
2. \`data\` - Contains title, desc, items (NO indentation)
3. \`theme\` - Contains palette, fontFamily (NO indentation)

**CORRECT STRUCTURE:**
\`\`\`
infographic <template-name>
data
  title Your Title Here
  desc Description here
  items
    - label Item 1
      value 100
theme
  palette #color1 #color2 #color3
\`\`\`

**WRONG STRUCTURE (DO NOT DO THIS):**
\`\`\`
infographic <template-name>
  title Wrong!        ← WRONG: title should NOT be indented here
  data                ← WRONG: data should NOT be indented
    value 100
\`\`\`

## AntV Infographic Syntax Rules

1. **First line**: \`infographic <template-name>\` (NO indentation after this line for data/theme)
2. **Indentation**: Exactly TWO spaces per level, starting INSIDE data/theme blocks
3. **Key-value**: "key value" (space-separated, NO colons)
4. **Arrays**: prefix with "-" (hyphen + space)
5. **Icon format**: MUST use "mdi/" prefix (e.g., "mdi/rocket-launch", "mdi/chart-line")
6. **Data block**: At root level, contains title/desc/items
7. **Items fields**: label(string) / value(number) / desc(string) / icon(string) / time(string) / children(object)
8. **Theme block**: At root level, contains palette (space-separated hex colors) AND fontFamily
9. **NO JSON, NO Markdown fences around the plain block, NO explanations**

## Valid Templates (MUST choose from this list)
${ALL_VALID_TEMPLATES.join("\\n")}

## Template-Specific Rules
- **Comparison templates** (compare-*): Construct exactly TWO root nodes and place every comparison item under them as children
- **Hierarchy templates** (hierarchy-*): Use "children" field for nested structures
- **Sequence templates** (sequence-*): Include "time" field if applicable
- **Chart templates** (chart-*): Put numeric data in items with "value" field

## Theme Rules
- **Porsche theme**: MUST use \`fontFamily "Porsche Next TT"\` + palette #E60012 #000000 #FFFFFF
- **Tech theme**: Blue palette #3b82f6 #8b5cf6 #60a5fa
- **Nature theme**: Green palette #22c55e #10b981 #84cc16

## Example 1: List Template
\`\`\`plain
infographic list-row-horizontal-icon-arrow
data
  title Internet Technology Evolution
  desc From Web 1.0 to AI era
  items
    - time 1991
      label Web 1.0
      desc Tim Berners-Lee published the first website
      icon mdi/web
    - time 2004
      label Web 2.0
      desc Social media becomes mainstream
      icon mdi/account-multiple
    - time 2023
      label AI Era
      desc ChatGPT ignites generative AI revolution
      icon mdi/brain
theme
  palette #3b82f6 #8b5cf6 #f97316
\`\`\`

## Example 2: Chart Template
\`\`\`plain
infographic chart-bar-plain-text
data
  title Q1 Sales Report
  desc Quarterly performance overview
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

## Critical Rules
- You are NOT allowed to output JSON, Markdown, explanations or additional text
- Output ONLY the DSL in \`\`\`plain block
- Strict indentation (2 spaces) INSIDE data/theme blocks
- data and theme MUST be at root level (no indentation)
- All icons with mdi/ prefix
`;

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
        items[items.length - 1] += '\n    ' + trimmed;
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

async function* generateSimpleMode(
  topic: string,
  description: string,
  slideCount: number,
  theme?: string
): AsyncGenerator<string, void, unknown> {
  const model = modelPicker("openai");

  let themeInstructions = "";
  if (theme === "porsche") {
    themeInstructions = `\n**Theme**: Use Porsche theme with fontFamily "Porsche Next TT" and palette #E60012 #000000 #FFFFFF`;
  } else if (theme === "tech") {
    themeInstructions = `\n**Theme**: Use tech theme with blue palette #3b82f6 #8b5cf6 #60a5fa`;
  } else if (theme === "nature") {
    themeInstructions = `\n**Theme**: Use nature theme with green palette #22c55e #10b981 #84cc16`;
  }

  for (let i = 0; i < slideCount; i++) {
    const prompt = `
Topic: ${topic}
${description ? `Description: ${description}` : ""}

Generate slide ${i + 1} of ${slideCount} covering a specific aspect of this topic.
${themeInstructions}

Output ONLY the AntV Infographic Syntax. No explanations.
`;

    const result = await generateText({
      model,
      system: SIMPLE_MODE_SYSTEM_PROMPT,
      prompt,
    });

    const cleanDsl = result.text
      .replace(/```plain\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    // Fix incorrectly indented DSL structure
    const fixedDsl = fixDslStructure(cleanDsl);

    if (i > 0) {
      yield "\n\n---SLIDE---\n\n";
    }
    yield fixedDsl;
  }
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
5. Output ONLY the DSL in \`\`\`plain block, NO explanations
`;

async function researchStep(topic: string, description: string): Promise<string> {
  console.log(`[Research Mode] Researching: ${topic}`);
  const model = modelPicker("openai");

  const queryResult = await generateText({
    model,
    system: "You are a search query generator. Output ONLY a concise search query.",
    prompt: `Topic: ${topic}\nDetails: ${description}`,
  });

  const searchQuery = queryResult.text.trim().replace(/^"|"$/g, '');
  const searchResults = await searchWeb(searchQuery);

  if (!searchResults || searchResults.length === 0) {
    return "No external data found.";
  }

  return searchResults.map(r => `- ${r.title}: ${r.snippet}`).join("\n");
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
    prompt: `Topic: ${topic}\nUser Request: ${description}\nResearch:\n${researchData}\n\nPlan ${slideCount} slides.${templateHint ? `\nPreferred category: ${templateHint}` : ""}`,
  });

  return object.slides;
}

async function generateStep(plan: any, theme: string = "default") {
  const model = modelPicker("openai");

  let themeInstructions = "";
  if (theme === "porsche") {
    themeInstructions = `**Theme**: Porsche - fontFamily "Porsche Next TT", palette #E60012 #000000 #FFFFFF`;
  } else if (theme === "tech") {
    themeInstructions = `**Theme**: Tech blue - palette #3b82f6 #8b5cf6 #60a5fa`;
  } else if (theme === "nature") {
    themeInstructions = `**Theme**: Nature green - palette #22c55e #10b981 #84cc16`;
  }

  const { text } = await generateText({
    model,
    system: GENERATION_SYSTEM_PROMPT,
    prompt: `Template: "${plan.templateName}"\nTitle: ${plan.titleSuggestion}\nData: ${JSON.stringify(plan.dataPoints)}\n${themeInstructions}\n${plan.category === 'compare' ? 'CRITICAL: TWO root nodes for comparison.\n' : ''}`,
  });

  return text.replace(/```plain\n?/g, "").replace(/```\n?/g, "").trim();
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

// ===== MAIN EXPORT =====

export async function* generateInfographicStream(options: InfographicGenerateOptions): AsyncGenerator<string, void, unknown> {
  const { topic, description, theme, itemsCount = 1, webSearchEnabled = false } = options;

  if (webSearchEnabled) {
    // Research Mode (Agentic)
    yield* generateResearchMode(options);
  } else {
    // Simple Mode (Direct, like original workflow)
    yield* generateSimpleMode(topic, description, itemsCount, theme);
  }
}

export async function generateInfographic(options: InfographicGenerateOptions) {
  const generator = generateInfographicStream(options);
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
You are an expert AntV Infographic editor. Your task is to modify an existing infographic slide based on user instructions.

## Rules
1. **Targeted Modification**: Focus strictly on what the user wants to change.
2. **Data Updates Permitted**: If the user asks to change data, text, or values, you MUST update the \`items\` array accordingly.
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
