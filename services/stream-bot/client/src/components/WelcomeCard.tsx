import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Sparkles, Zap, BarChart3, Settings } from "lucide-react";

export function WelcomeCard() {
  const { user, refreshUser } = useAuth();

  const dismissMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/auth/dismiss-welcome", {});
    },
    onSuccess: () => {
      refreshUser();
    },
  });

  if (!user || user.dismissedWelcome) {
    return null;
  }

  const quickLinks = [
    {
      title: "Quick Trigger",
      description: "Post a fact now",
      href: "/trigger",
      icon: Zap,
      color: "text-yellow-500",
    },
    {
      title: "View Activity",
      description: "See recent posts",
      href: "/activity",
      icon: BarChart3,
      color: "text-blue-500",
    },
    {
      title: "Bot Settings",
      description: "Configure behavior",
      href: "/settings",
      icon: Settings,
      color: "text-purple-500",
    },
  ];

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>Welcome to StreamBot!</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 -mt-1 -mr-2"
            onClick={() => dismissMutation.mutate()}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>
          Your AI-powered streaming companion is ready to help engage your viewers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Getting Started</Badge>
          <span className="text-sm text-muted-foreground">Here are some quick actions:</span>
        </div>
        
        <div className="grid gap-3 sm:grid-cols-3">
          {quickLinks.map((link) => (
            <a key={link.href} href={link.href}>
              <div className="group relative rounded-lg border border-border bg-background/50 p-4 hover:bg-accent hover:border-primary/30 transition-all cursor-pointer">
                <div className="flex flex-col gap-2">
                  <link.icon className={`h-5 w-5 ${link.color}`} />
                  <div>
                    <div className="text-sm font-medium">{link.title}</div>
                    <div className="text-xs text-muted-foreground">{link.description}</div>
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-background/50 border border-border">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Tip:</strong> Connect more platforms in Settings to post facts across Twitch, YouTube, and Kick simultaneously!
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
