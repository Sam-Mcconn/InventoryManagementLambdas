import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const client = new DynamoDBClient({});
const tableName = "Serverless_Inventory";

export const handler = async (event) => {
  
  const locationId = getFromPath(event, ['queryStringParameters', 'locationId']);
  const params = getQueryParams(locationId);
  
  let statusCode = 500;
  let items = [];
  
  try {
    const queryResponse = await client.send(new QueryCommand(params));
    items = await getIfExists(queryResponse, 'Items')
    const count = await items.length;
    statusCode = 200;
    console.debug("Successfully retrieved (" + count + ") items for location " + locationId);
    
  } catch (error) {
    console.error("Error retrieving items for location " + locationId + ": ", error);
  }
    
  const response = {
    statusCode: statusCode,
    body: JSON.stringify(items)
  };
  return response;
};

function getQueryParams(locationId) {
  const params = {
    TableName: tableName,
    KeyConditionExpression: "LocationId = :locationId",
    ExpressionAttributeValues: marshall({
     ':locationId': locationId,
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

// Follow the sequence of keys (the path) down the object. 
// If any keys are missing return {}
// ex. getFromPath({a: {b: {c: 1}}}, ['a','b','c']) returns 1
//
// object: any javascript object
// path:   an array of strings representing keys
function getFromPath(object, path) {
  return path.reduce(getIfExists, object);
}