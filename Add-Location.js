import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const client = new DynamoDBClient({});
const tableName = "Serverless_Inventory";

export const handler = async (event) => {
  
  // else proceed with handler logic
  console.debug("Handled event: " + JSON.stringify(event));
  

  // locationId:  String representing location to add items to
  // items:       List of item objects to add to the above location
  const requestJSON = JSON.parse(getIfExists(event, 'body'));
  const locationId = getIfExists(requestJSON, 'locationId');
  
  console.debug("Received ADD request: " + JSON.stringify(requestJSON));
  console.debug("Adding items to locationId: " + JSON.stringify(locationId));
  
  const items = getIfExists(requestJSON, 'items');
  const createdAt = Date.now();
  
  const failedRequests = 
    await Promise.all(items.map(async (item) => {
      const itemId = getIfExists(item, 'itemId');
      const expiry = getIfExists(item, 'expiry');
      const itemKey = makeKey(itemId, expiry);
      const itemQuantity = getIfExists(item, 'quantity');
      const params = getUpdateParams(locationId, itemKey, itemQuantity, createdAt);
      
      console.debug("Request parameters: " + JSON.stringify(params));
    
      const failedRequests = [];
  
      try {
        const response = await client.send(new UpdateItemCommand(params));
        console.debug("Item updated successfully: ", response);
    
      } catch (error) {
        console.error("Error updating item " + itemKey + ": ", error);
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
    body: JSON.stringify(failedRequests)
  };
  
  return response;
};

function getUpdateParams(locationId, itemId, itemQuantity, createdAt) {
  const params = {
    TableName: tableName,
    Key: marshall({
      LocationId: locationId,
      ItemId: itemId
    }),
    UpdateExpression: "ADD Quantity :quantity SET CreatedAt = if_not_exists(CreatedAt, :createdAt)",
    ExpressionAttributeValues: marshall({
      ':quantity': itemQuantity,
      ':createdAt': createdAt
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
}

function makeKey(itemId, expiry) {
  return itemId + ":" + expiryToString(expiry);
}

function expiryToString(expiry) {
  const year = getIfExists(expiry, 'year').toString();
  const month = getIfExists(expiry, 'month').toString();
  const day = getIfExists(expiry, 'day').toString();
  
  return year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0');
}