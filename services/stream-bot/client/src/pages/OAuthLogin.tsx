import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Twitch, Youtube } from 'lucide-react';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';

export default function OAuthLogin() {
  const [location] = useLocation();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    const successParam = params.get('success');

    if (errorParam) {
      const errorMessages: Record<string, string> = {
        'twitch_auth_failed': 'Twitch authentication failed. Please try again.',
        'youtube_auth_failed': 'YouTube authentication failed. Please try again.',
        'kick_auth_failed': 'Kick authentication failed. Please try again.',
      };
      setError(errorMessages[errorParam] || 'Authentication failed. Please try again.');
    }

    if (successParam) {
      const successMessages: Record<string, string> = {
        'twitch_signin': 'Successfully signed in with Twitch!',
        'youtube_signin': 'Successfully signed in with YouTube!',
      };
      setSuccess(successMessages[successParam] || 'Successfully signed in!');
    }
  }, [location]);

  const handleTwitchLogin = () => {
    window.location.href = '/api/auth/twitch';
  };

  const handleYouTubeLogin = () => {
    window.location.href = '/api/auth/youtube';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-bold">Welcome to StreamBot</CardTitle>
          <CardDescription className="text-base">
            Sign in with your streaming platform to get started
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="bg-green-50 text-green-900 border-green-200">
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            <Button
              onClick={handleTwitchLogin}
              className="w-full h-12 text-base bg-[#9146FF] hover:bg-[#7d3bd1] text-white"
              size="lg"
            >
              <Twitch className="mr-2 h-5 w-5" />
              Sign in with Twitch
            </Button>

            <Button
              onClick={handleYouTubeLogin}
              className="w-full h-12 text-base bg-[#FF0000] hover:bg-[#cc0000] text-white"
              size="lg"
            >
              <Youtube className="mr-2 h-5 w-5" />
              Sign in with YouTube
            </Button>

            <Button
              disabled
              className="w-full h-12 text-base bg-[#53FC18] hover:bg-[#45d614] text-black opacity-50 cursor-not-allowed"
              size="lg"
              title="Kick authentication coming soon"
            >
              <svg 
                className="mr-2 h-5 w-5" 
                viewBox="0 0 24 24" 
                fill="currentColor"
              >
                <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
              </svg>
              Sign in with Kick (Coming Soon)
            </Button>
          </div>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>
              By signing in, you agree to let StreamBot manage your chat bot
              and access your streaming data.
            </p>
          </div>

          <div className="mt-4 text-center text-xs text-muted-foreground">
            <p>
              <strong>New to StreamBot?</strong> Just click a button above!
              We'll automatically create your account when you sign in for the first time.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
