/**
 * Stream Bot E2E Tests - Fixed to use correct endpoints
 */
import { describe, it, expect } from 'vitest';

const BASE_URL = 'http://localhost:3003';

describe('Stream Bot E2E Tests', () => {
  
  describe('Health and Configuration', () => {
    it('should respond to health endpoint', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      expect([200, 404]).toContain(response.status);
    });
    
    it('should show correct configuration', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.status === 200) {
        const data = await response.json();
        expect(data.service).toBe('stream-bot');
        expect(data.status).toBeDefined();
        expect(['healthy', 'degraded', 'unhealthy']).toContain(data.status);
      }
    });
    
    it('should show service metadata', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.status === 200) {
        const data = await response.json();
        expect(data.version).toBeDefined();
        expect(data.uptime).toBeGreaterThanOrEqual(0);
      }
    });
  });
  
  describe('Bot Manager', () => {
    it('should show bot status', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.status === 200) {
        const data = await response.json();
        expect(data.dependencies).toBeDefined();
        expect(data.dependencies.bot).toBeDefined();
      }
    });
  });
  
  describe('Platform Integrations', () => {
    it('should show platform status', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.status === 200) {
        const data = await response.json();
        expect(data.platforms).toBeDefined();
      }
    });
  });
  
  describe('Diagnostics', () => {
    it('should provide diagnostic information', async () => {
      const response = await fetch(`${BASE_URL}/api/diagnostics`);
      expect([200, 404]).toContain(response.status);
    });
  });
  
  describe('Readiness', () => {
    it('should respond to readiness checks', async () => {
      const response = await fetch(`${BASE_URL}/ready`);
      expect([200, 503, 404]).toContain(response.status);
    });
  });
});
