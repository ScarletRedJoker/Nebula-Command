import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient, getOpenAIApiKey } from "@/lib/openai/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { prompt, type = "layout", currentHtml, currentCss } = body;

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const apiKey = getOpenAIApiKey();
    if (!apiKey) {
      return NextResponse.json({ 
        error: "OpenAI API key not configured",
        suggestion: "Please configure your OpenAI API key in the settings"
      }, { status: 503 });
    }

    const client = getOpenAIClient();

    let systemPrompt = "";
    if (type === "layout") {
      systemPrompt = `You are an expert web designer. Generate clean, modern HTML and CSS based on the user's request.
Return your response as a JSON object with "html" and "css" fields.
Use semantic HTML5 elements. Make it responsive. Use modern CSS with flexbox/grid.
Do not include <html>, <head>, or <body> tags - just the content elements.
Use inline styles sparingly - prefer CSS classes.`;
    } else if (type === "content") {
      systemPrompt = `You are a content writer. Generate engaging website content based on the user's request.
Return your response as a JSON object with "content" field containing HTML content.
Make it professional and engaging. Use proper headings, paragraphs, and formatting.`;
    } else if (type === "improve") {
      systemPrompt = `You are an expert web designer. Analyze the current HTML/CSS and suggest improvements.
Return your response as a JSON object with "html", "css", and "suggestions" fields.
Focus on: visual design, accessibility, responsiveness, and user experience.
Current HTML: ${currentHtml || "None"}
Current CSS: ${currentCss || "None"}`;
    } else if (type === "component") {
      systemPrompt = `You are an expert web component designer. Generate a reusable HTML component based on the user's request.
Return your response as a JSON object with "html" and "css" fields.
Make it self-contained and reusable. Use CSS classes with unique prefixes to avoid conflicts.`;
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 4096,
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { html: responseText, css: "" };
    }

    return NextResponse.json({ 
      success: true, 
      projectId: id,
      type,
      ...result,
      tokensUsed: completion.usage?.total_tokens || 0,
    });
  } catch (error: unknown) {
    console.error("AI Generate error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to generate content" 
    }, { status: 500 });
  }
}
