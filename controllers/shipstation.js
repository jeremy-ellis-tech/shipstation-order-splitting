const axios = require("axios");

const bannerSkuPrefix = "ba001";

/**
 * Receives and processes a new order webhook from ShipStation.
 */
exports.newOrders = async (req, res, next) => {
  try {
    // Retrieve the URL from the ShipStation webhook.
    const url = req.body.resource_url;

    // Pull the new orders
    const response = await shipstationApiCall(url);

    // If there are new orders, analyze the new orders.
    if (response.data.orders.length >= 1) {
      analyzeOrders(response.data.orders);
    }

    // Reply to the REST API request that new orders have been analyzed.
    res.status(200).json({
      message: `Analyzed ${response.data.orders.length} new order(s).`,
      data: response.data.orders,
    });
  } catch (err) {
    console.error(err);
    throw new Error(err);
  }
};

/**
 * Analyzs a new order from ShipStation to determine if a split is necessary.
 *
 * @param  {array} newOrders an array of order objects from ShipStation
 */
const analyzeOrders = async (newOrders) => {
  // Loop through each new order.
  for (let x = 0; x < newOrders.length; x++) {
    try {
      const order = newOrders[x];

      // If there are multiple warehouse locations, split the order.
      if (order.items.some(i => i.sku.startsWith(bannerSkuPrefix)) && order.items.some(i => !i.sku.startsWith(bannerSkuPrefix))) {
        const orderUpdateArray = splitShipstationOrder(order);
        await shipstationApiCall(
          "https://ssapi.shipstation.com/orders/createorders",
          "post",
          orderUpdateArray
        );
      }
    } catch (err) {
      console.error(err);
      throw new Error(err);
    }
  }
};

/**
 * Copies the primary order for each new order, adjusting the items on each to correspond
 * to the correct warehouse location.
 *
 * @param  {object} order an order object from the ShipStation API
 * @return {array} an array of order objects to be updated in ShipStation
 */
const splitShipstationOrder = (order) => {
  let orderUpdateArray = [];

  try {

    let tempBannerOrder = { ...order };
    tempBannerOrder.orderNumber = `${tempBannerOrder.orderNumber}-banner`;
    tempBannerOrder.items = tempBannerOrder.items.filter(i => i.sku.startsWith(bannerSkuPrefix));
    orderUpdateArray.push(tempBannerOrder);

    let tempSplitOrder = { ...order };
    tempSplitOrder.orderNumber = `${tempSplitOrder.orderNumber}-split`;
    tempSplitOrder.items = tempSplitOrder.items.filter(i => !i.sku.startsWith(bannerSkuPrefix));

    delete tempSplitOrder.orderKey;
    delete tempSplitOrder.orderId;
    tempSplitOrder.amountPaid = 0;
    tempSplitOrder.taxAmount = 0;
    tempSplitOrder.shippingAmopunt = 0;
    orderUpdateArray.push(tempSplitOrder);

  } catch (err) {
    console.error(err);
    throw new Error(err);
  }

  return orderUpdateArray;
};

/**
 * Performs a ShipStation API Call
 *
 * @param {string} url the full URL to call from ShipStation
 * @param {string} method generally "get" or "post"
 * @param {JSON} body the body of a POST request (if applicable)
 *
 * @return {JSON} the response from the API call
 */
const shipstationApiCall = async (url, method, body) => {
  try {
    const config = {
      method: method || "get",
      url: url,
      headers: {
        // Your API Authorization token goes here.
        Authorization: process.env.SHIPSTATION_API_KEY,
        "Content-Type": "application/json",
      },
    };

    if (body && method.toLowerCase() === "post") {
      config["data"] = JSON.stringify(body);
    }

    const response = await axios(config);
    return response;
  } catch (err) {
    console.error(err);
    throw new Error(err);
  }
};
