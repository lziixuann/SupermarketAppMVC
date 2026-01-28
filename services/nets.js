const axios = require('axios');
const Order = require('../models/order');
const paymentEvents = require('../utils/paymentStatus');

async function markOrderPending(orderId, reference) {
  if (!orderId) return;
  await new Promise((resolve, reject) => {
    Order.updatePaymentStatus(
      orderId,
      'pending',
      { paymentProvider: 'nets', paymentReference: reference || null },
      (err) => (err ? reject(err) : resolve())
    );
  });
  paymentEvents.publish(orderId, 'pending', {
    paymentProvider: 'nets',
    paymentReference: reference || null
  });
}

async function getOrderWithItems(orderId) {
  if (!orderId) return null;
  return await new Promise((resolve, reject) => {
    Order.getById(orderId, (err, order) => {
      if (err) return reject(err);
      resolve(order || null);
    });
  });
}

exports.generateQrCode = async (req, res) => {
  const { cartTotal, orderId, billing } = req.body;
  console.log('NETS QR Generation - Total:', cartTotal, 'OrderId:', orderId);

  // Allow forcing the local mock flow even when credentials exist
  if (process.env.NETS_FORCE_LOCAL_MOCK === '1') {
    console.warn('NETS_FORCE_LOCAL_MOCK=1 set. Using local mock NETS QR flow.');
    return generateMockQrCode(req, res, cartTotal, orderId, billing);
  }

  // Check if NETS credentials are available
  if (!process.env.API_KEY || !process.env.PROJECT_ID) {
    console.warn('NETS credentials not configured. Using mock QR code for testing.');
    return generateMockQrCode(req, res, cartTotal, orderId, billing);
  }

  try {
    const requestBody = {
      txn_id: 'sandbox_nets|m|8ff8e5b6-d43e-4786-8ac5-7accf8c5bd9b', // Default for testing
      amt_in_dollars: cartTotal,
      notify_mobile: 0
    };

    const response = await axios.post(
      'https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/request',
      requestBody,
      {
        headers: {
          'api-key': process.env.API_KEY,
          'project-id': process.env.PROJECT_ID
        }
      }
    );

    const getCourseInitIdParam = () => {
      try {
        require.resolve('./../course_init_id');
        const { courseInitId } = require('../course_init_id');
        console.log('Loaded courseInitId:', courseInitId);

        return courseInitId ? `${courseInitId}` : '';
      } catch (error) {
        return '';
      }
    };

    const qrData = response.data.result.data;
    console.log({ qrData });

    if (qrData.response_code === '00' && qrData.txn_status === 1 && qrData.qr_code) {
      console.log('QR code generated successfully');

      // Store transaction retrieval reference for later use
      const txnRetrievalRef = qrData.txn_retrieval_ref;
      const courseInitId = getCourseInitIdParam();

      const webhookUrl = `https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets/webhook?txn_retrieval_ref=${txnRetrievalRef}&course_init_id=${courseInitId}`;

      console.log('Transaction retrieval ref:' + txnRetrievalRef);
      console.log('courseInitId:' + courseInitId);
      console.log('webhookUrl:' + webhookUrl);

      try {
        await markOrderPending(orderId, txnRetrievalRef);
      } catch (statusErr) {
        console.error('Failed to mark NETS order as pending:', statusErr.message);
      }

      let orderDetails = null;
      try {
        orderDetails = await getOrderWithItems(orderId);
      } catch (orderErr) {
        console.error('Failed to load order details for NETS QR page:', orderErr.message);
      }

      const resolvedTotal =
        orderDetails && orderDetails.totalAmount != null
          ? Number(orderDetails.totalAmount)
          : Number(cartTotal);

      const renderData = {
        total: resolvedTotal,
        orderId: orderId,
        order: orderDetails,
        email:
          (orderDetails && orderDetails.customerEmail) ||
          (billing && billing.email ? billing.email : ''),
        title: 'Scan to Pay',
        qrCodeUrl: `data:image/png;base64,${qrData.qr_code}`,
        mockPayUrl: null,
        txnRetrievalRef: txnRetrievalRef,
        courseInitId: courseInitId,
        networkCode: qrData.network_status,
        timer: 300, // Timer in seconds
        webhookUrl: webhookUrl,
        fullNetsResponse: response.data,
        apiKey: process.env.API_KEY,
        projectId: process.env.PROJECT_ID
      };

      // If this is an AJAX request, render to string and send as HTML response
      if (req.isAjax) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.render('netsQr', renderData, (err, html) => {
          if (err) {
            console.error('Error rendering netsQr:', err);
            return res.status(500).json({ error: 'Error rendering QR page', message: err.message });
          }
          res.send(html);
        });
      }

      // Otherwise render normally
      return res.render('netsQr', renderData);
    }

    // Handle partial or failed responses
    let errorMsg = 'An error occurred while generating the QR code.';
    if (qrData.network_status !== 0) {
      errorMsg = qrData.error_message || 'Transaction failed. Please try again.';
    }

    const renderData = {
      title: 'Error',
      message: errorMsg,
      responseCode: qrData.response_code || 'N.A.',
      instructions: qrData.instruction || '',
      errorMsg: errorMsg
    };

    if (req.isAjax) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.render('netsTxnFailStatus', renderData, (err, html) => {
        if (err) {
          console.error('Error rendering netsTxnFailStatus:', err);
          return res.status(500).json({ error: 'Error rendering fail page', message: err.message });
        }
        res.send(html);
      });
    }

    return res.render('netsTxnFailStatus', renderData);
  } catch (error) {
    console.error('Error in generateQrCode:', error.message);
    if (req.isAjax) {
      res.status(500).json({ error: 'NETS QR generation failed', message: error.message });
    } else {
      res.redirect('/nets-qr/fail');
    }
  }
};

