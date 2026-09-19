require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const Razorpay = require('razorpay');

const app = express();
const port = Number(process.env.PORT) || 3000;
const ordersFile = path.join(__dirname, 'orders.json');
const products = new Map([
  [1, { name: 'Mush Rank', amount: 89900 }],
  [2, { name: 'Grand Rank', amount: 59900 }],
  [3, { name: 'Apex Rank', amount: 29900 }]
]);

app.use(express.json());
app.use(express.static(__dirname));

function readOrders() {
  try {
    const orders = JSON.parse(fs.readFileSync(ordersFile, 'utf8'));
    return Array.isArray(orders) ? orders : [];
  } catch (error) {
    return [];
  }
}

function writeOrders(orders) {
  fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
}

function requireAdmin(request, response, next) {
  if (!process.env.ADMIN_TOKEN || request.get('x-admin-token') !== process.env.ADMIN_TOKEN) {
    return response.status(401).json({ error: 'Admin access required.' });
  }
  return next();
}

function getRazorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay credentials are missing. Add them to .env.');
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

function calculateCart(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Your cart is empty.');
  }

  return items.map((item) => {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);
    const product = products.get(productId);

    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new Error('Your cart contains an invalid product or quantity.');
    }

    return {
      productId,
      name: product.name,
      quantity,
      amount: product.amount,
      lineTotal: product.amount * quantity
    };
  });
}

app.post('/api/create-order', async (request, response) => {
  try {
    const items = calculateCart(request.body.items);
    const amount = items.reduce((total, item) => total + item.lineTotal, 0);
    const razorpay = getRazorpayClient();
    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `mushland_${Date.now()}`,
      notes: {
        playerName: String(request.body.playerName || 'Guest').slice(0, 50),
        email: String(request.body.email || '').slice(0, 100)
      }
    });

    const orders = readOrders();
    orders.push({
      orderId: order.id,
      status: 'created',
      playerName: String(request.body.playerName || 'Guest').slice(0, 50),
      email: String(request.body.email || '').slice(0, 100),
      items,
      amount,
      currency: 'INR',
      createdAt: new Date().toISOString()
    });
    writeOrders(orders);

    response.json({
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      items
    });
  } catch (error) {
    response.status(400).json({ error: error.message || 'Unable to create payment order.' });
  }
});

app.post('/api/verify-payment', (request, response) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = request.body;
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
    .update(body)
    .digest('hex');

  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  const receivedBuffer = Buffer.from(String(razorpay_signature || ''), 'hex');
  const signaturesMatch = expectedBuffer.length === receivedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);

  if (!razorpay_order_id || !razorpay_payment_id || !signaturesMatch) {
    return response.status(400).json({ verified: false, error: 'Payment verification failed.' });
  }

  const orders = readOrders();
  const order = orders.find((entry) => entry.orderId === razorpay_order_id);
  if (!order) {
    return response.status(404).json({ verified: false, error: 'Order record was not found.' });
  }

  order.status = 'paid_manual_fulfilment';
  order.paymentId = razorpay_payment_id;
  order.paidAt = new Date().toISOString();
  writeOrders(orders);

  return response.json({ verified: true, paymentId: razorpay_payment_id });
});

app.get('/api/admin/orders', requireAdmin, (request, response) => {
  response.json(readOrders().sort((first, second) => second.createdAt.localeCompare(first.createdAt)));
});

app.post('/api/admin/orders/:orderId/fulfill', requireAdmin, (request, response) => {
  const orders = readOrders();
  const order = orders.find((entry) => entry.orderId === request.params.orderId);
  if (!order) return response.status(404).json({ error: 'Order not found.' });
  if (order.status !== 'paid_manual_fulfilment') {
    return response.status(400).json({ error: 'Only verified paid orders can be fulfilled.' });
  }

  order.status = 'fulfilled';
  order.fulfilledAt = new Date().toISOString();
  writeOrders(orders);
  return response.json(order);
});

app.delete('/api/admin/orders/fulfilled', requireAdmin, (request, response) => {
  const orders = readOrders();
  const remainingOrders = orders.filter((order) => order.status !== 'fulfilled');
  writeOrders(remainingOrders);
  return response.json({ removed: orders.length - remainingOrders.length });
});

app.listen(port, () => {
  console.log(`Mushland Store running at http://localhost:${port}`);
});
