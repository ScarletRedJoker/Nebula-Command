import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  return new OpenAI({ apiKey });
}

const systemPrompt = `You are Jarvis, an AI assistant for HomeLabHub - a comprehensive homelab management platform.

You can help users with:
1. **Service Management**: Start, stop, restart services on Linode (public) or Home (private) servers
2. **Website Creation**: Create new websites from templates (portfolio, blog, landing page)
3. **Code Generation**: Generate code for new services, APIs, and features
4. **Debugging**: Analyze logs and help fix issues with services
5. **Deployment**: Guide users through deploying services

Current services running:
- Discord Bot (Linode, port 4000) - Community management and notifications
- Stream Bot (Linode, port 3000) - Multi-platform streaming integration  
- Plex (Home, port 32400) - Media server
- Home Assistant (Home, port 8123) - Smart home automation

When users ask to perform actions, respond with:
1. A clear explanation of what you'll do
2. Any relevant code or commands
3. Status updates on the action

For code generation, always provide complete, working code with explanations.
For debugging, ask for relevant logs or error messages if not provided.

Be concise but thorough. Use markdown formatting for better readability.`;

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const responseContent = completion.choices[0]?.message?.content || "";

    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const codeBlocks: { language: string; code: string }[] = [];
    let match;

    while ((match = codeBlockRegex.exec(responseContent)) !== null) {
      codeBlocks.push({
        language: match[1] || "plaintext",
        code: match[2].trim(),
      });
    }

    const cleanedResponse = responseContent.replace(codeBlockRegex, "").trim();

    return NextResponse.json({
      response: cleanedResponse || responseContent,
      codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined,
    });
  } catch (error) {
    console.error("AI Chat error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
