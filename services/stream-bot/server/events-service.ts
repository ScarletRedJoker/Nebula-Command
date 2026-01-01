import { randomUUID } from "crypto";

export interface StreamEvent {
  id: string;
  userId: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  platform: 'twitch' | 'youtube' | 'kick' | 'multi';
  eventType: 'stream' | 'watch_party' | 'community' | 'collab';
  isRecurring: boolean;
  recurringPattern: string | null;
  notifyDiscord: boolean;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateEventInput = Omit<StreamEvent, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;
export type UpdateEventInput = Partial<CreateEventInput>;

class EventsService {
  private events: Map<string, StreamEvent> = new Map();

  async getEvents(userId: string, startDate?: Date, endDate?: Date): Promise<StreamEvent[]> {
    const userEvents = Array.from(this.events.values())
      .filter(event => event.userId === userId);
    
    if (startDate || endDate) {
      return userEvents.filter(event => {
        const eventStart = new Date(event.startTime);
        if (startDate && eventStart < startDate) return false;
        if (endDate && eventStart > endDate) return false;
        return true;
      });
    }
    
    return userEvents.sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  }

  async createEvent(userId: string, eventData: Partial<CreateEventInput>): Promise<StreamEvent> {
    const now = new Date();
    const event: StreamEvent = {
      id: randomUUID(),
      userId,
      title: eventData.title || 'Untitled Event',
      description: eventData.description || '',
      startTime: eventData.startTime ? new Date(eventData.startTime) : now,
      endTime: eventData.endTime ? new Date(eventData.endTime) : new Date(now.getTime() + 3600000),
      platform: eventData.platform || 'twitch',
      eventType: eventData.eventType || 'stream',
      isRecurring: eventData.isRecurring || false,
      recurringPattern: eventData.recurringPattern || null,
      notifyDiscord: eventData.notifyDiscord || false,
      isPublic: eventData.isPublic !== undefined ? eventData.isPublic : true,
      createdAt: now,
      updatedAt: now,
    };

    this.events.set(event.id, event);
    return event;
  }

  async updateEvent(userId: string, eventId: string, updates: UpdateEventInput): Promise<StreamEvent | null> {
    const event = this.events.get(eventId);
    
    if (!event || event.userId !== userId) {
      return null;
    }

    const updatedEvent: StreamEvent = {
      ...event,
      ...updates,
      startTime: updates.startTime ? new Date(updates.startTime) : event.startTime,
      endTime: updates.endTime ? new Date(updates.endTime) : event.endTime,
      updatedAt: new Date(),
    };

    this.events.set(eventId, updatedEvent);
    return updatedEvent;
  }

  async deleteEvent(userId: string, eventId: string): Promise<boolean> {
    const event = this.events.get(eventId);
    
    if (!event || event.userId !== userId) {
      return false;
    }

    this.events.delete(eventId);
    return true;
  }

  async getPublicEvents(userId: string): Promise<StreamEvent[]> {
    const now = new Date();
    return Array.from(this.events.values())
      .filter(event => 
        event.userId === userId && 
        event.isPublic && 
        new Date(event.startTime) >= now
      )
      .sort((a, b) => 
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
  }

  async getUpcomingEvents(userId: string, limit: number = 5): Promise<StreamEvent[]> {
    const now = new Date();
    return Array.from(this.events.values())
      .filter(event => 
        event.userId === userId && 
        new Date(event.startTime) >= now
      )
      .sort((a, b) => 
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      )
      .slice(0, limit);
  }

  async getEvent(userId: string, eventId: string): Promise<StreamEvent | null> {
    const event = this.events.get(eventId);
    if (!event || event.userId !== userId) {
      return null;
    }
    return event;
  }
}

export const eventsService = new EventsService();
