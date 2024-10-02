import { DynamoDBClient, TransactWriteItemsCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const client = new DynamoDBClient({});
const tableName = "Serverless_Inventory";

// Allocates items to an order. Will only allocate if the inventory of the given
// location has enough stock of the items needed for the order and the order has
// not already been allocated any of the given items.
export const handler = async (event) => {
  
  // else proceed with handler logic
  console.debug("Handled event: " + JSON.stringify(event));
  
  // locationId:  String identifying the location the relevant items exist in
  // orderId:     String identifying the order to allocate items to
  // items:       List of item objects to allocate to the above order
  const requestJSON = JSON.parse(getIfExists(event, 'body'));
  
  const locationId = getIfExists(requestJSON, 'locationId');
  const orderId = getIfExists(requestJSON, 'orderId');
  const items = getIfExists(requestJSON, 'items');
  
  console.debug("Received ALLOCATE request at location " + locationId + ": " + JSON.stringify(requestJSON));
  
  const failedRequests = 
    await Promise.all(items.map(async (item) => {
      const itemId = getIfExists(item, 'itemId');
      const expiry = getIfExists(item, 'expiry');
      const itemKey = makeKey(itemId, expiry);
      const itemToAllocate = getIfExists(item, 'quantity');
    
      const failedRequests = [];
  
      try {
        const transactWriteParams = getTransactWriteParams(locationId, itemKey, orderId, itemToAllocate);
        console.debug("Request parameters: " + JSON.stringify(transactWriteParams));
        
        const transactWriteResult = await client.send(new TransactWriteItemsCommand(transactWriteParams));
        
        console.debug("Item allocated successfully: ", transactWriteResult);
        
      } catch (error) {
  
        const reasons = error['CancellationReasons'];
        
        if (Array.isArray(reasons) && reasons.length === 2) {
          // Log why the transaction was cancelled (client error)
          const message = getFailureReason(reasons, itemKey, orderId);
          console.error(message);
          
        } else {
          // Items that failed for a reason other than condition check failures
          // These should be retried by the client
          console.error("Error updating item " + itemKey + ": ", error);
          failedRequests.push(item);
        }
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

function getFailureReason(errorReasons, itemId, orderId) {
  const header = "[ItemId: " + itemId +" | OrderId: " + orderId + "] ";
  const conditionFailureKey = 'Code';
  const conditionFailureCode = 'ConditionalCheckFailed';
  const reason1 = getIfExists(errorReasons[0], conditionFailureKey);
  const reason2 = getIfExists(errorReasons[1], conditionFailureKey);
  
  if (reason1 === conditionFailureCode && reason2 === conditionFailureCode) {
    return header + "Not enough inventory available and inventory for this order has already been allocated";
  } else if (reason1 === conditionFailureCode && reason2 !== conditionFailureCode) {
    return header + "Inventory for this order has already been allocated"
  } else if (reason1 !== conditionFailureCode && reason2 === conditionFailureCode) {
    return header + "Not enough inventory available"
  } else {
    return header + "Unexpected errors: " + errorReasons
  }
}

function getPutParams(locationId, itemId, orderId, toAllocate) {
  const itemOrderId = itemId + '+' + orderId;
  const createdAt = Date.now();
  
  const params = {
    TableName: tableName,
    Item: marshall({
      LocationId: locationId,
      ItemId: itemOrderId,
      Allocated: toAllocate,
      CreatedAt: createdAt
    }),
    ConditionExpression: "attribute_not_exists(LocationId)",
  }
  
  return params;
}

function getUpdateParams(locationId, itemId, toAllocate) {
  const params = {
    TableName: tableName,
    Key: marshall({
      LocationId: locationId,
      ItemId: itemId
    }),
    UpdateExpression: "SET Quantity = Quantity - :toAllocate",
    ConditionExpression: "Quantity >= :toAllocate",
    ExpressionAttributeValues: marshall({
      ':toAllocate': toAllocate
    })
  };
  
  return params;
}

function getTransactWriteParams(locationId, itemId, orderId, toAllocate) {
  const params = {
    TransactItems: [
      {
        Put: getPutParams(locationId, itemId, orderId, toAllocate)
      }, {
        Update: getUpdateParams(locationId, itemId, toAllocate)
      }
    ],
    // implementing this will make requests idempotent for 10 minutes after the first request
    //ClientRequestToken: "STRING_VALUE",
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
