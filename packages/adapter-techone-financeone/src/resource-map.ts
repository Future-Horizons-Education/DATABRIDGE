/**
 * Mapping from canonical {@link SupportedResource} to TechOne Connect
 * REST API resource path (under `/connect/api/v1/`).
 *
 * Centralised so the adapter, tests, and any future docs all agree
 * on the wire layout. See docs/TECHONE_DATA_STRUCTURES.md §14.
 */
import type { SupportedResource } from "./adapter.js";

export const CONNECT_RESOURCE_PATH: Readonly<Record<SupportedResource, string>> = {
  Customers: "financials/ar/customers",
  Sponsors: "financials/ar/sponsors",
  Products: "financials/products",
  PriceLists: "financials/price-lists",
  Invoices: "financials/ar/invoices",
  CreditNotes: "financials/ar/credit-notes",
  Receipts: "financials/ar/receipts",
  Allocations: "financials/ar/allocations",
  GlPostings: "financials/gl/postings",
  ExchangeRates: "financials/gl/exchange-rates",
  WorkflowInstances: "workflow/instances",
  ImportStaging: "financials/import-staging",
};

/** Canonical primary-key field for each resource (used by getRecordById). */
export const CONNECT_RESOURCE_PK: Readonly<Record<SupportedResource, string>> = {
  Customers: "CustomerCode",
  Sponsors: "CustomerCode",
  Products: "ProductCode",
  PriceLists: "PriceListCode",
  Invoices: "TransactionId",
  CreditNotes: "TransactionId",
  Receipts: "TransactionId",
  Allocations: "AllocationId",
  GlPostings: "GlTransactionId",
  ExchangeRates: "ExchangeRateId",
  WorkflowInstances: "InstanceId",
  ImportStaging: "StagingRowId",
};
