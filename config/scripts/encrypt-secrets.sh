#!/bin/bash
# Encrypt secrets files using SOPS + Age

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SECRETS_DIR="$PROJECT_ROOT/config/secrets"

# Secure age key locations (in order of preference)
SECURE_AGE_KEY="$HOME/.config/homelab/age-key.txt"
LEGACY_AGE_KEY="$PROJECT_ROOT/config/keys/age-key.txt"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══ SOPS Secrets Encryption ═══${NC}\n"

# Find age private key in secure locations
if [ -n "${SOPS_AGE_KEY_FILE:-}" ] && [ -f "$SOPS_AGE_KEY_FILE" ]; then
    # Use environment variable if set
    AGE_KEY_FILE="$SOPS_AGE_KEY_FILE"
    echo -e "${GREEN}✓ Using age key from environment: $AGE_KEY_FILE${NC}"
elif [ -f "$SECURE_AGE_KEY" ]; then
    # Prefer secure location
    AGE_KEY_FILE="$SECURE_AGE_KEY"
    echo -e "${GREEN}✓ Using age key: $AGE_KEY_FILE${NC}"
elif [ -f "$LEGACY_AGE_KEY" ]; then
    # Fall back to legacy location with warning
    AGE_KEY_FILE="$LEGACY_AGE_KEY"
    echo -e "${YELLOW}⚠️  WARNING: Using in-repo age key (INSECURE!)${NC}"
    echo -e "${YELLOW}⚠️  Move to: $SECURE_AGE_KEY${NC}"
    echo -e "${YELLOW}⚠️  Run: mkdir -p ~/.config/homelab && mv $LEGACY_AGE_KEY $SECURE_AGE_KEY${NC}"
    echo ""
else
    echo -e "${RED}✗ Age private key not found${NC}"
    echo ""
    echo "Checked locations:"
    echo "  1. \$SOPS_AGE_KEY_FILE (environment variable)"
    echo "  2. $SECURE_AGE_KEY (recommended)"
    echo "  3. $LEGACY_AGE_KEY (deprecated)"
    echo ""
    echo "To generate a new key:"
    echo "  mkdir -p ~/.config/homelab"
    echo "  age-keygen -o ~/.config/homelab/age-key.txt"
    echo "  chmod 600 ~/.config/homelab/age-key.txt"
    exit 1
fi

# Check and enforce secure permissions (600)
CURRENT_PERMS=$(stat -c '%a' "$AGE_KEY_FILE" 2>/dev/null || stat -f '%Lp' "$AGE_KEY_FILE" 2>/dev/null)
if [ "$CURRENT_PERMS" != "600" ]; then
    echo -e "${YELLOW}⚠️  Age key has insecure permissions: $CURRENT_PERMS${NC}"
    echo -e "${CYAN}→ Setting secure permissions (600)...${NC}"
    chmod 600 "$AGE_KEY_FILE"
    echo -e "${GREEN}✓ Permissions updated${NC}"
fi

# Export SOPS_AGE_KEY_FILE for sops to find the key
export SOPS_AGE_KEY_FILE="$AGE_KEY_FILE"
echo ""

# Function to encrypt a file
encrypt_file() {
    local input_file=$1
    local output_file="${input_file%.yaml}.enc.yaml"
    
    if [ ! -f "$input_file" ]; then
        echo -e "${YELLOW}⚠ Skipping $input_file (not found)${NC}"
        return
    fi
    
    echo -e "${CYAN}Encrypting:${NC} $(basename "$input_file")"
    
    if sops --encrypt "$input_file" > "$output_file" 2>/dev/null; then
        echo -e "${GREEN}✓ Created:${NC} $(basename "$output_file")"
        
        # Remove unencrypted file for security
        rm "$input_file"
        echo -e "${GREEN}✓ Removed:${NC} $(basename "$input_file") (unencrypted)"
    else
        echo -e "${RED}✗ Failed to encrypt $input_file${NC}"
        exit 1
    fi
    echo ""
}

# Encrypt all unencrypted secret files
cd "$SECRETS_DIR"

for file in base.yaml dev.yaml prod.yaml; do
    if [ -f "$file" ]; then
        encrypt_file "$file"
    fi
done

echo -e "${GREEN}✅ Encryption complete!${NC}"
echo ""
echo "Encrypted files:"
ls -lh "$SECRETS_DIR"/*.enc.yaml 2>/dev/null || echo "None found"
echo ""
echo -e "${CYAN}To decrypt and edit:${NC}"
echo "  sops config/secrets/base.enc.yaml"
echo ""
echo -e "${CYAN}To decrypt to stdout:${NC}"
echo "  sops -d config/secrets/base.enc.yaml"
