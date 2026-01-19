#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_usage() {
    echo "Usage: $0 <path-to-ssh-key>"
    echo ""
    echo "Converts an SSH private key from OpenSSH format to PEM format."
    echo "This is required for compatibility with Node.js ssh2 library."
    echo ""
    echo "Examples:"
    echo "  $0 ~/.ssh/id_rsa"
    echo "  $0 ~/.ssh/homelab"
    echo ""
    echo "Options:"
    echo "  -h, --help    Show this help message"
    echo "  --check       Only check format without converting"
}

check_format() {
    local key_file="$1"
    local first_line=$(head -1 "$key_file" 2>/dev/null)
    
    case "$first_line" in
        "-----BEGIN OPENSSH PRIVATE KEY-----")
            echo "OPENSSH"
            ;;
        "-----BEGIN RSA PRIVATE KEY-----")
            echo "PEM_RSA"
            ;;
        "-----BEGIN EC PRIVATE KEY-----")
            echo "PEM_EC"
            ;;
        "-----BEGIN PRIVATE KEY-----")
            echo "PKCS8"
            ;;
        "-----BEGIN DSA PRIVATE KEY-----")
            echo "PEM_DSA"
            ;;
        *)
            echo "UNKNOWN"
            ;;
    esac
}

if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    print_usage
    exit 0
fi

if [[ -z "$1" ]]; then
    echo -e "${RED}Error: No key file specified${NC}"
    echo ""
    print_usage
    exit 1
fi

KEY_FILE="$1"
CHECK_ONLY=false

if [[ "$2" == "--check" || "$1" == "--check" ]]; then
    CHECK_ONLY=true
    if [[ "$1" == "--check" ]]; then
        KEY_FILE="$2"
    fi
fi

if [[ ! -f "$KEY_FILE" ]]; then
    echo -e "${RED}Error: Key file not found: $KEY_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}SSH Key Conversion Tool${NC}"
echo "========================"
echo ""

FORMAT=$(check_format "$KEY_FILE")
echo -e "Key file: ${GREEN}$KEY_FILE${NC}"
echo -e "Current format: ${GREEN}$FORMAT${NC}"

if [[ "$CHECK_ONLY" == true ]]; then
    echo ""
    case "$FORMAT" in
        "PEM_RSA"|"PEM_EC"|"PKCS8")
            echo -e "${GREEN}✓ Key is already in a compatible format${NC}"
            exit 0
            ;;
        "OPENSSH")
            echo -e "${YELLOW}⚠ Key needs conversion from OpenSSH to PEM format${NC}"
            echo ""
            echo "To convert, run:"
            echo "  $0 $KEY_FILE"
            exit 0
            ;;
        *)
            echo -e "${RED}✗ Unknown key format${NC}"
            exit 1
            ;;
    esac
fi

if [[ "$FORMAT" == "PEM_RSA" || "$FORMAT" == "PEM_EC" || "$FORMAT" == "PKCS8" ]]; then
    echo ""
    echo -e "${GREEN}✓ Key is already in a compatible format. No conversion needed.${NC}"
    exit 0
fi

if [[ "$FORMAT" != "OPENSSH" ]]; then
    echo ""
    echo -e "${RED}Error: Cannot convert key format: $FORMAT${NC}"
    echo "Only OpenSSH format keys can be converted."
    exit 1
fi

echo ""
echo -e "${YELLOW}Converting from OpenSSH to PEM format...${NC}"

BACKUP_FILE="${KEY_FILE}.openssh.bak"
cp "$KEY_FILE" "$BACKUP_FILE"
echo -e "Backup created: ${GREEN}$BACKUP_FILE${NC}"

OS_TYPE=$(uname -s)
if [[ "$OS_TYPE" == "Darwin" ]]; then
    echo "Detected: macOS"
elif [[ "$OS_TYPE" == "Linux" ]]; then
    echo "Detected: Linux"
else
    echo "Detected: $OS_TYPE (may have limited compatibility)"
fi

echo ""
echo "This will modify the key file in-place."
echo "If the key has a passphrase, you'll be prompted to enter it."
read -p "Continue? [y/N] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    rm -f "$BACKUP_FILE"
    exit 1
fi

if ssh-keygen -p -m PEM -f "$KEY_FILE" -N "" 2>/dev/null; then
    NEW_FORMAT=$(check_format "$KEY_FILE")
    echo ""
    echo -e "${GREEN}✓ Conversion successful!${NC}"
    echo -e "New format: ${GREEN}$NEW_FORMAT${NC}"
else
    echo -e "${YELLOW}Note: If prompted for passphrase, enter it and set empty new passphrase${NC}"
    ssh-keygen -p -m PEM -f "$KEY_FILE"
    NEW_FORMAT=$(check_format "$KEY_FILE")
    echo ""
    echo -e "${GREEN}✓ Conversion complete!${NC}"
    echo -e "New format: ${GREEN}$NEW_FORMAT${NC}"
fi

echo ""
echo "================================"
echo -e "${YELLOW}Next Steps:${NC}"
echo "================================"
echo ""
echo "1. Test SSH connection:"
echo "   ssh -i $KEY_FILE root@linode.evindrake.net 'echo SSH OK'"
echo ""
echo "2. Update Replit secrets with the new key:"
echo "   - Go to Replit → Tools → Secrets"
echo "   - Update SSH_PRIVATE_KEY with contents of: $KEY_FILE"
echo ""
echo "   To copy key content:"
if [[ "$OS_TYPE" == "Darwin" ]]; then
    echo "   cat $KEY_FILE | pbcopy"
else
    echo "   cat $KEY_FILE | xclip -selection clipboard"
fi
echo ""
echo "3. Verify in application:"
echo "   - Restart the dashboard service"
echo "   - Check the Servers page for connectivity"
echo ""
echo "4. (Optional) Remove backup after verification:"
echo "   rm $BACKUP_FILE"
echo ""
echo -e "${GREEN}Done!${NC}"
