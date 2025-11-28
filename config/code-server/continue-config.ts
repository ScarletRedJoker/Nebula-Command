export function modifyConfig(config: any): any {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    console.warn("OPENAI_API_KEY not found - Jarvis will use fallback models");
  }

  config.models = [
    ...(openaiKey ? [
      {
        title: "Jarvis (GPT-4o)",
        provider: "openai",
        model: "gpt-4o",
        apiKey: openaiKey,
        contextLength: 128000
      },
      {
        title: "GPT-4o Mini (Fast)",
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: openaiKey,
        contextLength: 128000
      }
    ] : []),
    {
      title: "Qwen2.5-Coder (Local)",
      provider: "ollama",
      model: "qwen2.5-coder:14b",
      apiBase: "http://172.17.0.1:11434"
    }
  ];

  config.tabAutocompleteModel = {
    title: "Qwen2.5-Coder (Local)",
    provider: "ollama",
    model: "qwen2.5-coder:14b",
    apiBase: "http://172.17.0.1:11434"
  };

  config.contextProviders = [
    { name: "file", params: {} },
    { name: "code", params: {} },
    { name: "docs", params: {} },
    { name: "terminal", params: {} },
    { name: "folder", params: {} }
  ];

  config.slashCommands = [
    { name: "edit", description: "Edit selected code" },
    { name: "comment", description: "Write comments for the selected code" },
    { name: "share", description: "Export the current session" },
    { name: "cmd", description: "Generate a shell command" },
    { name: "commit", description: "Generate a commit message" }
  ];

  config.customCommands = [
    {
      name: "homelab-fix",
      description: "Fix issues in homelab services",
      prompt: "You are Jarvis, an AI assistant for the Nebula Command homelab. Review the selected code and fix any issues. Focus on: Docker configuration, Flask/Express routes, database connections, and security. Explain what you fixed."
    },
    {
      name: "homelab-review",
      description: "Review homelab service code",
      prompt: "You are Jarvis, reviewing code for the Nebula Command homelab. Check for: security vulnerabilities, Docker best practices, proper error handling, and production readiness. Provide actionable recommendations."
    },
    {
      name: "homelab-deploy",
      description: "Generate deployment instructions",
      prompt: "You are Jarvis. Based on the selected service code, generate proper deployment instructions for the Ubuntu 25.10 homelab server. Include: Docker commands, environment variables needed, health checks, and Caddy reverse proxy configuration."
    },
    {
      name: "homelab-status",
      description: "Check homelab service status",
      prompt: "You are Jarvis. Generate commands to check the status of homelab Docker services. Include: docker compose ps, container health, log snippets, and any issues detected."
    }
  ];

  config.allowAnonymousTelemetry = false;

  config.docs = [
    {
      name: "HomeLabHub",
      startUrl: "https://github.com/evindrake/HomeLabHub"
    }
  ];

  config.systemMessage = "You are Jarvis, an AI assistant for the Nebula Command homelab dashboard. You help Evin manage 15+ Docker services including: Stream Bot (Twitch/YouTube/Kick facts), Discord Bot, Dashboard, n8n automation, Plex, Home Assistant, and more. The services run on Ubuntu 25.10 at host.evindrake.net with Caddy for reverse proxy and automatic SSL. When helping with code, focus on: security best practices, Docker configuration, proper error handling, and production readiness.";

  return config;
}
