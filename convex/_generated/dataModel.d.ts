// Hand-written equivalent of the generated files so the repo type-checks without a live Convex deployment. Regenerate with: npx convex dev
import type { DataModelFromSchemaDefinition, TableNamesFromDataModel } from "convex/server";
import type { DocumentByName, Id as ConvexId } from "convex/values";
import schema from "../schema";

export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
export type TableNames = TableNamesFromDataModel<DataModel>;
export type Doc<TableName extends TableNames> = DocumentByName<DataModel, TableName>;
export type Id<TableName extends TableNames> = ConvexId<TableName>;
