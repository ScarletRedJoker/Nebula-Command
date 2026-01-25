'use client';

import { ImageGenerator } from '@/components/ai/ImageGenerator';

export default function ImageGenPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">AI Image Generator</h1>
        <p className="text-muted-foreground mt-1">
          Generate images using Stable Diffusion on your Windows AI VM
        </p>
      </div>
      <ImageGenerator />
    </div>
  );
}
