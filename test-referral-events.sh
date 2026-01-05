#!/bin/bash
# Test script for Referral Events API

API_BASE="http://127.0.0.1:5050"

echo "=== Testing Referral Events API ==="
echo ""

# 1. Test: Get referral events (should return empty array initially)
echo "1. GET /api/admin/referral-events"
curl -s -X GET "${API_BASE}/api/admin/referral-events" | jq '.' || curl -s -X GET "${API_BASE}/api/admin/referral-events"
echo ""
echo ""

# 2. Test: Get referral credit for a patient (should return 0 if patient exists)
echo "2. GET /api/patient/p1/referral-credit"
curl -s -X GET "${API_BASE}/api/patient/p1/referral-credit" | jq '.' || curl -s -X GET "${API_BASE}/api/patient/p1/referral-credit"
echo ""
echo ""

# Note: To test payment-event endpoint, you need:
# - An approved referral (inviterPatientId -> inviteePatientId)
# - Payment details (inviteePaymentId, inviteePaidAmount)
# Example:
# curl -X POST "${API_BASE}/api/referrals/payment-event" \
#   -H "Content-Type: application/json" \
#   -d '{
#     "inviteePatientId": "p2",
#     "inviteePaymentId": "pay_123",
#     "inviteePaidAmount": 100,
#     "currency": "USD",
#     "paymentStatus": "PAID"
#   }'