// Mock QR code generator for testing without real NETS credentials
async function generateMockQrCode(req, res, cartTotal, orderId, billing) {
  try {
    const txnRetrievalRef = 'MOCK_' + Math.random().toString(36).substr(2, 9).toUpperCase();
    const courseInitId = '';

    console.log('Mock NETS Transaction Ref:', txnRetrievalRef);

    markOrderPending(orderId, txnRetrievalRef).catch((statusErr) => {
      console.error('Failed to mark mock NETS order as pending:', statusErr.message);
    });

    let orderDetails = null;
    try {
      orderDetails = await getOrderWithItems(orderId);
    } catch (orderErr) {
      console.error('Failed to load order details for mock NETS QR page:', orderErr.message);
    }

    const resolvedTotal =
      orderDetails && orderDetails.totalAmount != null
        ? Number(orderDetails.totalAmount)
        : Number(cartTotal);

    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0];
    const host = req.get('host');
    const mockPayUrl = `${proto}://${host}/nets/mock-pay?orderId=${encodeURIComponent(orderId)}&txn=${encodeURIComponent(txnRetrievalRef)}`;

    // Use a public QR renderer to encode our local mock payment URL.
    // This keeps the "scan QR to pay" experience while staying in-app.
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(mockPayUrl)}`;

    const renderData = {
      total: resolvedTotal,
      orderId: orderId,
      order: orderDetails,
      email:
        (orderDetails && orderDetails.customerEmail) ||
        (billing && billing.email ? billing.email : ''),
      title: 'Scan to Pay (Mock)',
      qrCodeUrl,
      mockPayUrl,
      txnRetrievalRef: txnRetrievalRef,
      courseInitId: courseInitId,
      networkCode: 0,
      timer: 300,
      webhookUrl: '#',
      fullNetsResponse: { mock: true },
      apiKey: 'MOCK',
      projectId: 'MOCK'
    };

    if (req.isAjax) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.render('netsQr', renderData, (err, html) => {
        if (err) {
          console.error('Error rendering netsQr:', err);
          return res.status(500).json({ error: 'Error rendering QR page', message: err.message });
        }
        res.send(html);
      });
    }

    return res.render('netsQr', renderData);
  } catch (error) {
    console.error('Error in generateMockQrCode:', error.message);
    if (req.isAjax) {
      res.status(500).json({ error: 'Mock QR generation failed', message: error.message });
    } else {
      res.redirect('/nets-qr/fail');
    }
  }
}
