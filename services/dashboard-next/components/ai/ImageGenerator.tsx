'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Download, Loader2, Wand2, AlertCircle, CheckCircle } from 'lucide-react';

interface GeneratedImage {
  data: string;
  seed?: number;
}

export function ImageGenerator() {
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('blurry, low quality, distorted, ugly');
  const [steps, setSteps] = useState(30);
  const [cfgScale, setCfgScale] = useState(7);
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(512);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sdAvailable, setSdAvailable] = useState<boolean | null>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    checkSDHealth();
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, []);

  async function checkSDHealth() {
    try {
      const res = await fetch('/api/ai/image/txt2img');
      const data = await res.json();
      setSdAvailable(data.available);
    } catch {
      setSdAvailable(false);
    }
  }

  async function pollProgress() {
    try {
      const res = await fetch('/api/ai/image/progress');
      const data = await res.json();
      if (data.success) {
        setProgress(Math.round(data.progress * 100));
      }
    } catch {
    }
  }

  async function generate() {
    if (!prompt.trim()) return;

    setLoading(true);
    setProgress(0);
    setError(null);

    progressInterval.current = setInterval(pollProgress, 500);

    try {
      const res = await fetch('/api/ai/image/txt2img', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          negative_prompt: negativePrompt,
          steps,
          cfg_scale: cfgScale,
          width,
          height,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setImages(data.images.map((img: string, i: number) => ({
          data: img,
          seed: data.info?.all_seeds?.[i] || data.info?.seed,
        })));
      } else {
        setError(data.error || 'Generation failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
      setLoading(false);
      setProgress(0);
    }
  }

  function downloadImage(imageData: string, index: number) {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${imageData}`;
    link.download = `nebula-image-${Date.now()}-${index + 1}.png`;
    link.click();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Generation Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            {sdAvailable === null ? (
              <Badge variant="secondary">Checking...</Badge>
            ) : sdAvailable ? (
              <Badge className="bg-green-500/10 text-green-500">
                <CheckCircle className="h-3 w-3 mr-1" />
                SD Online
              </Badge>
            ) : (
              <Badge variant="destructive">
                <AlertCircle className="h-3 w-3 mr-1" />
                SD Offline
              </Badge>
            )}
          </div>

          <div>
            <Label htmlFor="prompt">Prompt</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A beautiful sunset over mountains, digital art, highly detailed, 4k"
              rows={4}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="negative">Negative Prompt</Label>
            <Textarea
              id="negative"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="blurry, low quality, distorted"
              rows={2}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Width: {width}px</Label>
              <Slider
                value={[width]}
                onValueChange={([v]) => setWidth(v)}
                min={256}
                max={1024}
                step={64}
                className="mt-2"
              />
            </div>
            <div>
              <Label>Height: {height}px</Label>
              <Slider
                value={[height]}
                onValueChange={([v]) => setHeight(v)}
                min={256}
                max={1024}
                step={64}
                className="mt-2"
              />
            </div>
          </div>

          <div>
            <Label>Steps: {steps}</Label>
            <Slider
              value={[steps]}
              onValueChange={([v]) => setSteps(v)}
              min={10}
              max={100}
              step={5}
              className="mt-2"
            />
          </div>

          <div>
            <Label>CFG Scale: {cfgScale}</Label>
            <Slider
              value={[cfgScale]}
              onValueChange={([v]) => setCfgScale(v)}
              min={1}
              max={20}
              step={0.5}
              className="mt-2"
            />
          </div>

          {loading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Generating...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          <Button
            onClick={generate}
            disabled={loading || !prompt.trim() || sdAvailable === false}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Generate Image
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Generated Images</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="flex items-center gap-2 p-4 mb-4 bg-destructive/10 text-destructive rounded-lg">
              <AlertCircle className="h-5 w-5" />
              {error}
            </div>
          )}

          {images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Wand2 className="h-12 w-12 mb-4 opacity-50" />
              <p>Your generated images will appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {images.map((img, i) => (
                <div key={i} className="relative group">
                  <img
                    src={`data:image/png;base64,${img.data}`}
                    alt={`Generated ${i + 1}`}
                    className="w-full rounded-lg border"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => downloadImage(img.data, i)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                  {img.seed && (
                    <Badge className="absolute bottom-2 left-2 text-xs">
                      Seed: {img.seed}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ImageGenerator;
