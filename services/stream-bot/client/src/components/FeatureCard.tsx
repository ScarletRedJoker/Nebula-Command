import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  action?: {
    label: string;
    onClick: () => void;
  };
  iconColor?: string;
}

export function FeatureCard({
  icon: Icon,
  title,
  description,
  badge,
  badgeVariant = "secondary",
  action,
  iconColor = "text-primary",
}: FeatureCardProps) {
  return (
    <Card className="hover-elevate">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Icon className={`h-5 w-5 ${iconColor}`} />
            </div>
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          {badge && <Badge variant={badgeVariant}>{badge}</Badge>}
        </div>
        <CardDescription className="text-sm">
          {description}
        </CardDescription>
      </CardHeader>
      {action && (
        <CardContent>
          <Button variant="outline" size="sm" onClick={action.onClick} className="w-full">
            {action.label}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
