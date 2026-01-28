/**
 * PayPal Integration Test Script
 * This script tests the PayPal API connection and creates a test order
 */

require('dotenv').config();
const paypal = require('./services/paypal');

console.log('='.repeat(60));
console.log('PayPal Integration Test');
console.log('='.repeat(60));

// Check environment variables
console.log('\n1. Checking Environment Variables:');
console.log('   PAYPAL_CLIENT_ID:', process.env.PAYPAL_CLIENT_ID ? '✓ Set' : '✗ Missing');
console.log('   PAYPAL_CLIENT_SECRET:', process.env.PAYPAL_CLIENT_SECRET ? '✓ Set' : '✗ Missing');
console.log('   PAYPAL_API:', process.env.PAYPAL_API || 'https://api.sandbox.paypal.com');
console.log('   PAYPAL_ENVIRONMENT:', process.env.PAYPAL_ENVIRONMENT || 'SANDBOX');

async function testPayPal() {
    try {
        // Test 1: Create Order
        console.log('\n2. Testing PayPal Create Order API:');
        const testAmount = '10.00'; // SGD 10.00
        console.log(`   Creating test order for SGD ${testAmount}...`);
        
        const order = await paypal.createOrder(testAmount);
        
        if (order && order.id) {
            console.log('   ✓ Order created successfully!');
            console.log('   Order ID:', order.id);
            console.log('   Status:', order.status);
            console.log('   Order Details:', JSON.stringify(order, null, 2));
            
            // Extract approval URL
            const approvalLink = order.links?.find(link => link.rel === 'approve');
            if (approvalLink) {
                console.log('\n3. Next Steps:');
                console.log('   To complete the payment, visit this URL:');
                console.log('   ' + approvalLink.href);
                console.log('\n   OR test via your application at:');
                console.log('   http://localhost:3000/checkout');
            }
            
            console.log('\n4. PayPal Integration Status: ✓ WORKING');
            console.log('   Your PayPal credentials are valid and the API is responding correctly.');
            console.log('   You can now proceed to test the full checkout flow in your application.');
            
        } else {
            console.log('   ✗ Failed to create order');
            console.log('   Response:', JSON.stringify(order, null, 2));
        }
        
    } catch (error) {
        console.log('\n   ✗ Error occurred:');
        console.log('   Message:', error.message);
        if (error.response) {
            console.log('   Response:', await error.response.text());
        }
        console.log('\n4. PayPal Integration Status: ✗ ERROR');
        console.log('   Please check your credentials and network connection.');
    }
}

// Run the test
testPayPal().then(() => {
    console.log('\n' + '='.repeat(60));
    console.log('Test Complete');
    console.log('='.repeat(60) + '\n');
});
