#!/usr/bin/env node

/**
 * WhatsApp Message Delivery Debugger
 * 
 * Helps debug why some messages are sent but not received
 */

require('dotenv').config();
const axios = require('axios');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function debugMessageDelivery() {
  const messageId = process.argv[2];
  const phoneNumber = process.argv[3];

  if (!messageId) {
    log('\n❌ Missing message ID', 'red');
    log('\nUsage:', 'yellow');
    log('  node debug-message-delivery.js <messageId> [phoneNumber]', 'blue');
    log('\nExample:', 'yellow');
    log('  node debug-message-delivery.js wamid.HBgMOTE5MTIzMzQ2ODE1FQIAERgSQjEwOUJCMEUwMkUwQkE4M0NEAA== +919123346815', 'blue');
    log('\nOr check logs:', 'yellow');
    log('  tail -f logs/combined.log | grep "Message ID"', 'blue');
    process.exit(1);
  }

  log('\n╔═══════════════════════════════════════════════════════════════╗', 'bold');
  log('║        WhatsApp Message Delivery Debugger                    ║', 'bold');
  log('╚═══════════════════════════════════════════════════════════════╝', 'bold');

  log('\n📋 Input:', 'blue');
  log(`  Message ID: ${messageId}`);
  if (phoneNumber) {
    log(`  Phone Number: ${phoneNumber}`);
  }

  // Check if we can query the message (requires Business API access)
  const token = process.env.WA_TOKEN;
  const phoneId = process.env.WA_PHONE_NUMBER_ID;
  const baseUrl = process.env.WA_API_BASE || 'https://graph.facebook.com';
  const version = process.env.WA_API_VERSION || 'v22.0';

  if (!token || !phoneId) {
    log('\n⚠️  Warning: WA_TOKEN or WA_PHONE_NUMBER_ID not set', 'yellow');
    log('Cannot query message status from API directly.', 'yellow');
    log('\nCheck webhook logs instead:', 'blue');
    log('  tail -f logs/combined.log | grep -i "status update"', 'blue');
    return;
  }

  log('\n🔍 Checking possible issues...', 'blue');
  log('');

  // Common issues checklist
  const issues = [
    {
      emoji: '📱',
      issue: 'Phone Number Not on WhatsApp',
      description: 'The number is not registered or active on WhatsApp',
      solution: 'Verify the number is active on WhatsApp by sending a regular message',
      likelihood: 'High'
    },
    {
      emoji: '🚫',
      issue: 'User Blocked Business Number',
      description: 'The recipient has blocked your WhatsApp Business number',
      solution: 'Ask the user to unblock your number in their WhatsApp settings',
      likelihood: 'Medium'
    },
    {
      emoji: '📴',
      issue: 'User Offline',
      description: 'User\'s phone is off or not connected to internet',
      solution: 'Message will be delivered when user comes online (can take hours/days)',
      likelihood: 'Medium'
    },
    {
      emoji: '⚠️',
      issue: 'Quality Rating Issue',
      description: 'Your business number has a RED quality rating',
      solution: 'Check quality rating at: https://business.facebook.com/wa/manage/phone-numbers/',
      likelihood: 'Low'
    },
    {
      emoji: '🔒',
      issue: 'Privacy Settings',
      description: 'User\'s WhatsApp privacy settings block business messages',
      solution: 'User needs to adjust their privacy settings',
      likelihood: 'Low'
    },
    {
      emoji: '📋',
      issue: 'Template Not Fully Approved',
      description: 'Template in "Limited" state, only delivering to some users',
      solution: 'Check template status at: https://business.facebook.com/wa/manage/message-templates/',
      likelihood: 'Low'
    },
  ];

  issues.forEach((item, index) => {
    log(`${index + 1}. ${item.emoji} ${item.issue}`, 'yellow');
    log(`   ${item.description}`, 'reset');
    log(`   Solution: ${item.solution}`, 'blue');
    log(`   Likelihood: ${item.likelihood}`, item.likelihood === 'High' ? 'red' : item.likelihood === 'Medium' ? 'yellow' : 'green');
    log('');
  });

  // Check webhook logs
  log('\n📊 What to Check:', 'bold');
  log('');
  log('1. Monitor webhook logs for this message:', 'yellow');
  log(`   grep "${messageId}" logs/combined.log`, 'blue');
  log('');
  log('2. Look for status updates:', 'yellow');
  log('   - "sent" = Message accepted by WhatsApp but not delivered yet', 'reset');
  log('   - "delivered" = Message delivered to user\'s phone ✅', 'green');
  log('   - "read" = User opened the message ✅', 'green');
  log('   - "failed" = Message failed to deliver ❌', 'red');
  log('');
  log('3. If status is "sent" for more than 30 minutes:', 'yellow');
  log('   - User is likely offline or phone is off', 'reset');
  log('   - Message will deliver when user comes online', 'reset');
  log('');
  log('4. If status is "failed":', 'yellow');
  log('   - Check error code in webhook logs', 'reset');
  log('   - Error code 1 = Phone not on WhatsApp', 'red');
  log('   - Error code 131026 = User blocked you', 'red');
  log('   - Error code 131047 = Re-engagement needed (24hr window)', 'red');
  log('');

  // Test if phone number is valid format
  if (phoneNumber) {
    log('\n🔍 Phone Number Analysis:', 'bold');
    log('');
    const normalized = phoneNumber.replace(/[^\d+]/g, '');
    
    if (!/^\+\d{10,15}$/.test(normalized)) {
      log('❌ Invalid Format:', 'red');
      log(`   Current: ${normalized}`, 'reset');
      log(`   Expected: +{country_code}{number} (e.g., +919123456789)`, 'blue');
    } else {
      log(`✅ Format is valid: ${normalized}`, 'green');
      
      if (normalized.startsWith('+91')) {
        if (normalized.length === 13) {
          log('✅ Indian number format is correct', 'green');
        } else {
          log(`⚠️  Warning: Indian numbers should be 13 characters (including +91)`, 'yellow');
          log(`   Current length: ${normalized.length}`, 'reset');
        }
      }
    }
  }

  log('\n📝 Recommended Actions:', 'bold');
  log('');
  log('1. Check if the phone number is on WhatsApp:', 'yellow');
  log('   - Send a regular WhatsApp message to the number', 'blue');
  log('   - If it says "not on WhatsApp" → That\'s your issue!', 'red');
  log('');
  log('2. Monitor webhook logs:', 'yellow');
  log('   tail -f logs/combined.log | grep -A 10 -B 2 "Status Update"', 'blue');
  log('');
  log('3. Check your quality rating:', 'yellow');
  log('   https://business.facebook.com/wa/manage/phone-numbers/', 'blue');
  log('');
  log('4. Verify template is approved:', 'yellow');
  log('   https://business.facebook.com/wa/manage/message-templates/', 'blue');
  log('');

  log('═'.repeat(63), 'bold');
  log('');
}

// Run the debugger
debugMessageDelivery().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});

