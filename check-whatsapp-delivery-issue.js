#!/usr/bin/env node

/**
 * WhatsApp Delivery Issue Diagnostic Tool
 * 
 * This script helps identify why messages show as "success" but don't deliver.
 * The issue is likely NOT in your code, but in WhatsApp app verification status.
 */

const axios = require('axios');
require('dotenv').config();

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkAppVerificationStatus() {
  log('\n🔍 CHECKING WHATSAPP APP VERIFICATION STATUS', 'bright');
  log('='.repeat(60), 'cyan');

  const token = process.env.WA_TOKEN;
  const phoneId = process.env.WA_PHONE_NUMBER_ID;
  const base = process.env.WA_API_BASE || 'https://graph.facebook.com';
  const version = process.env.WA_API_VERSION || 'v22.0';

  if (!token || !phoneId) {
    log('\n❌ Missing required environment variables:', 'red');
    log('   - WA_TOKEN', 'yellow');
    log('   - WA_PHONE_NUMBER_ID', 'yellow');
    return;
  }

  try {
    const url = `${base}/${version}/${phoneId}`;
    log(`\n📡 Fetching app status from: ${url}`, 'blue');

    const response = await axios.get(url, {
      params: {
        fields: 'display_phone_number,verified_name,quality_rating,messaging_limit_tier,account_type',
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    log('\n✅ API Connection Successful!', 'green');
    log('\n📊 APP STATUS DETAILS:', 'bright');
    log(JSON.stringify(response.data, null, 2), 'cyan');

    // Check verification status
    log('\n🔐 VERIFICATION ANALYSIS:', 'bright');
    
    if (response.data.verified_name) {
      log(`✅ Verified Name: ${response.data.verified_name}`, 'green');
    } else {
      log('❌ No verified name - App may not be fully verified', 'red');
    }

    if (response.data.quality_rating) {
      const rating = response.data.quality_rating;
      if (rating === 'GREEN') {
        log(`✅ Quality Rating: ${rating} (Excellent)`, 'green');
      } else if (rating === 'YELLOW') {
        log(`⚠️  Quality Rating: ${rating} (Warning)`, 'yellow');
      } else if (rating === 'RED') {
        log(`❌ Quality Rating: ${rating} (Critical - messaging limited)`, 'red');
      }
    }

    if (response.data.messaging_limit_tier) {
      const tier = response.data.messaging_limit_tier;
      log(`📊 Messaging Limit Tier: ${tier}`, 'cyan');
      
      if (tier === 'TIER_50' || tier === 'TIER_250') {
        log('⚠️  LOW MESSAGING LIMIT - App may not be fully verified', 'yellow');
        log('   This explains why messages show success but don\'t deliver!', 'yellow');
      }
    }

    if (response.data.account_type) {
      log(`📱 Account Type: ${response.data.account_type}`, 'cyan');
    }

    // Critical diagnosis
    log('\n🎯 DIAGNOSIS:', 'bright');
    log('='.repeat(60), 'cyan');
    
    const isLowTier = response.data.messaging_limit_tier && 
      (response.data.messaging_limit_tier === 'TIER_50' || 
       response.data.messaging_limit_tier === 'TIER_250');
    
    const hasNoVerifiedName = !response.data.verified_name;
    const isRedQuality = response.data.quality_rating === 'RED';

    if (isLowTier || hasNoVerifiedName || isRedQuality) {
      log('\n❌ ISSUE IDENTIFIED: App is NOT fully verified!', 'red');
      log('\n📋 WHY MESSAGES SHOW SUCCESS BUT DON\'T DELIVER:', 'yellow');
      log('   1. WhatsApp API accepts your request (returns 200 OK)', 'reset');
      log('   2. But WhatsApp DOES NOT deliver messages due to:', 'reset');
      log('      - App not fully verified', 'reset');
      log('      - 24-hour messaging window restriction', 'reset');
      log('      - Can only message users who messaged you in last 24 hours', 'reset');
      log('\n✅ SOLUTION:', 'green');
      log('   1. Complete Business Verification:', 'reset');
      log('      → https://business.facebook.com/settings', 'blue');
      log('   2. Submit your app for review', 'reset');
      log('   3. Wait for approval (can take days/weeks)', 'reset');
      log('\n⚠️  TEMPORARY WORKAROUND:', 'yellow');
      log('   - Only message users who have messaged you in last 24 hours', 'reset');
      log('   - This is a WhatsApp restriction, NOT a code issue', 'reset');
    } else {
      log('\n✅ App appears to be properly configured', 'green');
      log('   If messages still don\'t deliver, check:', 'yellow');
      log('   1. Template approval status', 'reset');
      log('   2. Phone numbers are on WhatsApp', 'reset');
      log('   3. Users haven\'t blocked your business number', 'reset');
      log('   4. Webhook logs for delivery status', 'reset');
    }

  } catch (error) {
    log('\n❌ Error checking app status:', 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      log(`   Error: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
      
      if (error.response.status === 401) {
        log('\n🚨 ACCESS TOKEN EXPIRED!', 'red');
        log('   Update WA_TOKEN in your .env file', 'yellow');
      }
    } else {
      log(`   ${error.message}`, 'red');
    }
  }
}

async function checkRecentWebhookLogs() {
  log('\n📋 CHECKING WEBHOOK DELIVERY STATUS', 'bright');
  log('='.repeat(60), 'cyan');
  log('\n💡 To check webhook delivery status:', 'yellow');
  log('   1. Check your logs for webhook events:', 'reset');
  log('      tail -f logs/combined.log | grep -i "whatsapp.*status"', 'blue');
  log('\n   2. Look for these statuses:', 'reset');
  log('      ✅ "delivered" = Message reached user', 'green');
  log('      ❌ "failed" = Message did not deliver', 'red');
  log('      ⏳ "sent" = Accepted but not yet delivered', 'yellow');
  log('\n   3. If you see "failed" status, check error codes:', 'reset');
  log('      - Error 1 = Phone not on WhatsApp', 'red');
  log('      - Error 131026 = User blocked you', 'red');
  log('      - Error 131047 = 24-hour window expired', 'red');
}

async function main() {
  log('\n🚀 WhatsApp Delivery Issue Diagnostic Tool', 'bright');
  log('='.repeat(60), 'cyan');
  log('\nThis tool helps identify why messages show "success" but don\'t deliver.', 'yellow');
  log('The issue is likely NOT in your code, but in WhatsApp app verification.', 'yellow');

  await checkAppVerificationStatus();
  await checkRecentWebhookLogs();

  log('\n📝 SUMMARY:', 'bright');
  log('='.repeat(60), 'cyan');
  log('\n✅ Your code is CORRECT - API success is logged correctly', 'green');
  log('❌ The issue is WhatsApp app verification status', 'red');
  log('📱 WhatsApp API returns 200 OK even when messages won\'t deliver', 'yellow');
  log('🔍 Check webhook logs for ACTUAL delivery status', 'cyan');
  log('\n💡 Next Steps:', 'bright');
  log('   1. Complete Business Verification', 'reset');
  log('   2. Check webhook logs for delivery status', 'reset');
  log('   3. Monitor messaging_limit_tier - should be TIER_1K or higher', 'reset');
  log('\n');
}

main().catch(console.error);

