#!/bin/bash
# Test script for Complete Referral Flow
# This script helps test the referral system end-to-end

API_BASE="http://127.0.0.1:5050"

echo "=== Referral Flow Test Guide ==="
echo ""
echo "This script will help you test the referral system."
echo "Make sure the backend server is running: node index.cjs"
echo ""
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}STEP 1: Check existing referrals${NC}"
echo "GET /api/admin/referrals"
curl -s -X GET "${API_BASE}/api/admin/referrals" | jq '.' || curl -s -X GET "${API_BASE}/api/admin/referrals"
echo ""
echo ""

echo -e "${YELLOW}STEP 2: Check referral events${NC}"
echo "GET /api/admin/referral-events"
curl -s -X GET "${API_BASE}/api/admin/referral-events" | jq '.' || curl -s -X GET "${API_BASE}/api/admin/referral-events"
echo ""
echo ""

echo -e "${GREEN}INSTRUCTIONS:${NC}"
echo ""
echo "To test the complete flow:"
echo ""
echo "1. INVITER (First Account):"
echo "   - Login to the mobile app"
echo "   - Go to 'Reviews' tab"
echo "   - Copy your referral code (your patient ID)"
echo ""
echo "2. INVITEE (New Account):"
echo "   - Open register screen in mobile app"
echo "   - Enter name and phone"
echo "   - Enter the referral code from step 1"
echo "   - Register"
echo ""
echo "3. ADMIN:"
echo "   - Go to http://localhost:3001/admin/referrals"
echo "   - Find the new referral (status: PENDING)"
echo "   - Click 'Approve'"
echo ""
echo "4. TEST PAYMENT EVENT:"
echo "   Run this command with actual patient IDs:"
echo ""
echo "   curl -X POST \"${API_BASE}/api/referrals/payment-event\" \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{"
echo "       \"inviteePatientId\": \"<INVITEE_PATIENT_ID>\","
echo "       \"inviteePaymentId\": \"pay_test_123\","
echo "       \"inviteePaidAmount\": 100,"
echo "       \"currency\": \"USD\","
echo "       \"paymentStatus\": \"PAID\""
echo "     }'"
echo ""
echo "5. CHECK INVITER CREDIT:"
echo "   curl -X GET \"${API_BASE}/api/patient/<INVITER_PATIENT_ID>/referral-credit\""
echo ""
echo ""

