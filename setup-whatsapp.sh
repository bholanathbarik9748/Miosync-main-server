#!/bin/bash

# WhatsApp Integration Setup Script
# This script helps set up WhatsApp integration for the Miosync server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BOLD}════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}   WhatsApp Integration Setup - Miosync Server${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════${NC}\n"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found!${NC}"
    echo -e "Creating .env file from .env.example (if available)...\n"
    
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}✅ Created .env file from .env.example${NC}\n"
    else
        echo -e "${RED}❌ No .env.example found. Creating new .env file...${NC}\n"
        touch .env
    fi
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 1: WhatsApp Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Check current configuration
WA_TOKEN=$(grep "^WA_TOKEN=" .env 2>/dev/null | cut -d '=' -f2- || echo "")
WA_PHONE_NUMBER_ID=$(grep "^WA_PHONE_NUMBER_ID=" .env 2>/dev/null | cut -d '=' -f2- || echo "")

if [ -z "$WA_TOKEN" ] || [ "$WA_TOKEN" == "your_token_here" ]; then
    echo -e "${YELLOW}⚠️  WA_TOKEN not configured${NC}"
    echo -e "\n${BOLD}To get your WhatsApp API Token:${NC}"
    echo -e "1. Go to: ${BLUE}https://business.facebook.com/settings/system-users${NC}"
    echo -e "2. Create or select a system user"
    echo -e "3. Click 'Generate New Token'"
    echo -e "4. Select your WhatsApp Business App"
    echo -e "5. Grant permissions:"
    echo -e "   - whatsapp_business_messaging"
    echo -e "   - whatsapp_business_management"
    echo -e "6. Copy the generated token (it won't be shown again!)\n"
    
    read -p "Enter your WA_TOKEN (or press Enter to skip): " new_token
    if [ ! -z "$new_token" ]; then
        # Update or add WA_TOKEN in .env
        if grep -q "^WA_TOKEN=" .env; then
            sed -i.bak "s|^WA_TOKEN=.*|WA_TOKEN=$new_token|" .env
        else
            echo "WA_TOKEN=$new_token" >> .env
        fi
        echo -e "${GREEN}✅ WA_TOKEN updated${NC}"
    else
        echo -e "${YELLOW}⏭️  Skipped WA_TOKEN configuration${NC}"
    fi
else
    echo -e "${GREEN}✅ WA_TOKEN is configured${NC}"
fi

if [ -z "$WA_PHONE_NUMBER_ID" ] || [ "$WA_PHONE_NUMBER_ID" == "your_phone_number_id_here" ]; then
    echo -e "${YELLOW}⚠️  WA_PHONE_NUMBER_ID not configured${NC}"
    echo -e "\n${BOLD}To get your Phone Number ID:${NC}"
    echo -e "1. Go to: ${BLUE}https://developers.facebook.com/apps${NC}"
    echo -e "2. Select your app → WhatsApp → API Setup"
    echo -e "3. Copy the Phone Number ID\n"
    
    read -p "Enter your WA_PHONE_NUMBER_ID (or press Enter to skip): " new_phone_id
    if [ ! -z "$new_phone_id" ]; then
        # Update or add WA_PHONE_NUMBER_ID in .env
        if grep -q "^WA_PHONE_NUMBER_ID=" .env; then
            sed -i.bak "s|^WA_PHONE_NUMBER_ID=.*|WA_PHONE_NUMBER_ID=$new_phone_id|" .env
        else
            echo "WA_PHONE_NUMBER_ID=$new_phone_id" >> .env
        fi
        echo -e "${GREEN}✅ WA_PHONE_NUMBER_ID updated${NC}"
    else
        echo -e "${YELLOW}⏭️  Skipped WA_PHONE_NUMBER_ID configuration${NC}"
    fi
else
    echo -e "${GREEN}✅ WA_PHONE_NUMBER_ID is configured${NC}"
fi

# Optional configurations
echo -e "\n${BOLD}Optional Configuration (press Enter to skip):${NC}"

