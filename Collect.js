import { DynamoDBClient, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const client = new DynamoDBClient({});
const tableName = "Serverless_Inventory";

// deletes items in the order if all items are allocated to the given order
// otherwise false
export const handler = async (event) => {
  
  // else proceed with handler logic
  console.debug("Handled event: " + JSON.stringify(event));
  
  // locationId:  String identifying the location the relevant items exist in
  // orderId:     String identifying the order to collect allocated items from
  // items:       Delete items if all items are allocated to the above order
  const requestJSON = JSON.parse(getIfExists(event, 'body'));
  console.debug("requestJSON: " + JSON.stringify(requestJSON));
  
  const locationId = getIfExists(requestJSON, 'locationId');
  const orderId = getIfExists(requestJSON, 'orderId');
  const items = getIfExists(requestJSON, 'items');
  console.debug("items: " + JSON.stringify(items));
  
  console.debug("Received COLLECT request: " + JSON.stringify(requestJSON));
  console.debug("Deleting items from locationId: " + locationId);
  
  const failedRequests = 
    await Promise.all(items.map(async (item) => {
      const itemId = getIfExists(item, 'itemId');
      const expiry = getIfExists(item, 'expiry');
      const itemKey = makeKey(itemId, expiry);
      const params = getDeleteParams(locationId, itemKey, orderId);
      
      console.debug("Request parameters: " + JSON.stringify(params));
    
      const failedRequests = [];
  
      try {
        const response = await client.send(new DeleteItemCommand(params));
        console.debug("Item deleted successfully: ", response);
    
      } catch (error) {
        console.error("Error deleting item " + itemKey + " for order " + orderId + ": ", error);
        failedRequests.push(item);
      }

      return failedRequests;
      
    })).then((nestedFailedRequests) => {
      return nestedFailedRequests.flat();
    }).catch(err => {
      console.error(err);
    });
  
  const response = {
    statusCode: 200,
    body: JSON.stringify(failedRequests),
  };
  return response;
};

function getDeleteParams(locationId, itemId, orderId) {
  const itemOrderId = itemId + '+' + orderId;
  const params = {
    TableName: tableName,
    Key: marshall({
      LocationId: locationId,
      ItemId: itemOrderId
    })
  };
  
  return params;
}


// If the object contains the key, return the associated value, otherwise return {}
//
// object: any javascript object
// key:    a string
function getIfExists(object, key) {
  let value = {};
  if (object[key]) {
    value = object[key];
  }
  
  return value;
};

function makeKey(itemId, expiry) {
  return itemId + ":" + expiryToString(expiry);
}

function expiryToString(expiry) {
  const year = getIfExists(expiry, 'year').toString();
  const month = getIfExists(expiry, 'month').toString();
  const day = getIfExists(expiry, 'day').toString();
  
  return year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0');
}
