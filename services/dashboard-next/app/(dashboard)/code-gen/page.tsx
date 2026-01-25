'use client';

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Copy, Check, Download, Code2, FileCode, Play, Sparkles } from 'lucide-react';
import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface GeneratedFile {
  path: string;
  content: string;
  language: string;
}

interface CodeGenResponse {
  files: GeneratedFile[];
  instructions: string;
  dependencies?: string[];
  warnings?: string[];
  metadata?: {
    provider: string;
    latency: number;
    tokensUsed: number;
  };
}

type CodeType = 'component' | 'api-route' | 'docker-compose' | 'script';
type Framework = 'nextjs' | 'react' | 'express';
type Styling = 'tailwind' | 'css-modules' | 'styled-components';

export default function CodeGenPage() {
  const [prompt, setPrompt] = useState('');
  const [codeType, setCodeType] = useState<CodeType>('component');
  const [framework, setFramework] = useState<Framework>('nextjs');
  const [styling, setStyling] = useState<Styling>('tailwind');
  const [includeTests, setIncludeTests] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [response, setResponse] = useState<CodeGenResponse | null>(null);
  const [activeFile, setActiveFile] = useState(0);
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const { toast } = useToast();
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      toast({ title: 'Error', description: 'Please enter a prompt', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);
    setResponse(null);
    setStreamingContent('');
    setActiveFile(0);

    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch('/api/ai/code-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          type: codeType,
          framework: codeType === 'component' || codeType === 'api-route' ? framework : undefined,
          styling: codeType === 'component' ? styling : undefined,
          includeTests,
          stream: true,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Generation failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          
          if (data === '[DONE]') continue;

          try {
            const chunk = JSON.parse(data);
            
            if (chunk.content) {
              fullContent += chunk.content;
              setStreamingContent(fullContent);
            }
            
            if (chunk.response) {
              setResponse(chunk.response);
            }
            
            if (chunk.error) {
              throw new Error(chunk.error);
            }
          } catch (parseError) {
            continue;
          }
        }
      }

      if (!response) {
        toast({ title: 'Success', description: 'Code generated successfully!' });
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  }, [prompt, codeType, framework, styling, includeTests, toast, response]);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsGenerating(false);
  }, []);

  const copyToClipboard = useCallback(async (content: string, filePath: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedFile(filePath);
    toast({ title: 'Copied!', description: `${filePath} copied to clipboard` });
    setTimeout(() => setCopiedFile(null), 2000);
  }, [toast]);

  const downloadFile = useCallback((file: GeneratedFile) => {
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path.split('/').pop() || 'download';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const getLanguageForMonaco = (lang: string): string => {
    const map: Record<string, string> = {
      typescript: 'typescript',
      tsx: 'typescript',
      javascript: 'javascript',
      jsx: 'javascript',
      python: 'python',
      yaml: 'yaml',
      yml: 'yaml',
      json: 'json',
      css: 'css',
      html: 'html',
      bash: 'shell',
      shell: 'shell',
      dotenv: 'plaintext',
    };
    return map[lang.toLowerCase()] || 'plaintext';
  };

  const examples: Record<CodeType, string> = {
    component: 'User profile card with avatar, name, bio, and follow button. Include loading skeleton and error state.',
    'api-route': 'API endpoint for creating and listing blog posts with pagination, sorting, and author filtering.',
    'docker-compose': 'Full stack setup with Next.js app, PostgreSQL database, Redis cache, and Nginx reverse proxy.',
    script: 'Database backup script that compresses, encrypts, and uploads to S3 with email notification.',
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Code2 className="h-8 w-8" />
            AI Code Generator
          </h1>
          <p className="text-muted-foreground mt-1">
            Generate production-ready code from natural language prompts
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Configuration
            </CardTitle>
            <CardDescription>Describe what you want to build</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Code Type</Label>
                <Select value={codeType} onValueChange={(v) => setCodeType(v as CodeType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="component">React Component</SelectItem>
                    <SelectItem value="api-route">API Route</SelectItem>
                    <SelectItem value="docker-compose">Docker Compose</SelectItem>
                    <SelectItem value="script">Script</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(codeType === 'component' || codeType === 'api-route') && (
                <div className="space-y-2">
                  <Label>Framework</Label>
                  <Select value={framework} onValueChange={(v) => setFramework(v as Framework)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nextjs">Next.js</SelectItem>
                      <SelectItem value="react">React</SelectItem>
                      <SelectItem value="express">Express</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {codeType === 'component' && (
                <div className="space-y-2">
                  <Label>Styling</Label>
                  <Select value={styling} onValueChange={(v) => setStyling(v as Styling)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tailwind">TailwindCSS</SelectItem>
                      <SelectItem value="css-modules">CSS Modules</SelectItem>
                      <SelectItem value="styled-components">Styled Components</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center space-x-2 col-span-2">
                <Switch id="tests" checked={includeTests} onCheckedChange={setIncludeTests} />
                <Label htmlFor="tests">Include unit tests</Label>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Prompt</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPrompt(examples[codeType])}
                >
                  Use example
                </Button>
              </div>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={examples[codeType]}
                className="min-h-[150px] font-mono text-sm"
              />
            </div>

            <div className="flex gap-2">
              {isGenerating ? (
                <Button variant="destructive" onClick={handleCancel} className="flex-1">
                  Cancel
                </Button>
              ) : (
                <Button onClick={handleGenerate} className="flex-1" disabled={!prompt.trim()}>
                  <Play className="mr-2 h-4 w-4" />
                  Generate Code
                </Button>
              )}
            </div>

            {isGenerating && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Generating code...</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              Generated Code
            </CardTitle>
            {response?.metadata && (
              <div className="flex gap-2">
                <Badge variant="secondary">{response.metadata.provider}</Badge>
                <Badge variant="outline">{response.metadata.latency}ms</Badge>
                <Badge variant="outline">{response.metadata.tokensUsed} tokens</Badge>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {!response && !streamingContent ? (
              <div className="h-[400px] flex items-center justify-center text-muted-foreground border rounded-lg bg-muted/50">
                <div className="text-center">
                  <Code2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Generated code will appear here</p>
                </div>
              </div>
            ) : response?.files && response.files.length > 0 ? (
              <Tabs value={String(activeFile)} onValueChange={(v) => setActiveFile(Number(v))}>
                <TabsList className="w-full flex-wrap h-auto">
                  {response.files.map((file, idx) => (
                    <TabsTrigger key={file.path} value={String(idx)} className="text-xs">
                      {file.path.split('/').pop()}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {response.files.map((file, idx) => (
                  <TabsContent key={file.path} value={String(idx)} className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground font-mono">{file.path}</span>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(file.content, file.path)}
                        >
                          {copiedFile === file.path ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => downloadFile(file)}>
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="border rounded-lg overflow-hidden h-[350px]">
                      <MonacoEditor
                        height="100%"
                        language={getLanguageForMonaco(file.language)}
                        value={file.content}
                        theme="vs-dark"
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          fontSize: 13,
                          lineNumbers: 'on',
                          scrollBeyondLastLine: false,
                          wordWrap: 'on',
                        }}
                      />
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            ) : streamingContent ? (
              <div className="border rounded-lg overflow-hidden h-[400px]">
                <MonacoEditor
                  height="100%"
                  language="markdown"
                  value={streamingContent}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    wordWrap: 'on',
                  }}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {response && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {response.dependencies && response.dependencies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Dependencies</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {response.dependencies.map((dep) => (
                    <Badge key={dep} variant="secondary">
                      {dep}
                    </Badge>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() =>
                    copyToClipboard(`npm install ${response.dependencies?.join(' ')}`, 'install-command')
                  }
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy install command
                </Button>
              </CardContent>
            </Card>
          )}

          {response.instructions && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Setup Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-lg">
                    {response.instructions}
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}

          {response.warnings && response.warnings.length > 0 && (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg text-yellow-600">Warnings</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  {response.warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
