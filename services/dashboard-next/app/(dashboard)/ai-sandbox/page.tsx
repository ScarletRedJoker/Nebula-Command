"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Wand2,
  Check,
  X,
  Play,
  RotateCcw,
  Trash2,
  FileCode,
  FilePlus,
  FileX,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeChange {
  id: string;
  filePath: string;
  operation: "create" | "edit" | "delete";
  originalContent?: string;
  proposedContent?: string;
  diff?: string;
  reason: string;
}

interface CodeProposal {
  id: string;
  title: string;
  description: string;
  changes: CodeChange[];
  status: "pending" | "approved" | "rejected" | "applied" | "rolled_back";
  createdBy: string;
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  appliedAt?: string;
  rollbackAvailable: boolean;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
  approved: "bg-green-500/20 text-green-400 border-green-500/50",
  rejected: "bg-red-500/20 text-red-400 border-red-500/50",
  applied: "bg-blue-500/20 text-blue-400 border-blue-500/50",
  rolled_back: "bg-gray-500/20 text-gray-400 border-gray-500/50",
};

const operationIcons = {
  create: FilePlus,
  edit: FileCode,
  delete: FileX,
};

export default function AISandboxPage() {
  const [proposals, setProposals] = useState<CodeProposal[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<CodeProposal | null>(null);
  const [expandedChanges, setExpandedChanges] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetchProposals();
  }, [filter]);

  const fetchProposals = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== "all") {
        params.set("status", filter);
      }
      const response = await fetch(`/api/ai-sandbox/proposals?${params}`);
      const data = await response.json();
      setProposals(data.proposals || []);
    } catch (error) {
      console.error("Failed to fetch proposals:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateProposal = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    try {
      const response = await fetch("/api/ai-sandbox/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          title: `AI: ${prompt.substring(0, 50)}...`,
        }),
      });
      const data = await response.json();
      if (data.proposal) {
        setProposals((prev) => [data.proposal, ...prev]);
        setSelectedProposal(data.proposal);
        setPrompt("");
      }
    } catch (error) {
      console.error("Failed to generate proposal:", error);
    } finally {
      setGenerating(false);
    }
  };

  const handleAction = async (
    proposalId: string,
    action: "approve" | "reject" | "apply" | "rollback" | "delete"
  ) => {
    setActionLoading(`${proposalId}-${action}`);
    try {
      let response;
      if (action === "approve" || action === "reject") {
        response = await fetch(`/api/ai-sandbox/proposals/${proposalId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: action === "approve" ? "approved" : "rejected", reviewNotes }),
        });
      } else if (action === "apply") {
        response = await fetch(`/api/ai-sandbox/proposals/${proposalId}`, {
          method: "POST",
        });
      } else if (action === "rollback") {
        response = await fetch(`/api/ai-sandbox/proposals/${proposalId}/rollback`, {
          method: "POST",
        });
      } else if (action === "delete") {
        response = await fetch(`/api/ai-sandbox/proposals/${proposalId}`, {
          method: "DELETE",
        });
      }

      if (response?.ok) {
        await fetchProposals();
        if (action === "delete") {
          setSelectedProposal(null);
        } else {
          const data = await response.json();
          if (data.proposal) {
            setSelectedProposal(data.proposal);
          }
        }
        setReviewNotes("");
      }
    } catch (error) {
      console.error(`Failed to ${action} proposal:`, error);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleChange = (changeId: string) => {
    setExpandedChanges((prev) => {
      const next = new Set(prev);
      if (next.has(changeId)) {
        next.delete(changeId);
      } else {
        next.add(changeId);
      }
      return next;
    });
  };

  const renderDiff = (diff: string) => {
    const lines = diff.split("\n");
    return (
      <pre className="text-xs overflow-x-auto p-2 bg-black/50 rounded">
        {lines.map((line, i) => {
          let className = "block";
          if (line.startsWith("+") && !line.startsWith("+++")) {
            className += " text-green-400 bg-green-500/10";
          } else if (line.startsWith("-") && !line.startsWith("---")) {
            className += " text-red-400 bg-red-500/10";
          } else if (line.startsWith("@@")) {
            className += " text-blue-400";
          } else if (line.startsWith("---") || line.startsWith("+++")) {
            className += " text-muted-foreground";
          }
          return (
            <code key={i} className={className}>
              {line}
            </code>
          );
        })}
      </pre>
    );
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-4">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Wand2 className="h-8 w-8 text-primary" />
          AI Sandbox
        </h1>
        <p className="text-muted-foreground">
          AI-generated code proposals with human approval workflow
        </p>
      </div>

      <Card className="p-4">
        <div className="flex gap-2">
          <Input
            placeholder="Describe what code changes you want AI to generate..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && generateProposal()}
            disabled={generating}
            className="flex-1"
          />
          <Button onClick={generateProposal} disabled={generating || !prompt.trim()}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Generate
          </Button>
        </div>
      </Card>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden">
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Proposals</CardTitle>
              <Tabs value={filter} onValueChange={setFilter} className="w-auto">
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="text-xs px-2">All</TabsTrigger>
                  <TabsTrigger value="pending" className="text-xs px-2">Pending</TabsTrigger>
                  <TabsTrigger value="approved" className="text-xs px-2">Approved</TabsTrigger>
                  <TabsTrigger value="applied" className="text-xs px-2">Applied</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : proposals.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No proposals found. Generate one using AI above!
              </div>
            ) : (
              <div className="space-y-2">
                {proposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    className={cn(
                      "p-3 rounded-lg border cursor-pointer transition-colors",
                      selectedProposal?.id === proposal.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-accent"
                    )}
                    onClick={() => setSelectedProposal(proposal)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">{proposal.title}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {proposal.changes.length} change{proposal.changes.length !== 1 ? "s" : ""} •{" "}
                          by {proposal.createdBy}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-xs border shrink-0",
                          statusColors[proposal.status]
                        )}
                      >
                        {proposal.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col overflow-hidden">
          {selectedProposal ? (
            <>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">{selectedProposal.title}</CardTitle>
                    <CardDescription className="mt-1">
                      <Clock className="h-3 w-3 inline mr-1" />
                      {new Date(selectedProposal.createdAt).toLocaleString()}
                    </CardDescription>
                  </div>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-xs border",
                      statusColors[selectedProposal.status]
                    )}
                  >
                    {selectedProposal.status}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto space-y-4">
                {selectedProposal.description && (
                  <p className="text-sm text-muted-foreground">{selectedProposal.description}</p>
                )}

                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Changes</h4>
                  {selectedProposal.changes.map((change) => {
                    const Icon = operationIcons[change.operation];
                    const isExpanded = expandedChanges.has(change.id);
                    return (
                      <div key={change.id} className="border rounded-lg overflow-hidden">
                        <div
                          className="flex items-center gap-2 p-2 bg-secondary/50 cursor-pointer hover:bg-secondary"
                          onClick={() => toggleChange(change.id)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <Icon className="h-4 w-4" />
                          <span className="text-sm font-mono flex-1 truncate">{change.filePath}</span>
                          <span className="text-xs text-muted-foreground">{change.operation}</span>
                        </div>
                        {isExpanded && (
                          <div className="p-2 border-t">
                            <p className="text-xs text-muted-foreground mb-2">{change.reason}</p>
                            {change.diff && renderDiff(change.diff)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {selectedProposal.status === "pending" && (
                  <div className="space-y-2 pt-2">
                    <Input
                      placeholder="Add review notes (optional)"
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        variant="default"
                        onClick={() => handleAction(selectedProposal.id, "approve")}
                        disabled={actionLoading !== null}
                      >
                        {actionLoading === `${selectedProposal.id}-approve` ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Check className="h-4 w-4 mr-2" />
                        )}
                        Approve
                      </Button>
                      <Button
                        className="flex-1"
                        variant="destructive"
                        onClick={() => handleAction(selectedProposal.id, "reject")}
                        disabled={actionLoading !== null}
                      >
                        {actionLoading === `${selectedProposal.id}-reject` ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <X className="h-4 w-4 mr-2" />
                        )}
                        Reject
                      </Button>
                    </div>
                  </div>
                )}

                {selectedProposal.status === "approved" && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      className="flex-1"
                      onClick={() => handleAction(selectedProposal.id, "apply")}
                      disabled={actionLoading !== null}
                    >
                      {actionLoading === `${selectedProposal.id}-apply` ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Apply Changes
                    </Button>
                  </div>
                )}

                {selectedProposal.status === "applied" && selectedProposal.rollbackAvailable && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleAction(selectedProposal.id, "rollback")}
                      disabled={actionLoading !== null}
                    >
                      {actionLoading === `${selectedProposal.id}-rollback` ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <RotateCcw className="h-4 w-4 mr-2" />
                      )}
                      Rollback
                    </Button>
                  </div>
                )}

                {["pending", "rejected"].includes(selectedProposal.status) && (
                  <Button
                    variant="ghost"
                    className="w-full text-destructive"
                    onClick={() => handleAction(selectedProposal.id, "delete")}
                    disabled={actionLoading !== null}
                  >
                    {actionLoading === `${selectedProposal.id}-delete` ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Delete Proposal
                  </Button>
                )}

                {selectedProposal.reviewNotes && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      <strong>Review Notes:</strong> {selectedProposal.reviewNotes}
                    </p>
                    {selectedProposal.reviewedBy && (
                      <p className="text-xs text-muted-foreground">
                        Reviewed by {selectedProposal.reviewedBy} on{" "}
                        {new Date(selectedProposal.reviewedAt!).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Select a proposal to view details
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
