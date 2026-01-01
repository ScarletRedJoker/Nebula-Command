import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Plus, Trash2, Edit, Clock, Copy, ChevronLeft, ChevronRight, Code, Radio, Users, Gamepad2 } from "lucide-react";
import { SiTwitch, SiYoutube, SiKick } from "react-icons/si";
import { format, startOfWeek, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, addWeeks, subWeeks } from "date-fns";

interface StreamEvent {
  id: string;
  userId: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  platform: 'twitch' | 'youtube' | 'kick' | 'multi';
  eventType: 'stream' | 'watch_party' | 'community' | 'collab';
  isRecurring: boolean;
  recurringPattern: string | null;
  notifyDiscord: boolean;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

type ViewMode = 'week' | 'month';

const platformIcons: Record<string, React.ReactNode> = {
  twitch: <SiTwitch className="h-4 w-4 text-purple-500" />,
  youtube: <SiYoutube className="h-4 w-4 text-red-500" />,
  kick: <SiKick className="h-4 w-4 text-green-500" />,
  multi: <Radio className="h-4 w-4 text-blue-500" />,
};

const eventTypeIcons: Record<string, React.ReactNode> = {
  stream: <Radio className="h-4 w-4" />,
  watch_party: <Users className="h-4 w-4" />,
  community: <Users className="h-4 w-4" />,
  collab: <Gamepad2 className="h-4 w-4" />,
};

const eventTypeColors: Record<string, string> = {
  stream: "bg-purple-500/20 text-purple-500",
  watch_party: "bg-blue-500/20 text-blue-500",
  community: "bg-green-500/20 text-green-500",
  collab: "bg-orange-500/20 text-orange-500",
};

const eventTypeLabels: Record<string, string> = {
  stream: "Stream",
  watch_party: "Watch Party",
  community: "Community",
  collab: "Collab",
};

export default function Schedule() {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<StreamEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<StreamEvent | null>(null);
  const [isEmbedDialogOpen, setIsEmbedDialogOpen] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    startTime: "",
    endTime: "",
    platform: "twitch" as const,
    eventType: "stream" as const,
    isRecurring: false,
    recurringPattern: "",
    notifyDiscord: false,
    isPublic: true,
  });

  const { data: events = [], isLoading } = useQuery<StreamEvent[]>({
    queryKey: ["/api/events"],
  });

  const { data: upcomingEvents = [] } = useQuery<StreamEvent[]>({
    queryKey: ["/api/events/upcoming"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest("POST", "/api/events", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/upcoming"] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: "Event created", description: "Your event has been scheduled." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      return await apiRequest("PUT", `/api/events/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/upcoming"] });
      setIsDialogOpen(false);
      setEditingEvent(null);
      resetForm();
      toast({ title: "Event updated", description: "Your event has been updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/upcoming"] });
      setIsDeleteDialogOpen(false);
      setSelectedEvent(null);
      toast({ title: "Event deleted", description: "The event has been removed." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      startTime: "",
      endTime: "",
      platform: "twitch",
      eventType: "stream",
      isRecurring: false,
      recurringPattern: "",
      notifyDiscord: false,
      isPublic: true,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingEvent) {
      updateMutation.mutate({ id: editingEvent.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (event: StreamEvent) => {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      description: event.description,
      startTime: new Date(event.startTime).toISOString().slice(0, 16),
      endTime: new Date(event.endTime).toISOString().slice(0, 16),
      platform: event.platform,
      eventType: event.eventType,
      isRecurring: event.isRecurring,
      recurringPattern: event.recurringPattern || "",
      notifyDiscord: event.notifyDiscord,
      isPublic: event.isPublic,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (event: StreamEvent) => {
    setSelectedEvent(event);
    setIsDeleteDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingEvent(null);
    resetForm();
    const now = new Date();
    const defaultStart = new Date(now.getTime() + 60 * 60 * 1000);
    const defaultEnd = new Date(defaultStart.getTime() + 2 * 60 * 60 * 1000);
    setFormData(prev => ({
      ...prev,
      startTime: defaultStart.toISOString().slice(0, 16),
      endTime: defaultEnd.toISOString().slice(0, 16),
    }));
    setIsDialogOpen(true);
  };

  const getEventsForDay = (date: Date) => {
    return events.filter(event => {
      const eventDate = new Date(event.startTime);
      return isSameDay(eventDate, date);
    });
  };

  const navigatePrevious = () => {
    if (viewMode === 'week') {
      setCurrentDate(subWeeks(currentDate, 1));
    } else {
      setCurrentDate(subMonths(currentDate, 1));
    }
  };

  const navigateNext = () => {
    if (viewMode === 'week') {
      setCurrentDate(addWeeks(currentDate, 1));
    } else {
      setCurrentDate(addMonths(currentDate, 1));
    }
  };

  const copyEmbedCode = () => {
    const embedUrl = `${window.location.origin}/api/events/public/USER_ID`;
    navigator.clipboard.writeText(embedUrl);
    toast({ title: "Copied!", description: "Embed URL copied to clipboard" });
  };

  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    return (
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, index) => (
          <div key={index} className="min-h-[200px]">
            <div className={`text-center p-2 rounded-t-lg ${isSameDay(day, new Date()) ? 'bg-candy-pink/20' : 'bg-muted'}`}>
              <div className="text-xs text-muted-foreground">{format(day, 'EEE')}</div>
              <div className={`text-lg font-bold ${isSameDay(day, new Date()) ? 'text-candy-pink' : ''}`}>
                {format(day, 'd')}
              </div>
            </div>
            <div className="border border-t-0 rounded-b-lg p-1 space-y-1 min-h-[160px]">
              {getEventsForDay(day).map(event => (
                <div
                  key={event.id}
                  className="p-2 rounded bg-card border cursor-pointer hover:border-candy-pink transition-colors"
                  onClick={() => handleEdit(event)}
                >
                  <div className="flex items-center gap-1 mb-1">
                    {platformIcons[event.platform]}
                    <span className="text-xs font-medium truncate">{event.title}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(event.startTime), 'h:mm a')}
                  </div>
                  <Badge className={`${eventTypeColors[event.eventType]} text-xs mt-1`}>
                    {eventTypeLabels[event.eventType]}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
    const endDate = addDays(startOfWeek(monthEnd, { weekStartsOn: 0 }), 6);
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    return (
      <div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center text-xs text-muted-foreground font-medium p-2">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, index) => {
            const dayEvents = getEventsForDay(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={index}
                className={`min-h-[100px] p-1 rounded border ${
                  isCurrentMonth ? 'bg-card' : 'bg-muted/50'
                } ${isToday ? 'border-candy-pink' : 'border-border'}`}
              >
                <div className={`text-sm font-medium mb-1 ${
                  isToday ? 'text-candy-pink' : isCurrentMonth ? '' : 'text-muted-foreground'
                }`}>
                  {format(day, 'd')}
                </div>
                <div className="space-y-1">
                  {dayEvents.slice(0, 2).map(event => (
                    <div
                      key={event.id}
                      className="text-xs p-1 rounded bg-muted cursor-pointer hover:bg-muted/80 truncate flex items-center gap-1"
                      onClick={() => handleEdit(event)}
                    >
                      {platformIcons[event.platform]}
                      <span className="truncate">{event.title}</span>
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <div className="text-xs text-muted-foreground">+{dayEvents.length - 2} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold candy-gradient-text flex items-center gap-2">
            <Calendar className="h-7 w-7" />
            Stream Schedule
          </h1>
          <p className="text-muted-foreground">
            Plan and manage your streaming schedule
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsEmbedDialogOpen(true)}>
            <Code className="h-4 w-4 mr-2" />
            Embed Code
          </Button>
          <Button onClick={openCreateDialog} className="candy-gradient hover:opacity-90">
            <Plus className="h-4 w-4 mr-2" />
            New Event
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <Card className="candy-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={navigatePrevious}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h2 className="text-lg font-semibold">
                    {viewMode === 'week' 
                      ? `Week of ${format(startOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d, yyyy')}`
                      : format(currentDate, 'MMMM yyyy')
                    }
                  </h2>
                  <Button variant="ghost" size="icon" onClick={navigateNext}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant={viewMode === 'week' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('week')}
                  >
                    Week
                  </Button>
                  <Button
                    variant={viewMode === 'month' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('month')}
                  >
                    Month
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-candy-pink"></div>
                </div>
              ) : viewMode === 'week' ? renderWeekView() : renderMonthView()}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="candy-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5" />
                Upcoming Events
              </CardTitle>
              <CardDescription>Your next scheduled events</CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingEvents.length === 0 ? (
                <div className="text-center text-muted-foreground py-4">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No upcoming events</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingEvents.map(event => (
                    <div
                      key={event.id}
                      className="p-3 rounded-lg border bg-card cursor-pointer hover:border-candy-pink transition-colors"
                      onClick={() => handleEdit(event)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {platformIcons[event.platform]}
                        <span className="font-medium text-sm">{event.title}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">
                        {format(new Date(event.startTime), 'EEE, MMM d · h:mm a')}
                      </div>
                      <Badge className={`${eventTypeColors[event.eventType]} text-xs`}>
                        {eventTypeLabels[event.eventType]}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEvent ? "Edit Event" : "Create Event"}</DialogTitle>
            <DialogDescription>
              Schedule a stream or community event
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Stream title..."
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="What are you streaming?"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">Start Time</Label>
                <Input
                  id="startTime"
                  type="datetime-local"
                  value={formData.startTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime">End Time</Label>
                <Input
                  id="endTime"
                  type="datetime-local"
                  value={formData.endTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Platform</Label>
                <Select
                  value={formData.platform}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, platform: v as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="twitch">
                      <div className="flex items-center gap-2">
                        <SiTwitch className="h-4 w-4 text-purple-500" />
                        Twitch
                      </div>
                    </SelectItem>
                    <SelectItem value="youtube">
                      <div className="flex items-center gap-2">
                        <SiYoutube className="h-4 w-4 text-red-500" />
                        YouTube
                      </div>
                    </SelectItem>
                    <SelectItem value="kick">
                      <div className="flex items-center gap-2">
                        <SiKick className="h-4 w-4 text-green-500" />
                        Kick
                      </div>
                    </SelectItem>
                    <SelectItem value="multi">
                      <div className="flex items-center gap-2">
                        <Radio className="h-4 w-4 text-blue-500" />
                        Multi-platform
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Event Type</Label>
                <Select
                  value={formData.eventType}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, eventType: v as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stream">Stream</SelectItem>
                    <SelectItem value="watch_party">Watch Party</SelectItem>
                    <SelectItem value="community">Community Event</SelectItem>
                    <SelectItem value="collab">Collaboration</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="isRecurring">Recurring Event</Label>
                  <p className="text-xs text-muted-foreground">Repeat this event</p>
                </div>
                <Switch
                  id="isRecurring"
                  checked={formData.isRecurring}
                  onCheckedChange={(v) => setFormData(prev => ({ ...prev, isRecurring: v }))}
                />
              </div>

              {formData.isRecurring && (
                <div className="space-y-2">
                  <Label>Recurring Pattern</Label>
                  <Select
                    value={formData.recurringPattern}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, recurringPattern: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select pattern" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="notifyDiscord">Notify Discord</Label>
                  <p className="text-xs text-muted-foreground">Send announcement to Discord</p>
                </div>
                <Switch
                  id="notifyDiscord"
                  checked={formData.notifyDiscord}
                  onCheckedChange={(v) => setFormData(prev => ({ ...prev, notifyDiscord: v }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="isPublic">Public Event</Label>
                  <p className="text-xs text-muted-foreground">Show in public embed</p>
                </div>
                <Switch
                  id="isPublic"
                  checked={formData.isPublic}
                  onCheckedChange={(v) => setFormData(prev => ({ ...prev, isPublic: v }))}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              {editingEvent && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => handleDelete(editingEvent)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              )}
              <Button
                type="submit"
                className="candy-gradient"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingEvent ? "Update Event" : "Create Event"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedEvent?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedEvent && deleteMutation.mutate(selectedEvent.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isEmbedDialogOpen} onOpenChange={setIsEmbedDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Embed Your Schedule</DialogTitle>
            <DialogDescription>
              Use this URL to display your public events on your website
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <code className="text-sm break-all">
                {window.location.origin}/api/events/public/YOUR_USER_ID
              </code>
            </div>
            <p className="text-sm text-muted-foreground">
              This API endpoint returns JSON data of your public events. You can use it with any frontend framework or embed solution.
            </p>
            <Button onClick={copyEmbedCode} className="w-full">
              <Copy className="h-4 w-4 mr-2" />
              Copy URL
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
