"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Globe,
  Plus,
  Search,
  ExternalLink,
  Edit,
  Trash2,
  Eye,
  MoreVertical,
  Layout,
  Briefcase,
  FileText,
  Palette,
} from "lucide-react";

const websites = [
  {
    id: "1",
    name: "scarletredjoker.com",
    description: "Personal portfolio website",
    type: "portfolio",
    status: "published",
    lastUpdated: "2 days ago",
    url: "https://www.scarletredjoker.com",
  },
  {
    id: "2",
    name: "rig-city.com",
    description: "Gaming community website",
    type: "community",
    status: "published",
    lastUpdated: "5 days ago",
    url: "https://www.rig-city.com",
  },
  {
    id: "3",
    name: "evindrake.net",
    description: "Personal blog and homelab documentation",
    type: "blog",
    status: "draft",
    lastUpdated: "1 week ago",
    url: "https://evindrake.net",
  },
];

const templates = [
  {
    id: "portfolio",
    name: "Portfolio",
    description: "Showcase your work and skills",
    icon: Briefcase,
  },
  {
    id: "blog",
    name: "Blog",
    description: "Share your thoughts and ideas",
    icon: FileText,
  },
  {
    id: "landing",
    name: "Landing Page",
    description: "Convert visitors into customers",
    icon: Layout,
  },
  {
    id: "custom",
    name: "Custom",
    description: "Start from scratch",
    icon: Palette,
  },
];

export default function WebsitesPage() {
  const [search, setSearch] = useState("");
  const [showNewSite, setShowNewSite] = useState(false);

  const filteredWebsites = websites.filter(
    (site) =>
      site.name.toLowerCase().includes(search.toLowerCase()) ||
      site.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Websites</h1>
          <p className="text-muted-foreground">
            Create and manage your websites
          </p>
        </div>
        <Button onClick={() => setShowNewSite(!showNewSite)}>
          <Plus className="mr-2 h-4 w-4" />
          New Website
        </Button>
      </div>

      {showNewSite && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Website</CardTitle>
            <CardDescription>Choose a template to get started</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              {templates.map((template) => (
                <Link
                  key={template.id}
                  href={`/websites/new?template=${template.id}`}
                  className="group"
                >
                  <Card className="cursor-pointer transition-colors hover:border-primary">
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center text-center">
                        <div className="rounded-full bg-primary/10 p-3 group-hover:bg-primary/20 transition-colors">
                          <template.icon className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="mt-4 font-medium">{template.name}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {template.description}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search websites..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredWebsites.map((site) => (
          <Card key={site.id} className="relative overflow-hidden">
            <div
              className={`absolute right-4 top-4 rounded-full px-2 py-1 text-xs font-medium ${
                site.status === "published"
                  ? "bg-green-500/10 text-green-500"
                  : "bg-yellow-500/10 text-yellow-500"
              }`}
            >
              {site.status}
            </div>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Globe className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">{site.name}</CardTitle>
                  <CardDescription>{site.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Type: {site.type}</span>
                <span>Updated {site.lastUpdated}</span>
              </div>
              <div className="flex gap-2">
                <Link href={`/websites/${site.id}/design`} className="flex-1">
                  <Button variant="outline" className="w-full" size="sm">
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </Link>
                <Button variant="outline" size="sm" asChild>
                  <a href={site.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
                <Button variant="outline" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
