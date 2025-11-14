# Smart Home Control with Jarvis - Setup Guide

## Overview

Jarvis now includes comprehensive smart home control integrated with Google Home! Control your lights, switches, thermostats, and more through a beautiful web interface or voice commands.

## Features

✅ **Device Control Dashboard**
- Visual control interface for all smart home devices
- Real-time device status updates
- Quick actions for common tasks
- Search and filter devices

✅ **Pre-Made Automation Templates**
- Good Morning - Turn on lights, adjust climate, start coffee
- Good Night - Turn off all lights, lock doors, arm security
- Leaving Home - Secure and power down everything
- Arriving Home - Welcome lighting and climate control
- Movie Time - Dim lights, close blinds
- Party Mode - Colorful lights and music
- Work Mode - Bright focus lighting
- Dinner Time - Warm ambient lighting

✅ **Google Home Integration**
- Full voice command support
- Natural language processing
- Pre-configured routines
- Display cards for rich responses

✅ **Device Support**
- Lights (on/off, brightness, color)
- Switches (on/off)
- Climate devices (temperature control)
- Sensors (monitoring)
- Automations (trigger workflows)
- Scenes (activate pre-configured settings)

## Quick Start

### Step 1: Configure Home Assistant

1. Set up Home Assistant at `home.evindrake.net` (or your preferred URL)
2. Create a Long-Lived Access Token:
   - Go to Home Assistant → Profile → Security
   - Scroll to "Long-Lived Access Tokens"
   - Click "Create Token"
   - Name it "Jarvis Dashboard"
   - Copy the token (you won't see it again!)

### Step 2: Configure Environment Variables

Add these to your `.env` file or environment:

```bash
# Home Assistant Configuration
HOME_ASSISTANT_URL=http://homeassistant:8123
# Or external URL:
# HOME_ASSISTANT_URL=https://home.evindrake.net

HOME_ASSISTANT_TOKEN=your_long_lived_access_token_here
```

### Step 3: Access the Dashboard

1. Navigate to your Jarvis dashboard at `https://host.evindrake.net`
2. Click "Home Control" in the Smart Home section of the sidebar
3. Your devices will load automatically!

## Google Home Setup

### Link Home Assistant to Google Home

1. Open the Google Home app on your phone
2. Tap **+** (Add) → **Set up device**
3. Select **Works with Google**
4. Search for **"Home Assistant"**
5. Sign in with your Home Assistant account
6. Grant permissions
7. Say: *"Hey Google, sync my devices"*

### Use Voice Commands

Once linked, you can control your home with:

**Basic Commands:**
- "Hey Google, turn on the living room lights"
- "Hey Google, turn off all lights"
- "Hey Google, set the temperature to 72 degrees"
- "Hey Google, dim the bedroom lights"

**Jarvis-Specific Commands:**
- "Hey Google, ask Jarvis to run good morning routine"
- "Hey Google, tell Jarvis to activate movie mode"
- "Hey Google, ask Jarvis what lights are on"
- "Hey Google, tell Jarvis good night"

### Create Google Home Routines

1. Open Google Home app
2. Go to **Routines**
3. Tap **+** to create new routine
4. Set trigger: "When I say..." → "Good morning"
5. Add actions:
   - Adjust lights
   - Adjust temperature
   - Send command to Jarvis
6. Save and enjoy!

## API Endpoints

### Get All Devices
```bash
GET /smarthome/api/devices
GET /smarthome/api/devices?domain=light
```

### Control Devices
```bash
POST /smarthome/api/device/{entity_id}/turn_on
POST /smarthome/api/device/{entity_id}/turn_off
```

### Set Light Brightness
```bash
POST /smarthome/api/light/{entity_id}/brightness
Content-Type: application/json

{
  "brightness": 180
}
```

### Set Light Color
```bash
POST /smarthome/api/light/{entity_id}/color
Content-Type: application/json

{
  "rgb_color": [255, 100, 50]
}
```

### Set Temperature
```bash
POST /smarthome/api/climate/{entity_id}/temperature
Content-Type: application/json

{
  "temperature": 72
}
```

### Voice Command Processing
```bash
POST /smarthome/api/voice/command
Content-Type: application/json

{
  "command": "turn on all lights"
}
```

### Get Automation Templates
```bash
GET /smarthome/api/automation/templates
```

## Home Assistant Configuration Example

Create automations in your Home Assistant `configuration.yaml`:

```yaml
# Good Morning Automation
automation:
  - alias: "Good Morning Routine"
    trigger:
      - platform: event
        event_type: jarvis_good_morning
    action:
      - service: light.turn_on
        target:
          entity_id: light.bedroom
        data:
          brightness: 180
      - service: climate.set_temperature
        target:
          entity_id: climate.main_thermostat
        data:
          temperature: 72
      - service: switch.turn_on
        target:
          entity_id: switch.coffee_maker

# Good Night Automation
  - alias: "Good Night Routine"
    trigger:
      - platform: event
        event_type: jarvis_good_night
    action:
      - service: light.turn_off
        target:
          entity_id: all
      - service: lock.lock
        target:
          entity_id: all
      - service: alarm_control_panel.alarm_arm_night
        target:
          entity_id: alarm_control_panel.home
```

## Troubleshooting

### Devices Not Loading

1. **Check Home Assistant Connection**
   ```bash
   curl https://home.evindrake.net/api/
   ```
   Should return: `{"message": "API running."}`

2. **Verify Access Token**
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" https://home.evindrake.net/api/states
   ```
   Should return list of device states

3. **Check Environment Variables**
   Make sure `HOME_ASSISTANT_URL` and `HOME_ASSISTANT_TOKEN` are set

### Google Home Not Responding

1. **Re-sync Devices**
   - Say: "Hey Google, sync my devices"
   - Or: Google Home app → Settings → Works with Google → Home Assistant → Unlink & Relink

2. **Check Home Assistant Cloud**
   - Ensure Home Assistant Cloud (Nabu Casa) is configured
   - Or use your own SSL-enabled external URL

3. **Verify Automations**
   - Check Home Assistant → Configuration → Automations
   - Test automations manually first

### Voice Commands Not Working

1. **Check Command Format**
   - Use natural language: "turn on living room lights"
   - Not entity IDs: "turn on light.living_room"

2. **Test in Dashboard**
   - Go to Smart Home → Voice Commands tab
   - Test commands directly
   - Check response messages

3. **Review Logs**
   - Dashboard logs: `services/dashboard/logs/`
   - Home Assistant logs: Configuration → Logs

## Architecture

```
Google Home
    ↓
Home Assistant (home.evindrake.net)
    ↓
Jarvis Dashboard (host.evindrake.net)
    ↓
Smart Home Service (home_assistant_service.py)
    ↓
Home Assistant API
    ↓
Smart Devices
```

## Security Notes

- Home Assistant access tokens are stored securely in environment variables
- All API requests use authentication via `require_auth` decorator
- CORS is configured to only allow trusted origins
- SSL/HTTPS required for Google Home integration

## Support

For issues or questions:
1. Check Home Assistant logs
2. Review Jarvis dashboard logs
3. Test devices manually in Home Assistant
4. Verify network connectivity

## Future Enhancements

Coming soon:
- Visual automation builder with drag-and-drop
- Energy monitoring dashboards
- Advanced scheduling with calendar integration
- Multi-room audio control
- Camera integration
- Security system integration
- Custom voice responses
- AI-powered automation suggestions

## Example Voice Commands

**Lights:**
- "Turn on all lights"
- "Turn off living room lights"
- "Dim bedroom lights to 50%"
- "Set kitchen lights to blue"

**Climate:**
- "Set temperature to 72 degrees"
- "Turn on the AC"
- "What's the current temperature?"

**Routines:**
- "Good morning" → Activates morning routine
- "Good night" → Activates bedtime routine
- "Movie time" → Activates movie mode
- "I'm leaving" → Activates away mode

**Status:**
- "What lights are on?"
- "Is the front door locked?"
- "What's the temperature inside?"

## Resources

- [Home Assistant Documentation](https://www.home-assistant.io/docs/)
- [Google Home Integration](https://www.home-assistant.io/integrations/google_assistant/)
- [Jarvis Voice API Documentation](JARVIS_VOICE_API_DOCUMENTATION.md)
