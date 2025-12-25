import { useEffect, useState } from "react";

interface OverlayElement {
  id: string;
  type: "text" | "image" | "box" | "alert";
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  visible: boolean;
  style: {
    fontSize?: number;
    fontColor?: string;
    backgroundColor?: string;
    borderRadius?: number;
    opacity?: number;
  };
}

interface OverlayConfig {
  aspectRatio: string;
  elements: OverlayElement[];
}

export default function CustomOverlay() {
  const [config, setConfig] = useState<OverlayConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const configId = params.get('id');

    if (!configId) {
      setError('Missing overlay configuration ID. Please generate a new overlay URL from the editor.');
      setLoading(false);
      return;
    }

    const fetchConfig = async () => {
      try {
        const response = await fetch(`/api/overlay/config/${configId}`);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          setError(errorData.error || 'Failed to load overlay configuration');
          return;
        }

        const data = await response.json();
        setConfig(data);
        setError(null);
      } catch (err: any) {
        console.error('Error loading overlay:', err);
        setError('Failed to load overlay configuration');
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  if (loading) {
    return null;
  }

  if (error) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-transparent">
        <div className="p-6 bg-red-900/80 backdrop-blur-md border-2 border-red-500/50 rounded-lg max-w-md">
          <h2 className="text-white font-bold text-lg mb-2">Overlay Error</h2>
          <p className="text-red-200 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return null;
  }

  return (
    <div className="w-screen h-screen relative bg-transparent overflow-hidden">
      {config.elements
        .filter(el => el.visible)
        .map(element => (
          <div
            key={element.id}
            style={{
              position: 'absolute',
              left: `${element.x}%`,
              top: `${element.y}%`,
              width: `${element.width}px`,
              height: `${element.height}px`,
              backgroundColor: element.style.backgroundColor || 'transparent',
              borderRadius: `${element.style.borderRadius || 0}px`,
              opacity: (element.style.opacity || 100) / 100,
              color: element.style.fontColor || '#ffffff',
              fontSize: `${element.style.fontSize || 14}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '8px',
              boxSizing: 'border-box',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontWeight: element.type === 'alert' ? 600 : 400,
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)',
            }}
          >
            {element.content}
          </div>
        ))}
    </div>
  );
}
