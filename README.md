# InventoryManagementLambdas
Lambda functions for the Akka/Lambda comparisons.

## Get-Location
Queries a specific location and returns with all items at that location

## Add-Location
Given a location and a collection of items, add the items to the inventory of the location.
Returns a list of any items that had errors while adding to the inventory.

## Allocate
Given a location, an order id, and a collection of items -- assign the items of the query to the order IF there is enough inventory and the items are not already assigned to the order

## Collect
Deletes given items from the inventory if they have been previously allocated to the given order.
Returns a list of items that had errors and could not be collected.