# WA_BUSINESS_ACCOUNT_ID
WA_BUSINESS_ACCOUNT_ID=$(grep "^WA_BUSINESS_ACCOUNT_ID=" .env 2>/dev/null | cut -d '=' -f2- || echo "")
if [ -z "$WA_BUSINESS_ACCOUNT_ID" ]; then
    read -p "WA_BUSINESS_ACCOUNT_ID (for template management): " waba_id
    if [ ! -z "$waba_id" ]; then
        echo "WA_BUSINESS_ACCOUNT_ID=$waba_id" >> .env
        echo -e "${GREEN}✅ WA_BUSINESS_ACCOUNT_ID added${NC}"
    fi
fi

# WA_WEBHOOK_VERIFY_TOKEN
WA_WEBHOOK_VERIFY_TOKEN=$(grep "^WA_WEBHOOK_VERIFY_TOKEN=" .env 2>/dev/null | cut -d '=' -f2- || echo "")
if [ -z "$WA_WEBHOOK_VERIFY_TOKEN" ]; then
    read -p "WA_WEBHOOK_VERIFY_TOKEN (custom verify token): " verify_token
    if [ ! -z "$verify_token" ]; then
        echo "WA_WEBHOOK_VERIFY_TOKEN=$verify_token" >> .env
        echo -e "${GREEN}✅ WA_WEBHOOK_VERIFY_TOKEN added${NC}"
    fi
fi

# Ensure optional defaults exist
if ! grep -q "^WA_API_VERSION=" .env; then
    echo "WA_API_VERSION=v22.0" >> .env
fi

if ! grep -q "^WA_API_BASE=" .env; then
    echo "WA_API_BASE=https://graph.facebook.com" >> .env
fi

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 2: Database Migration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${YELLOW}⚠️  Database migration is required to create/update the WhatsApp message tokens table.${NC}"
echo -e "This will:"
echo -e "  1. Create the ${BOLD}whatsapp_message_tokens${NC} table if it doesn't exist"
echo -e "  2. Rename columns from snake_case to camelCase if needed"
echo -e "  3. Add performance indexes\n"

read -p "Run database migration now? (y/N): " run_migration
if [ "$run_migration" == "y" ] || [ "$run_migration" == "Y" ]; then
    echo -e "\n${BLUE}Running migration...${NC}"
    npm run build
    npm run typeorm migration:run
    echo -e "${GREEN}✅ Migration completed${NC}"
else
    echo -e "${YELLOW}⏭️  Skipped migration. Run manually later with:${NC}"
    echo -e "   ${BOLD}npm run typeorm migration:run${NC}"
fi

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Step 3: Test Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

read -p "Test WhatsApp configuration now? (y/N): " run_test
if [ "$run_test" == "y" ] || [ "$run_test" == "Y" ]; then
    echo -e "\n${BLUE}Testing configuration...${NC}"
    node test-whatsapp-config.js
else
    echo -e "${YELLOW}⏭️  Skipped test. Run manually later with:${NC}"
    echo -e "   ${BOLD}node test-whatsapp-config.js${NC}"
fi

echo -e "\n${BOLD}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════${NC}\n"

echo -e "${BOLD}Next Steps:${NC}"
echo -e "1. Review your .env file: ${BLUE}nano .env${NC}"
echo -e "2. Start the server: ${BLUE}npm run dev${NC}"
echo -e "3. Check the logs: ${BLUE}tail -f logs/combined.log${NC}"
echo -e "4. Read troubleshooting guide: ${BLUE}cat WHATSAPP_FIX_SUMMARY.md${NC}\n"

echo -e "${BOLD}Helpful Commands:${NC}"
echo -e "  ${BLUE}node test-whatsapp-config.js${NC}      - Test WhatsApp configuration"
echo -e "  ${BLUE}npm run dev${NC}                       - Start development server"
echo -e "  ${BLUE}tail -f logs/error.log | grep -i whatsapp${NC}  - Monitor WhatsApp errors\n"

echo -e "${YELLOW}⚠️  Important Reminders:${NC}"
echo -e "  • Ensure your templates are approved in WhatsApp Business Manager"
echo -e "  • System User Tokens never expire (recommended)"
echo -e "  • User Access Tokens expire in 24-90 days"
echo -e "  • Check template parameters match your code\n"

echo -e "For detailed troubleshooting, see:"
echo -e "  ${BLUE}WHATSAPP_FIX_SUMMARY.md${NC}"
echo -e "  ${BLUE}WHATSAPP_TROUBLESHOOTING.md${NC}\n"

