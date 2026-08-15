import { assertDestructiveTestDatabaseSafety } from "./destructive-test-database";

const database = assertDestructiveTestDatabaseSafety();

console.log(`Validated disposable test database: ${database.databaseName}.`);
