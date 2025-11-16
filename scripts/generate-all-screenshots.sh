#!/bin/bash
# Generate All Screenshots for HomeLab Dashboard
# This script generates comprehensive screenshots for documentation and investor presentations

set -e

echo "📸 HomeLab Dashboard - Screenshot Generator"
echo "==========================================="
echo ""

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if service is running
if ! curl -s http://localhost:5000/login > /dev/null 2>&1; then
    echo -e "${RED}❌ Dashboard not running!${NC}"
    echo "Please start the dashboard first:"
    echo "  cd services/dashboard && python main.py"
    exit 1
fi

echo -e "${GREEN}✅ Dashboard is running${NC}"
echo ""

# Create directories
mkdir -p screenshots/dashboard
mkdir -p screenshots/stream-bot
mkdir -p screenshots/mobile
mkdir -p screenshots/features

echo -e "${BLUE}📁 Created screenshot directories${NC}"
echo ""

# Method 1: Manual Screenshot Instructions
echo "📋 SCREENSHOT CHECKLIST"
echo "======================="
echo ""
echo "Please take screenshots of the following pages:"
echo ""
echo "Dashboard Pages:"
echo "  1. Login Page       → http://localhost:5000/login"
echo "  2. Dashboard        → http://localhost:5000/"
echo "  3. Containers       → http://localhost:5000/containers"
echo "  4. Domains          → http://localhost:5000/domains"
echo "  5. Jarvis Chat      → http://localhost:5000/jarvis/assistant"
echo "  6. Code Review      → http://localhost:5000/jarvis/code-review"
echo "  7. Databases        → http://localhost:5000/databases"
echo "  8. File Upload      → http://localhost:5000/upload"
echo "  9. Network          → http://localhost:5000/network"
echo "  10. Monitoring      → http://localhost:5000/monitoring"
echo ""
echo "Stream Bot Pages:"
echo "  1. Dashboard        → http://localhost:3000/"
echo "  2. Commands         → http://localhost:3000/commands"
echo "  3. Analytics        → http://localhost:3000/analytics"
echo ""

# Method 2: Automated with Playwright (if available)
if command -v node &> /dev/null && [ -f "node_modules/.bin/playwright" ]; then
    echo -e "${BLUE}🤖 Playwright detected - Generating automated screenshots...${NC}"
    
    # Check if automation script exists
    if [ -f "scripts/playwright-screenshots.js" ]; then
        node scripts/playwright-screenshots.js
        echo -e "${GREEN}✅ Automated screenshots generated${NC}"
    else
        echo -e "${RED}⚠️  Playwright script not found. Using manual method.${NC}"
    fi
else
    echo -e "${BLUE}💡 TIP: Install Playwright for automated screenshots:${NC}"
    echo "  npm install playwright"
    echo "  node scripts/playwright-screenshots.js"
fi

echo ""
echo "📱 For Mobile Screenshots:"
echo "==========================="
echo ""
echo "1. Open browser DevTools (F12)"
echo "2. Toggle device toolbar (Ctrl+Shift+M)"
echo "3. Select device: iPhone X (375x812)"
echo "4. Screenshot these pages:"
echo "   - Dashboard"
echo "   - Domain list"
echo "   - Jarvis chat"
echo "   - Settings"
echo ""

echo "🖼️  For Full-Page Screenshots:"
echo "=============================="
echo ""
echo "Chrome/Edge:"
echo "  1. Press F12 (DevTools)"
echo "  2. Press Ctrl+Shift+P"
echo "  3. Type 'Capture full size screenshot'"
echo "  4. Save to screenshots/ directory"
echo ""
echo "Firefox:"
echo "  1. Press F12"
echo "  2. Click ... menu"
echo "  3. Screenshot → Save Full Page"
echo ""

# Create example filenames
echo "📝 Save screenshots with these names:"
echo "====================================="
echo ""
cat > screenshots/NAMING_CONVENTION.txt << 'EOF'
Dashboard Screenshots:
  screenshots/dashboard/01-login.png
  screenshots/dashboard/02-dashboard.png
  screenshots/dashboard/03-containers.png
  screenshots/dashboard/04-domains.png
  screenshots/dashboard/05-jarvis-chat.png
  screenshots/dashboard/06-jarvis-code.png
  screenshots/dashboard/07-databases.png
  screenshots/dashboard/08-upload.png
  screenshots/dashboard/09-network.png
  screenshots/dashboard/10-monitoring.png

Stream Bot Screenshots:
  screenshots/stream-bot/01-dashboard.png
  screenshots/stream-bot/02-commands.png
  screenshots/stream-bot/03-analytics.png

Mobile Screenshots:
  screenshots/mobile/01-dashboard.png
  screenshots/mobile/02-domains.png
  screenshots/mobile/03-jarvis.png

Feature Highlights:
  screenshots/features/ai-assistant.png
  screenshots/features/domain-automation.png
  screenshots/features/monitoring.png
  screenshots/features/responsive-design.png
EOF

echo -e "${GREEN}✅ Created naming convention guide${NC}"
cat screenshots/NAMING_CONVENTION.txt

echo ""
echo "📦 Creating Screenshot Package"
echo "==============================="
echo ""

# Create README for screenshots
cat > screenshots/README.md << 'EOF'
# HomeLab Dashboard - Screenshot Gallery

## Overview

This directory contains professional screenshots for:
- **Product documentation**
- **Investor presentations**
- **Marketing materials**
- **User guides**

## Directory Structure

```
screenshots/
├── dashboard/      # Main dashboard screenshots
├── stream-bot/     # Stream bot screenshots
├── mobile/         # Responsive mobile views
├── features/       # Feature highlights
└── README.md       # This file
```

## Screenshot Guidelines

### Dimensions:
- **Desktop:** 1920x1080 (Full HD)
- **Mobile:** 375x812 (iPhone X)
- **Tablet:** 768x1024 (iPad)

### Quality:
- PNG format for clarity
- High resolution
- Clean, realistic data
- Professional appearance

### Naming Convention:
```
<sequence>-<page>-<state>.png

Examples:
01-login-default.png
02-dashboard-loaded.png
03-containers-running.png
```

## Usage

Include in:
- Investor decks (PowerPoint/Keynote)
- GitHub README
- Documentation sites
- Marketing website
- Demo videos

## Updating

Screenshots should be updated:
- After major UI changes
- Before investor presentations
- Quarterly for documentation
- Before product releases

## Tools

**Recommended:**
- Browser DevTools (F12 → Capture screenshot)
- Playwright (automated)
- ShareX (Windows)
- Flameshot (Linux)
- CleanShot X (Mac)

For automated generation:
```bash
./scripts/generate-all-screenshots.sh
```

---

**Need help?** See `docs/SCREENSHOTS.md` for detailed instructions.
EOF

echo -e "${GREEN}✅ Created screenshots/README.md${NC}"

echo ""
echo "✅ Screenshot Generation Complete!"
echo "=================================="
echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo "1. Follow the checklist above to capture screenshots"
echo "2. Save them in the screenshots/ directory"
echo "3. Review docs/SCREENSHOTS.md for detailed guidance"
echo "4. Use screenshots in investor presentations"
echo ""
echo -e "${BLUE}📚 Documentation: docs/SCREENSHOTS.md${NC}"
echo -e "${BLUE}📦 Package Location: screenshots/${NC}"
echo ""
echo "🎯 Ready for investor presentations!"
