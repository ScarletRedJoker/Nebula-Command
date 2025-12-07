#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Smart .env Sync Script
#  
#  Merges .env.example into your existing .env WITHOUT overwriting
#  values you've already filled out. Only adds missing variables.
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$DEPLOY_DIR/.env"
EXAMPLE_FILE="$DEPLOY_DIR/.env.example"
BACKUP_DIR="$DEPLOY_DIR/.env-backups"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Smart .env Sync${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo

# Check if .env.example exists
if [[ ! -f "$EXAMPLE_FILE" ]]; then
    echo -e "${RED}ERROR: .env.example not found at $EXAMPLE_FILE${NC}"
    exit 1
fi

# If no .env exists, just copy the example
if [[ ! -f "$ENV_FILE" ]]; then
    echo -e "${YELLOW}No .env file found. Creating from template...${NC}"
    cp "$EXAMPLE_FILE" "$ENV_FILE"
    echo -e "${GREEN}Created $ENV_FILE${NC}"
    echo -e "${YELLOW}Please fill in the required values and run this script again to validate.${NC}"
    exit 0
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup current .env with timestamp
BACKUP_FILE="$BACKUP_DIR/.env.backup.$(date +%Y%m%d_%H%M%S)"
cp "$ENV_FILE" "$BACKUP_FILE"
echo -e "${GREEN}✓ Backed up current .env to:${NC}"
echo -e "  ${BLUE}$BACKUP_FILE${NC}"
echo

# Parse existing .env into associative array
declare -A existing_values
declare -A existing_keys

while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip empty lines and comments
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    
    # Extract key=value
    if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*= ]]; then
        key="${BASH_REMATCH[1]}"
        # Get the value (everything after the first =)
        value="${line#*=}"
        existing_values["$key"]="$value"
        existing_keys["$key"]=1
    fi
done < "$ENV_FILE"

echo -e "${BLUE}Found ${#existing_keys[@]} existing variables in your .env${NC}"
echo

# Track changes
declare -a new_vars=()
declare -a preserved_vars=()

# Process .env.example and build new .env content
# We'll keep the structure/comments from .env.example but preserve existing values
OUTPUT=""
pending_comments=""

while IFS= read -r line || [[ -n "$line" ]]; do
    # If it's a comment or empty line, accumulate it
    if [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]]; then
        pending_comments+="$line"$'\n'
        continue
    fi
    
    # Extract key if this is a variable line
    if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*= ]]; then
        key="${BASH_REMATCH[1]}"
        
        if [[ -v existing_keys["$key"] ]]; then
            # Key exists - preserve the user's value
            preserved_vars+=("$key")
            # Add pending comments (structure from example)
            OUTPUT+="$pending_comments"
            OUTPUT+="${key}=${existing_values[$key]}"$'\n'
        else
            # New key - add it with the example's default value
            new_vars+=("$key")
            OUTPUT+="$pending_comments"
            OUTPUT+="$line"$'\n'
        fi
        pending_comments=""
    fi
done < "$EXAMPLE_FILE"

# Add any trailing comments
OUTPUT+="$pending_comments"

# Check for any variables in existing .env that aren't in .env.example
declare -a extra_vars=()
for key in "${!existing_keys[@]}"; do
    found=0
    while IFS= read -r line || [[ -n "$line" ]]; do
        if [[ "$line" =~ ^[[:space:]]*${key}[[:space:]]*= ]]; then
            found=1
            break
        fi
    done < "$EXAMPLE_FILE"
    
    if [[ $found -eq 0 ]]; then
        extra_vars+=("$key")
    fi
done

# If there are extra vars, append them at the end
if [[ ${#extra_vars[@]} -gt 0 ]]; then
    OUTPUT+=$'\n'
    OUTPUT+="# ━━━ CUSTOM VARIABLES (not in template) ━━━"$'\n'
    OUTPUT+=$'\n'
    for key in "${extra_vars[@]}"; do
        OUTPUT+="${key}=${existing_values[$key]}"$'\n'
    done
fi

# Write the merged .env
echo -n "$OUTPUT" > "$ENV_FILE"

# Report results
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Sync Complete${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo

echo -e "${GREEN}✓ Preserved ${#preserved_vars[@]} existing values${NC}"

if [[ ${#new_vars[@]} -gt 0 ]]; then
    echo -e "${YELLOW}⚠ Added ${#new_vars[@]} NEW variables (need values):${NC}"
    for var in "${new_vars[@]}"; do
        echo -e "  ${YELLOW}→ $var${NC}"
    done
    echo
    echo -e "${CYAN}Edit your .env to fill in the new variables:${NC}"
    echo -e "  ${BLUE}nano $ENV_FILE${NC}"
else
    echo -e "${GREEN}✓ No new variables - your .env is up to date!${NC}"
fi

if [[ ${#extra_vars[@]} -gt 0 ]]; then
    echo
    echo -e "${BLUE}ℹ You have ${#extra_vars[@]} custom variables not in template:${NC}"
    for var in "${extra_vars[@]}"; do
        echo -e "  ${BLUE}→ $var${NC}"
    done
    echo -e "${BLUE}  (These have been preserved at the end of your .env)${NC}"
fi

echo
echo -e "${GREEN}Backup saved to: ${BLUE}$BACKUP_FILE${NC}"
echo
